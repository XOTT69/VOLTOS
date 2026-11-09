import { describe, expect, it } from 'vitest';
import { summarize, fresh, runtimeMinutes, validSamples, appendSample, series, chartPaths, csv, climateCapability, type Sample } from '../src/core';
import { frame, validFrame, crc16, allowedWrite } from '../src/protocol';
const now = Date.now();
const sample: Sample = { at: now - 1000, source: 'bluetti', deviceId: 'A', soc: 50, input: 0, output: 120 };
describe('telemetry integrity', () => {
 it('preserves missing readings instead of reporting a measured zero', () => {
  expect(summarize([])).toEqual({ input: null, output: null, soc: null, stored: null });
  expect(summarize([{ soc: null, input: null, output: 0, capacity: 2048 }])).toEqual({ input: null, output: 0, soc: null, stored: null });
 });
 it('weights reserve by capacity and rejects an incomplete total', () => {
  const result = summarize([{ soc: 100, input: 0, output: 10, capacity: 200 }, { soc: 0, input: 100, output: 20, capacity: 1800 }]);
  expect(result).toEqual({ soc: 10, stored: 200, input: 100, output: 30 });
  expect(summarize([{ soc: 50, input: 0, output: null, capacity: 200 }]).output).toBeNull();
 });
 it('does not treat invalid, future or old timestamps as fresh', () => {
  expect(fresh(new Date(now - 10000).toISOString(), 45000, now)).toBe(true);
  for (const date of [null, 'bad', new Date(now - 50000).toISOString(), new Date(now + 10000).toISOString()]) expect(fresh(date, 45000, now)).toBe(false);
 });
 it('marks runtime as an estimate and preserves unknown input', () => {
  expect(runtimeMinutes(50, 100, 1000)).toBe(252);
  expect(runtimeMinutes(null, 100, 1000)).toBeNull();
  expect(runtimeMinutes(50, 0, 1000)).toBeNull();
 });
 it('checks actual climate capabilities independently for on and off', () => {
  expect(climateCapability(['on'], 'power', false)).toBe(false);
  expect(climateCapability(['on'], 'power', true)).toBe(true);
  expect(climateCapability(['setTargetTemperature'], 'temperature')).toBe(true);
  expect(climateCapability([], 'mode')).toBe(false);
 });
});
describe('history and export', () => {
 it('filters corrupt and future samples, retaining actual zeroes', () => {
  const bad = [null, {}, { ...sample, soc: 101 }, { ...sample, input: '10' }, { ...sample, output: Infinity }, { ...sample, at: now + 9000 }, { ...sample, at: now - 31 * 86400000 }];
  expect(validSamples([...bad, sample], now)).toEqual([sample]);
 });
 it('samples each device separately without mixing stations', () => {
  const other = { ...sample, deviceId: 'B', at: now };
  const result = appendSample([sample], other, now);
  expect(result).toHaveLength(2);
  expect(appendSample(result, { ...other, at: now + 1000 }, now)).toHaveLength(2);
  expect(series(result, 'bluetti', 'A', 'soc', 24, now)).toEqual([sample]);
 });
 it('uses elapsed time on the x axis and leaves offline gaps', () => {
  const rows = [{ ...sample, at: now - 3500000 }, { ...sample, at: now - 3400000 }, { ...sample, at: now - 1000 }];
  const paths = chartPaths(rows, 'soc', 1, now);
  expect(paths.line.match(/M/g)).toHaveLength(2);
  expect(paths.line).toContain('M2.778,');
  expect(paths.line).toContain('M99.972,');
 });
 it('exports real CRLF rows, quoted IDs and formula-safe cells', () => {
  const output = csv([sample, { ...sample, deviceId: '=HYPERLINK("evil")' }]);
  expect(output.split('\r\n')).toHaveLength(3);
  expect(output).not.toContain('\\n');
  expect(output).toContain('"\'=HYPERLINK(""evil"")"');
  expect(output.charCodeAt(0)).toBe(0xfeff);
 });
});
describe('BLE write boundary', () => {
 it('uses the Modbus CRC known vector and rejects a damaged frame', () => {
  expect(crc16([1, 3, 0, 0, 0, 10])).toBe(0xcdc5);
  const bytes = frame(6, 3007, 1);
  expect(validFrame(bytes)).toBe(true); bytes[4] ^= 1;
  expect(validFrame(bytes)).toBe(false);
 });
 it('blocks arbitrary registers and unsupported values', () => {
  expect(allowedWrite(3007, 0)).toBe(true);
  expect(allowedWrite(3064, 4)).toBe(true);
  expect(allowedWrite(3007, 2)).toBe(false);
  expect(allowedWrite(3034, 0)).toBe(false);
  expect(allowedWrite(1, 1)).toBe(false);
  expect(allowedWrite(3065, NaN)).toBe(false);
 });
});

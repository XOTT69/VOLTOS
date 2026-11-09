import { beforeEach, expect, it, vi } from 'vitest';
import { crc16 } from '../src/protocol';
const transport = vi.hoisted(() => ({ notify: null as ((value: DataView) => void) | null, disconnected: null as (() => void) | null, unsupported: false, writeFailure: false, name: 'EB3A-test', values: new Map<number, number>() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-community/bluetooth-le', () => ({
 numbersToDataView: (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer),
 BleClient: {
  initialize: vi.fn(), requestDevice: async () => ({ deviceId: 'test-station', name: transport.name }),
  connect: async (_id: string, callback: () => void) => { transport.disconnected = callback; },
  startNotifications: async (_id: string, _service: string, _char: string, callback: (view: DataView) => void) => { transport.notify = callback; },
  stopNotifications: vi.fn(), disconnect: vi.fn(),
  writeWithoutResponse: async (_id: string, _service: string, _char: string, frame: DataView) => {
   if (transport.writeFailure) throw Error('transport failed');
   const bytes = [...new Uint8Array(frame.buffer)], fn = bytes[1], address = bytes[2] * 256 + bytes[3], count = bytes[4] * 256 + bytes[5];
   let reply: number[];
   if (address === 3007 && transport.unsupported) reply = [1, 0x83, 2];
   else if (fn === 6) { transport.values.set(address, count); reply = bytes.slice(0, 6); }
   else {
    const values = Array.from({ length: count }, (_, i) => transport.values.get(address + i) ?? 0);
    reply = [1, 3, count * 2, ...values.flatMap(value => [value >> 8, value & 255])];
   }
   const crc = crc16(reply); reply.push(crc & 255, crc >> 8);
   // Real BLE replies can arrive in several notifications.
   for (let offset = 0; offset < reply.length; offset += 17) transport.notify?.(new DataView(Uint8Array.from(reply.slice(offset, offset + 17)).buffer));
  },
 },
}));
import { Eb3aBle } from '../src/eb3a';
beforeEach(() => { transport.unsupported = false; transport.writeFailure = false; transport.name = 'EB3A-test'; transport.values = new Map([[36, 5], [37, 0], [38, 100], [39, 20], [43, 75], [3007, 1], [3008, 0]]); });
it('reassembles fragmented responses and reads measured power', async () => {
 const ble = new Eb3aBle(); await ble.connect(); const reading = await ble.refresh();
 expect(reading).toMatchObject({ soc: 75, inputWatts: 5, outputWatts: 120, deviceId: 'test-station', acEnabled: true, dcEnabled: false });
 await ble.disconnect();
});
it('retains valid telemetry when firmware does not support switch readback', async () => {
 transport.unsupported = true; const ble = new Eb3aBle(); await ble.connect();
 expect(await ble.refresh()).toMatchObject({ soc: 75, acEnabled: null, dcEnabled: null }); await ble.disconnect();
});
it('requires valid optional register values and independently verifies writes', async () => {
 transport.values.set(3063, 255); transport.values.set(3065, 1); const ble = new Eb3aBle(); await ble.connect();
 const controls = await ble.readControls(); expect(controls.eco).toBeNull(); expect(controls.chargeMode).toBe(1);
 await expect(ble.setRegister(3065, 2)).resolves.toBe(2);
 await expect(ble.setRegister(100, 1)).rejects.toThrow('Недозволене'); await ble.disconnect();
});
it('recovers its queue after a write transport failure without unhandled rejections', async () => {
 const ble = new Eb3aBle(); await ble.connect(); transport.writeFailure = true;
 await expect(ble.refresh()).rejects.toThrow('transport failed'); transport.writeFailure = false;
 await expect(ble.refresh()).resolves.toMatchObject({ soc: 75 }); await ble.disconnect();
});
it('does not let another BLUETTI model use the EB3A register map', async () => {
 transport.name = 'BLUETTI AC200'; const ble = new Eb3aBle(); await expect(ble.connect()).rejects.toThrow('саме EB3A'); expect(ble.connected).toBe(false);
});

import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ endpoint: vi.fn() }));
vi.mock('../src/native-api', () => ({ endpoint: mock.endpoint }));
import { oukitel } from '../src/oukitel';
import { atlantic } from '../src/atlantic';
const device = { deviceKey: 'D', productKey: 'P', deviceName: 'Station', productName: 'P2001E Plus', online: true };
beforeEach(() => mock.endpoint.mockReset());
it('uses authoritative Oukitel online state from the response', async () => {
 mock.endpoint.mockResolvedValue({ device: { ...device, online: false }, cloudCheckedAt: new Date().toISOString(), raw: { data: { customizeTslInfo: [{ abId: '1', resourceValce: '50' }] } } });
 const reading = await oukitel.state(device); expect(reading.device.online).toBe(false); expect(reading.inputWatts).toBeNull();
});
it('does not turn corrupt booleans or blank strings into measured zero watts', async () => {
 mock.endpoint.mockResolvedValue({ device, cloudCheckedAt: new Date().toISOString(), raw: { data: { customizeTslInfo: [{ abId: '1', resourceValce: 50 }, { abId: '4', resourceValce: false }, { abId: '5', resourceValce: ' ' }] } } });
 const reading = await oukitel.state(device); expect(reading.inputWatts).toBeNull(); expect(reading.outputWatts).toBeNull();
});
it('rejects a mismatched cloud device identity', async () => {
 mock.endpoint.mockResolvedValue({ device: { ...device, deviceKey: 'OTHER' }, cloudCheckedAt: new Date().toISOString() });
 await expect(oukitel.state(device)).rejects.toThrow('некоректні');
});
it('rejects a malformed climate payload before rendering command controls', async () => {
 mock.endpoint.mockResolvedValue({ deviceOnline: true, gatewayOnline: true, commands: undefined });
 await expect(atlantic.state()).rejects.toThrow('некоректні');
});

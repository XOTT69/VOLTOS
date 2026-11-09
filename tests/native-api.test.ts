import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request: mocks.request } }));
vi.mock('../src/native', () => ({ native: true, SecureSession: { getSession: mocks.get, setSession: mocks.set, removeSession: mocks.remove } }));
beforeEach(() => {
 vi.resetModules(); mocks.get.mockResolvedValue({}); mocks.set.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());
it('restores native authorization from Keychain, never localStorage', async () => {
 mocks.get.mockResolvedValue({ value: 'stored-session' });
 mocks.request.mockResolvedValue({ status: 200, data: { connected: true } });
 const { endpoint } = await import('../src/native-api'); await endpoint('oukitel', 'session');
 expect(mocks.request.mock.calls[0][0].headers.Authorization).toBe('Bearer stored-session');
});
it('stores a login session securely and strips it from the returned payload', async () => {
 mocks.request.mockResolvedValue({ status: 200, data: { connected: true, nativeToken: 'new-session' } });
 const { endpoint } = await import('../src/native-api'); const result = await endpoint('oukitel', 'login', 'POST', { email: 'test@example.com', password: 'test-only' });
 expect(mocks.set).toHaveBeenCalledWith({ key: 'oukitel', value: 'new-session' });
 expect(result).toEqual({ connected: true });
});
it('clears expired sessions on 401 and does not attach the old token again', async () => {
 mocks.get.mockResolvedValue({ value: 'expired' }); mocks.request.mockResolvedValue({ status: 401, data: { error: 'Сесію завершено' } });
 const { endpoint } = await import('../src/native-api'); await expect(endpoint('atlantic', 'state')).rejects.toMatchObject({ status: 401 });
 expect(mocks.remove).toHaveBeenCalledWith({ key: 'atlantic' });
 mocks.request.mockResolvedValue({ status: 200, data: { authenticated: false } }); await endpoint('atlantic', 'session');
 expect(mocks.request.mock.calls[1][0].headers.Authorization).toBeUndefined();
});
it('permits local native logout even when the network is unavailable', async () => {
 mocks.get.mockResolvedValue({ value: 'valid-session' }); mocks.request.mockRejectedValue(new Error('offline'));
 const { endpoint } = await import('../src/native-api'); await expect(endpoint('oukitel', 'logout', 'POST')).resolves.toMatchObject({ connected: false });
 expect(mocks.remove).toHaveBeenCalledWith({ key: 'oukitel' });
});
it('retries a temporarily locked Keychain instead of caching its failure forever', async () => {
 mocks.get.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce({ value: 'available' });
 mocks.request.mockResolvedValue({ status: 200, data: {} });
 const { endpoint } = await import('../src/native-api'); await expect(endpoint('oukitel', 'session')).rejects.toThrow('locked');
 await endpoint('oukitel', 'session'); expect(mocks.get).toHaveBeenCalledTimes(2);
});

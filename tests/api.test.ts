import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import bridge from '../api/bridge';
import oukitel from '../api/oukitel';
import { validClimateCommand, type ApiRequest, type ApiResponse } from '../server/http';
function response() {
 const result = { code: 200, payload: null as unknown, headers: {} as Record<string, unknown>,
  status(code: number) { this.code = code; return this; },
  json(payload: unknown) { this.payload = payload; return this; },
  setHeader(key: string, value: unknown) { this.headers[key] = value; return this; },
 };
 return result;
}
const request = (action: string, method = 'POST', body?: Record<string, unknown>): ApiRequest => ({ method, query: { action }, headers: { host: 'voltos.test', origin: 'https://voltos.test' }, body });
function session() {
 const data = Buffer.from(JSON.stringify({ expires: Date.now() + 60000 })).toString('base64url');
 const tag = createHmac('sha256', 'a'.repeat(40)).update(data).digest('base64url');
 return `voltos_session=${data}.${tag}`;
}
beforeEach(() => {
 vi.stubEnv('VOLTOS_SESSION_SECRET', 'a'.repeat(40)); vi.stubEnv('VOLTOS_BRIDGE_SECRET', 'b'.repeat(40)); vi.stubEnv('ATLANTIC_BRIDGE_URL', 'https://atlantic.test/');
 vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Atlantic access boundary', () => {
 it('rejects an unauthenticated state request without calling the provider', async () => {
  const res = response(); await bridge(request('state', 'GET'), res);
  expect(res.code).toBe(401); expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects cross-origin login', async () => {
  const req = request('login', 'POST', { password: 'test-only' }); req.headers.origin = 'https://evil.test';
  const res = response(); await bridge(req, res); expect(res.code).toBe(403);
 });
 it('returns 401 for an upstream 200 with verified false', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ verified: false }), { status: 200 }));
  const res = response(); await bridge(request('login', 'POST', { password: 'test-only' }), res);
  expect(res.code).toBe(401); expect(res.headers['Set-Cookie']).toBeUndefined();
 });
 it('handles a null upstream body without crashing', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('null', { status: 200 }));
  const res = response(); await bridge(request('login', 'POST', { password: 'test-only' }), res); expect(res.code).toBe(401);
 });
 it('rejects a forged or malformed session', async () => {
  for (const cookie of ['voltos_session=anything.forged', session() + '.extra']) {
   const req = request('state', 'GET'); req.headers.cookie = cookie;
   const res = response(); await bridge(req, res); expect(res.code).toBe(401);
  }
 });
 it('validates physical commands before relaying', async () => {
  const req = request('control', 'POST', { action: 'temperature', value: 35 }); req.headers.cookie = session();
  const res = response(); await bridge(req, res); expect(res.code).toBe(400); expect(fetch).not.toHaveBeenCalled();
 });
 it('uses a private bearer only for a verified native request', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ verified: true })));
  const req = request('login', 'POST', { password: 'test-only' }); delete req.headers.origin; req.headers['x-voltos-native'] = '1';
  const res = response(); await bridge(req, res);
  expect(res.code).toBe(200); expect(res.payload).toMatchObject({ authenticated: true, nativeToken: expect.any(String) });
  expect(res.headers['Set-Cookie']).toBeUndefined();
 });
});
describe('command schema and Oukitel configuration', () => {
 it('allows only the expected temperature step, modes and boolean power', () => {
  expect(validClimateCommand('temperature', 20.5)).toBe(true);
  expect(validClimateCommand('temperature', 20.3)).toBe(false);
  expect(validClimateCommand('temperature', '20')).toBe(false);
  expect(validClimateCommand('power', 'false')).toBe(false);
  expect(validClimateCommand('mode', 'arbitrary')).toBe(false);
 });
 it('reports missing server configuration as 503 rather than invalid credentials', async () => {
  vi.stubEnv('OUKITEL_APP_SECRET', '');
  const res = response(); await oukitel(request('login', 'POST', { email: 'test@example.com', password: 'test-only' }), res);
  expect(res.code).toBe(503); expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects cloud control without an authenticated session', async () => {
  const res = response(); await oukitel(request('control', 'POST', { pk: 'a', dk: 'b', on: false, port: 'ac' }), res);
  expect(res.code).toBe(401); expect(fetch).not.toHaveBeenCalled();
 });
});
describe('Oukitel ownership and provider responses', () => {
 const owned = { productKey: 'P', deviceKey: 'D', deviceName: 'Test', productName: 'P2001E Plus', online: true };
 async function signedIn(online = true) {
  vi.stubEnv('OUKITEL_APP_SECRET', 'test-only-app-secret');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { accessToken: { token: 'test-only-provider-token' } } })))
   .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { list: [{ ...owned, online }] } })));
  const req = request('login', 'POST', { email: 'test@example.com', password: 'test-only' }); delete req.headers.origin; req.headers['x-voltos-native'] = '1';
  const res = response(); await oukitel(req, res); expect(res.code).toBe(200);
  const token = (res.payload as { nativeToken: string }).nativeToken;
  return { 'x-voltos-native': '1', authorization: 'Bearer ' + token };
 }
 it('does not interpret a 200 body without a provider success code as success', async () => {
  vi.stubEnv('OUKITEL_APP_SECRET', 'test-only-app-secret');
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'rejected', data: { accessToken: { token: 'not-valid' } } })));
  const res = response(); await oukitel(request('login', 'POST', { email: 'test@example.com', password: 'test-only' }), res);
  expect(res.code).toBe(401); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('blocks a command to a device outside the bound account', async () => {
  const headers = await signedIn();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { list: [owned] } })));
  const req = request('control', 'POST', { pk: 'P', dk: 'OTHER', port: 'ac', on: false }); req.headers = headers;
  const res = response(); await oukitel(req, res); expect(res.code).toBe(403);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('batchControlDevice'))).toBe(false);
 });
 it('blocks a command after the server discovers that a station is offline', async () => {
  const headers = await signedIn();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { list: [{ ...owned, online: false }] } })));
  const req = request('control', 'POST', { pk: 'P', dk: 'D', port: 'ac', on: false }); req.headers = headers;
  const res = response(); await oukitel(req, res); expect(res.code).toBe(409);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('batchControlDevice'))).toBe(false);
 });
 it('returns 401 when the provider token expires so the native client can clear it', async () => {
  const headers = await signedIn(); vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 401 }), { status: 401 }));
  const req = request('devices', 'GET'); req.headers = headers;
  const res = response(); await oukitel(req, res); expect(res.code).toBe(401);
 });
});

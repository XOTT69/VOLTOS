import { CapacitorHttp } from '@capacitor/core';
import { native, SecureSession } from './native';

const BACKEND = import.meta.env.VITE_API_BASE || 'https://voltos-belli.vercel.app';
export type Integration = 'atlantic' | 'oukitel';
const tokens: Partial<Record<Integration, string>> = {};
const restored: Partial<Record<Integration, Promise<void>>> = {};
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function clearNativeToken(which: Integration) {
  delete tokens[which];
  if (native) await SecureSession.removeSession({ key: which });
}
async function restoreToken(which: Integration) {
  if (!native) return;
  restored[which] ??= SecureSession.getSession({ key: which }).then(result => { if (result?.value) tokens[which] = result.value; }).catch(error => { delete restored[which]; throw error; });
  await restored[which];
}
export async function endpoint<T>(which: Integration, action: string, method: 'GET' | 'POST' = 'GET', payload?: unknown, params?: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ action, ...params });
  const path = `/api/${which === 'atlantic' ? 'bridge' : 'oukitel'}?${query}`;
  await restoreToken(which);
  let status: number, data: Record<string, unknown>;
  try {
    if (native) {
      const base = new URL(BACKEND);
      if (base.protocol !== 'https:' || base.username || base.password) throw Error('API потребує захищеного HTTPS-підключення');
      const response = await CapacitorHttp.request({
        url: base.origin + path, method,
        headers: { 'X-VOLTOS-NATIVE': '1', ...(tokens[which] ? { Authorization: 'Bearer ' + tokens[which] } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'POST' ? { data: payload ?? {} } : {}), connectTimeout: 12000, readTimeout: 23000,
      });
      status = response.status;
      data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } else {
      const response = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(25000),
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}) } : {}),
      });
      status = response.status;
      data = await response.json();
    }
  } catch (error) {
    if (action === 'logout' && native) { await clearNativeToken(which); return { authenticated: false, connected: false } as T; }
    throw new ApiError(error instanceof Error && error.name === 'TimeoutError' ? 'Сервер не відповів вчасно. Спробуй ще раз.' : 'Не вдалося зв’язатися із сервером. Перевір інтернет і повтори.', 0);
  }
  if (action === 'logout' || status === 401) await clearNativeToken(which);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('Сервер повернув некоректні дані', status);
  if (status < 200 || status >= 300) throw new ApiError(typeof data.error === 'string' ? data.error : `Сервіс недоступний (${status})`, status);
  if (native && action === 'login' && typeof data.nativeToken === 'string') {
    await SecureSession.setSession({ key: which, value: data.nativeToken });
    tokens[which] = data.nativeToken;
  }
  delete data.nativeToken;
  return data as T;
}

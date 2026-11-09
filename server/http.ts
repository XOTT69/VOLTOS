import type { IncomingHttpHeaders } from 'node:http';
// Structural types: the runtime is supplied by Vercel, no server SDK is bundled.
export interface ApiRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
}
export interface ApiResponse {
  setHeader(name: string, value: string | string[]): unknown;
  status(code: number): ApiResponse;
  json(payload: unknown): ApiResponse;
}
export function validClimateCommand(action: unknown, value: unknown): boolean {
  if (action === 'power') return typeof value === 'boolean';
  if (action === 'temperature') return typeof value === 'number' && Number.isFinite(value) && value >= 7 && value <= 30 && Number.isInteger(value * 2);
  return action === 'mode' && typeof value === 'string' && ['normal', 'eco', 'manual', 'prog', 'antifreeze'].includes(value);
}

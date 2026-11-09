export type Source = 'bluetti' | 'oukitel' | 'atlantic';
export type Metric = 'soc' | 'input' | 'output' | 'room' | 'target';
export type Sample = {
  at: number;
  source: Source;
  deviceId: string;
  transport?: 'cloud' | 'lan';
  soc?: number | null;
  input?: number | null;
  output?: number | null;
  room?: number | null;
  target?: number | null;
};
export type Battery = {
  soc: number | null;
  input: number | null;
  output: number | null;
  capacity: number;
};
export const RETENTION = 30 * 86400000;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const inRange = (v: unknown, min: number, max: number): v is number => finite(v) && v >= min && v <= max;
export function fresh(date: string | undefined | null, ttl: number, now = Date.now()): boolean {
  const at = date ? Date.parse(date) : NaN;
  return Number.isFinite(at) && at <= now + 5000 && now - at < ttl;
}
export function summarize(batteries: Battery[]) {
  // Unknown readings must never become measured zeroes. Stale sources are excluded by the caller.
  const total = (field: 'input' | 'output') => !batteries.length || batteries.some(b => b[field] === null)
    ? null : batteries.reduce((sum, b) => sum + b[field]!, 0);
  const complete = batteries.length > 0 && batteries.every(b => b.soc !== null);
  const capacity = batteries.reduce((sum, b) => sum + b.capacity, 0);
  const stored = complete ? batteries.reduce((sum, b) => sum + b.capacity * b.soc! / 100, 0) : null;
  return { input: total('input'), output: total('output'), stored, soc: stored !== null && capacity > 0 ? Math.round(stored / capacity * 100) : null };
}
export function runtimeMinutes(soc: number | null, watts: number | null, capacity: number): number | null {
  if (!inRange(soc, 0, 100) || !finite(watts) || watts <= 2 || !inRange(capacity, 100, 100000)) return null;
  return Math.round(capacity * soc / 100 * .84 / watts * 60);
}
export function validSamples(raw: unknown, now = Date.now()): Sample[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is Sample => {
    if (!p || typeof p !== 'object' || !inRange(p.at, now - RETENTION, now + 5000) ||
        !['bluetti', 'oukitel', 'atlantic'].includes(p.source) || typeof p.deviceId !== 'string' || !p.deviceId || p.deviceId.length > 200) return false;
    if(p.transport !== undefined && p.transport !== 'cloud' && p.transport !== 'lan') return false;
    const keys = p.source === 'atlantic' ? ['room', 'target'] : ['soc', 'input', 'output'];
    return keys.some(k => finite(p[k])) && keys.every(k => p[k] == null ||
      (k === 'soc' ? inRange(p[k], 0, 100) : k === 'room' || k === 'target' ? inRange(p[k], -40, 80) : inRange(p[k], 0, 100000)));
  }).sort((a, b) => a.at - b.at).slice(-130000);
}
export function appendSample(samples: Sample[], item: Sample, now = Date.now()): Sample[] {
  if (!validSamples([item], now).length) return samples;
  const previous = samples.findLast(p => p.source === item.source && p.deviceId === item.deviceId);
  if (previous && item.at - previous.at < 60000) return samples;
  return validSamples([...samples, item], now);
}
export function series(samples: Sample[], source: Source, deviceId: string, metric: Metric, hours: number, now = Date.now()) {
  return samples.filter(p => p.source === source && p.deviceId === deviceId &&
    p.at >= now - hours * 3600000 && p.at <= now && finite(p[metric]));
}
export function chartPaths(samples: Sample[], metric: Metric, hours: number, now = Date.now()): { line: string; area: string; max: number; min: number } {
  const values = samples.map(p => p[metric]).filter(finite);
  const min = metric === 'room' || metric === 'target' ? Math.floor(Math.min(...values, 20) - 1) : 0;
  const max = Math.max(min + 1, ...values) * (metric === 'soc' ? 1 : 1.08);
  const start = now - hours * 3600000;
  let line = '', area = '', previous = 0, segment = '';
  // Position by timestamps; never draw a continuous measurement across long offline gaps.
  const flush = () => { if (segment) { const first = segment.match(/M([\d.]+),/)?.[1]; area += segment + ` L${previousX},100 L${first},100 Z `; segment = ''; } };
  let previousX = '0';
  for (const p of samples) {
    const v = p[metric]; if (!finite(v)) continue;
    const x = ((p.at - start) / (hours * 3600000) * 100).toFixed(3);
    const y = (95 - (v - min) / (max - min) * 88).toFixed(3);
    if (!previous || p.at - previous > 10 * 60000) { flush(); line += ` M${x},${y}`; segment = `M${x},${y}`; }
    else { line += ` L${x},${y}`; segment += ` L${x},${y}`; }
    previous = p.at; previousX = x;
  }
  flush();
  return { line, area, min, max };
}
export function csv(samples: Sample[]): string {
  const escape = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+@\-]/, "'$&") + '"';
  return '\uFEFF' + [
    'observed_at,source,device_id,soc_percent,input_w,output_w,room_c,target_c',
    ...samples.map(p => [new Date(p.at).toISOString(), p.source === 'oukitel' ? p.transport === 'lan' ? 'oukitel_lan' : 'oukitel_cloud_snapshot' : p.source === 'bluetti' ? 'bluetti_ble' : 'atlantic_cozytouch', p.deviceId, p.soc, p.input, p.output, p.room, p.target].map(escape).join(',')),
  ].join('\r\n');
}
export function climateCapability(commands: string[], action: 'power' | 'temperature' | 'mode', on = true): boolean {
  return commands.includes(action === 'temperature' ? 'setTargetTemperature' : action === 'mode' ? 'setOperatingMode' : on ? 'on' : 'off');
}

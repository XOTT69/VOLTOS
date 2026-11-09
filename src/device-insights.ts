import { type Sample, type Source, runtimeMinutes } from './core';
export function energyEstimate(samples: Sample[], source: Source, deviceId: string, now = Date.now()) {
 const points = samples.filter(p => p.source === source && p.deviceId === deviceId && p.at >= now - 86400000 && p.at <= now).sort((a,b) => a.at-b.at);
 let outputWh = 0, inputWh = 0, coveredMs = 0;
 for (let i = 1; i < points.length; i++) {
  const a = points[i-1], b = points[i], elapsed = b.at-a.at;
  if (elapsed <= 0 || elapsed > 180000 || a.transport !== b.transport || a.output == null || b.output == null) continue;
  outputWh += (a.output+b.output)/2 * elapsed/3600000; coveredMs += elapsed;
  if (a.input != null && b.input != null) inputWh += (a.input+b.input)/2 * elapsed/3600000;
 }
 return { outputWh, inputWh, coveredMinutes: Math.round(coveredMs/60000), hasCoverage: coveredMs > 0 };
}
export function chargeMinutes(soc: number | null, input: number | null, output: number | null, capacity: number) {
 if (soc == null || input == null || output == null || input-output <= 2 || soc < 0 || soc > 100) return null;
 return Math.round(capacity*(100-soc)/100/(input-output)*60);
}
export function planLoads(soc: number | null, capacity: number) {
 return [{ name: 'Зв’язок', watts: 20, detail: 'Роутер + ONU' }, { name: 'Робота', watts: 80, detail: 'Ноутбук + мережа' }, { name: 'Світло', watts: 40, detail: 'LED + заряджання' }].map(load => ({ ...load, minutes: runtimeMinutes(soc, load.watts, capacity) }));
}

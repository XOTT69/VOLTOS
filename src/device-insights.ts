import { type Sample, type Source, runtimeMinutes, inRange } from './core';
export function batteryForecast(soc: number | null, input: number | null, output: number | null, capacity: number, reserve = 20, reportedMinutes?: number | null) {
 const valid = inRange(soc,0,100) && inRange(input,0,100000) && inRange(output,0,100000) && inRange(capacity,100,100000) && inRange(reserve,0,90);
 const net = valid ? output! - input! : null;
 const mode = net === null ? 'unknown' : net > 2 ? 'discharging' : net < -2 ? 'charging' : 'balanced';
 const fromStation = mode === 'discharging' && inRange(reportedMinutes,1,5939);
 const minutes = mode === 'discharging' ? fromStation ? Math.round(reportedMinutes!) : runtimeMinutes(soc,net,capacity) : null;
 const reserveMinutes = minutes === null ? null : soc! <= reserve ? 0 : Math.round(minutes * (soc!-reserve) / soc!);
 const usableWh = valid ? capacity * Math.max(0,soc!-reserve)/100 * .84 : null;
 return { mode, netWatts: net, minutes, reserveMinutes, usableWh, fromStation, chargingMinutes: mode === 'charging' ? chargeMinutes(soc,input,output,capacity) : null };
}
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

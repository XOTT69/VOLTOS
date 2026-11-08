export interface EnergyDevice {
  id: string;
  brand: string;
  model: string;
  batteryPercent: number;
  inputWatts: number;
  outputWatts: number;
  capacityWh: number;
  connection: 'cloud' | 'bluetooth' | 'lan';
  status: 'demo' | 'online' | 'offline' | 'stale';
  measuredAt: string | null;
}

// Demo fixtures: never present as live or user-owned devices.
export const demoDevices: EnergyDevice[] = [
  { id: 'oukitel-demo', brand: 'OUKITEL', model: 'P2001E Plus', batteryPercent: 84, inputWatts: 780, outputWatts: 68, capacityWh: 2048, connection: 'cloud', status: 'demo', measuredAt: null },
  { id: 'bluetti-demo', brand: 'BLUETTI', model: 'EB3A', batteryPercent: 67, inputWatts: 0, outputWatts: 21, capacityWh: 268.8, connection: 'bluetooth', status: 'demo', measuredAt: null },
];
export function durationLabel(device: EnergyDevice): string {
  if (device.outputWatts <= 0) return 'Немає розряду';
  const h = (device.capacityWh * device.batteryPercent / 100 * 0.82) / device.outputWatts;
  return h < 1 ? `≈ ${Math.round(h * 60)} хв` : `≈ ${h.toFixed(1)} год`;
}

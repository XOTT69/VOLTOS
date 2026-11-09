export function crc16(bytes: readonly number[]): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc;
}
export function frame(fn: number, address: number, value: number): number[] {
  const bytes = [1, fn, address >> 8, address & 255, value >> 8, value & 255];
  const crc = crc16(bytes);
  return [...bytes, crc & 255, crc >> 8];
}
export function validFrame(bytes: number[]): boolean {
  if (bytes.length < 5) return false;
  const crc = crc16(bytes.slice(0, -2));
  return bytes.at(-2) === (crc & 255) && bytes.at(-1) === (crc >> 8);
}
export const registers = {
  ac: { address: 3007, values: [0, 1] }, dc: { address: 3008, values: [0, 1] },
  led: { address: 3034, values: [1, 2, 3, 4] }, eco: { address: 3063, values: [0, 1] },
  ecoTime: { address: 3064, values: [1, 2, 3, 4] }, chargeMode: { address: 3065, values: [0, 1, 2] },
  lifting: { address: 3066, values: [0, 1] },
} as const;
export type Control = keyof typeof registers;
export type BleControls = Record<'led' | 'eco' | 'ecoTime' | 'chargeMode' | 'lifting', number | null>;
export function allowedWrite(address: number, value: number): boolean {
  return Object.values(registers).some(r => r.address === address && (r.values as readonly number[]).includes(value));
}

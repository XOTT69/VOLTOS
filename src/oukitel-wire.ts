// Quectel LAN protocol, independently implemented from the public MIT research.
// See THIRD-PARTY-NOTICES.md and docs/OUKITEL-LAN.md.
export type TtlvValue = number | boolean | string | { [tag: number]: TtlvValue };
export type Fields = Record<number, TtlvValue>;
export const u16 = (value: number) => [value >>> 8 & 255, value & 255];
const word = (bytes: number[], at: number) => bytes[at] * 256 + bytes[at + 1];
export function privateIPv4(host: string): boolean {
 const parts = host.split('.');
 if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255 || String(Number(p)) !== p)) return false;
 const [a,b,c,d] = parts.map(Number);
 return d !== 0 && d !== 255 && !(a === 169 && b === 254 && c === 0) && (a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 169 && b === 254);
}
export function authBytes(value: string): Uint8Array<ArrayBuffer> {
 let binary: string;
 try { binary = atob(value.trim()); } catch { throw Error('Ключ станції має бути Base64'); }
 if (binary.length !== 16) throw Error('Ключ станції повинен містити 16 байтів');
 return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export function encodeFields(fields: [number, 'bool' | 'num' | 'string', boolean | number | string][]): Uint8Array<ArrayBuffer> {
 const output: number[] = [];
 for (const [tag, type, value] of fields) {
  if (!Number.isInteger(tag) || tag < 0 || tag > 8191) throw Error('Некоректний тег');
  if (type === 'bool') { if (typeof value !== 'boolean') throw Error('Очікується bool'); output.push(...u16(tag * 8 + Number(value))); }
  if (type === 'num') {
   if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw Error('Очікується ціле число');
   let n = Math.abs(value); const bytes: number[] = [];
   do { bytes.unshift(n % 256); n = Math.floor(n / 256); } while (n);
   output.push(...u16(tag * 8 + 2), (value < 0 ? 128 : 0) | bytes.length - 1, ...bytes);
  }
  if (type === 'string') {
   const bytes = [...new TextEncoder().encode(String(value))]; if (bytes.length > 4096) throw Error('Завелике поле');
   output.push(...u16(tag * 8 + 3), ...u16(bytes.length), ...bytes);
  }
 }
 return Uint8Array.from(output);
}
export function decodeFields(input: Uint8Array): Fields {
 const bytes = [...input]; let offset = 0;
 const take = (count: number) => { if (count < 0 || offset + count > bytes.length) throw Error('Неповне TTLV-повідомлення'); const out = bytes.slice(offset, offset + count); offset += count; return out; };
 const readWord = () => { const b = take(2); return word(b, 0); };
 const field = (depth: number): [number, TtlvValue] => {
  if (depth > 4) throw Error('Завелика вкладеність TTLV');
  const head = readWord(), tag = head >>> 3, type = head & 7;
  if (type <= 1) return [tag, type === 1];
  if (type === 2) {
   const control = take(1)[0], length = (control & 7) + 1;
   let value = take(length).reduce((n, b) => n * 256 + b, 0);
   if (!Number.isSafeInteger(value)) throw Error('Число TTLV поза діапазоном');
   value = value * (control & 128 ? -1 : 1) / 10 ** (control >>> 3 & 15); return [tag, value];
  }
  if (type === 3 || type === 5) return [tag, new TextDecoder().decode(Uint8Array.from(take(readWord())))];
  if (type === 4) {
   const count = readWord(); if (count > 128) throw Error('Завелика структура TTLV');
   const nested: Fields = {}; for (let i = 0; i < count; i++) { const [key, value] = field(depth + 1); nested[key] = value; } return [tag, nested];
  }
  throw Error('Непідтримуваний тип TTLV');
 };
 const result: Fields = {};
 while (offset < bytes.length) { const [tag, value] = field(0); result[tag] = value; }
 return result;
}
export function packet(pid: number, command: number, payload: Uint8Array = new Uint8Array()): Uint8Array<ArrayBuffer> {
 if (payload.length > 8192) throw Error('Завеликий LAN-пакет');
 const body = [...u16(pid), ...u16(command), ...payload];
 const raw = [...u16(body.length + 1), body.reduce((sum, b) => sum + b, 0) & 255, ...body];
 const out = [170, 170];
 raw.forEach((b, i) => { out.push(b); if (b === 170 && [170,85].includes(raw[i + 1])) out.push(85); });
 return Uint8Array.from(out);
}
export type LanFrame = { pid: number; command: number; payload: Uint8Array<ArrayBuffer> };
export class FrameDecoder {
 private buffer: number[] = []; private previousAA = false;
 feed(chunk: Uint8Array): LanFrame[] {
  for (const byte of chunk) {
   if (this.previousAA && byte === 85) { this.previousAA = false; continue; }
   this.buffer.push(byte); this.previousAA = byte === 170;
  }
  if (this.buffer.length > 32768) { this.buffer = []; this.previousAA = false; throw Error('Переповнення LAN-буфера'); }
  const frames: LanFrame[] = [];
  while (this.buffer.length >= 9) {
   if (this.buffer[0] !== 170 || this.buffer[1] !== 170) { this.buffer.shift(); continue; }
   const size = word(this.buffer, 2) + 4;
   if (size < 9 || size > 16384) { this.buffer.shift(); continue; }
   if (this.buffer.length < size) break;
   const frame = this.buffer.splice(0, size), body = frame.slice(5);
   if ((body.reduce((sum,b) => sum+b,0) & 255) !== frame[4]) continue;
   frames.push({ pid: word(frame,5), command: word(frame,7), payload: Uint8Array.from(frame.slice(9)) });
  }
  return frames;
 }
}
export async function loginProof(key: Uint8Array<ArrayBuffer>, nonce: string): Promise<string> {
 const value = [...key].map(b => b.toString(16).padStart(2,'0')).join('') + ';' + nonce;
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}

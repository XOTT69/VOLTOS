import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { authBytes, decodeFields, encodeFields, FrameDecoder, loginProof, packet, privateIPv4, u16, type Fields, type LanFrame } from './oukitel-wire';
import { inRange } from './core';
import type { OukitelDevice, OukitelReading } from './oukitel';
interface LanTransport {
 connect(options: { host: string; sessionId: string }): Promise<void>;
 write(options: { sessionId: string; data: string }): Promise<void>;
 disconnect(options: { sessionId: string }): Promise<void>;
 addListener(event: 'lanData', callback: (event: { sessionId: string; data: string }) => void): Promise<PluginListenerHandle>;
 addListener(event: 'lanState', callback: (event: { sessionId: string; connected: boolean; error?: string }) => void): Promise<PluginListenerHandle>;
}
export const NativeLan = registerPlugin<LanTransport>('OukitelLan');
const tags = [2,8,9,6,31,7,28,27,14,12,11,5,4,3,1,34,20,100,43,44,46];
const portTags = { ac: 43, dc: 46, usb: 44 };
export class OukitelLan {
 private id = ''; private pid = 1000; private decoder = new FrameDecoder();
 private key: CryptoKey | null = null; private keyBytes: Uint8Array<ArrayBuffer> | null = null; private iv: Uint8Array<ArrayBuffer> | null = null;
 private attached: Promise<unknown> | null = null; private receiveQueue: Promise<unknown> = Promise.resolve(); private sendQueue: Promise<unknown> = Promise.resolve();
 private heartbeat: ReturnType<typeof setInterval> | null = null; private connectedAt = 0; private lastReport = 0;
 private values: Fields = {}; private updated: Record<number, number> = {}; private device: OukitelDevice | null = null;
 private auth: { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
 private command: { tag: number; on: boolean; resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
 ready = false;
 constructor(private onReading: (reading: OukitelReading) => void, private onStatus: (message: string, error: boolean) => void) {}
 private async attach() {
  this.attached ??= Promise.all([
   NativeLan.addListener('lanData', event => {
    if (event.sessionId !== this.id) return;
    const id = this.id;
    this.receiveQueue = this.receiveQueue.then(async () => {
     if (id !== this.id) return;
     const chunk = Uint8Array.from(atob(event.data), c => c.charCodeAt(0));
     for (const frame of this.decoder.feed(chunk)) { if (id !== this.id) return; await this.handle(frame); }
    }).catch(error => { if (id === this.id) void this.fail(error instanceof Error ? error.message : 'Помилка локального протоколу'); });
   }),
   NativeLan.addListener('lanState', event => { if (event.sessionId === this.id && !event.connected) void this.fail(event.error || 'Локальний канал від’єднано'); }),
  ]).catch(error => { this.attached = null; throw error; });
  await this.attached;
 }
 async connect(host: string, authKey: string, device: OukitelDevice) {
  if (!privateIPv4(host)) throw Error('Вкажи приватну IPv4-адресу станції, наприклад 192.168.1.50');
  const bytes = authBytes(authKey);
  await this.disconnect(); await this.attach();
  this.keyBytes = bytes;
  this.key = await crypto.subtle.importKey('raw', bytes, 'AES-CBC', false, ['encrypt','decrypt']);
  this.id = crypto.randomUUID(); const id = this.id;
  this.device = device; this.values = {}; this.updated = {}; this.decoder = new FrameDecoder(); this.connectedAt = Date.now(); this.lastReport = 0;
  const authenticated = new Promise<void>((resolve,reject) => {
   const timer = setTimeout(() => { if (id === this.id) void this.fail('Станція не підтвердила локальний вхід. Перевір ключ і прошивку.'); }, 20000);
   this.auth = { resolve, reject, timer };
  });
  this.onStatus('Підключення до станції у Wi-Fi…', false);
  try {
   await Promise.all([NativeLan.connect({ host, sessionId: id }).then(() => this.send(28722)), authenticated]);
   if (id !== this.id) throw Error('Підключення скасовано');
   await this.subscribe();
   this.heartbeat = setInterval(() => {
    if (!this.ready || this.id !== id) return;
    if (Date.now() - (this.lastReport || this.connectedAt) > 60000) { void this.fail('Станція не надсилає телеметрію. Канал авторизований, але прошивка не звітує.'); return; }
    void this.subscribe().catch(error => this.fail(error instanceof Error ? error.message : 'Локальний канал недоступний'));
   },12000);
  } catch (error) { if (id === this.id) await this.disconnect(); throw error; }
 }
 private send(command: number, bytes: Uint8Array<ArrayBuffer> = new Uint8Array(), encrypted = false): Promise<void> {
  const id = this.id;
  const operation = this.sendQueue.then(async () => {
   if (!id || this.id !== id) throw Error('Локальна сесія змінилася');
   let payload = bytes;
   if (encrypted) {
    if (!this.key || !this.iv) throw Error('Локальна авторизація ще не завершена');
    payload = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: this.iv },this.key,bytes));
   }
   this.pid = this.pid >= 65534 ? 1000 : this.pid + 1;
   const frame = packet(this.pid,command,payload);
   await NativeLan.write({ sessionId: id, data: btoa(String.fromCharCode(...frame)) });
  });
  this.sendQueue = operation.catch(() => {}); return operation;
 }
 private async handle(frame: LanFrame) {
  if (frame.command === 28723) {
   if (!this.auth || !this.keyBytes) return;
   const fields = decodeFields(frame.payload), nonce = Object.values(fields).find(v => typeof v === 'string' && new TextEncoder().encode(v).length === 16);
   if (typeof nonce !== 'string') throw Error('Станція повернула некоректний nonce');
   this.iv = new TextEncoder().encode(nonce);
   await this.send(28724,encodeFields([[2,'string',await loginProof(this.keyBytes,nonce)]])); return;
  }
  if (frame.command === 28725) {
   if (!this.auth) return;
   const result = Object.values(decodeFields(frame.payload)).find(v => typeof v === 'number');
   if (result !== 0) throw Error('Станція відхилила локальний ключ. Онови ключ своєї станції.');
   this.ready = true; clearTimeout(this.auth.timer); this.auth.resolve(); this.auth = null;
   this.onStatus('Локальний вхід виконано. Очікуємо показники станції…',false); return;
  }
  if (frame.command === 28727) { await this.send(28728); return; }
  if (!this.ready || !this.key || !this.iv || ![17,20].includes(frame.command) || !frame.payload.length) return;
  const clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: this.iv },this.key,frame.payload));
  const fields = decodeFields(clear), now = Date.now();
  Object.assign(this.values,fields); Object.keys(fields).forEach(tag => { this.updated[Number(tag)] = now; });
  const number = (tag: number, min: number, max: number) => now-(this.updated[tag] || 0) < 30000 && inRange(this.values[tag],min,max) ? this.values[tag] as number : null;
  const bool = (tag: number) => now-(this.updated[tag] || 0) < 30000 && typeof this.values[tag] === 'boolean' ? this.values[tag] as boolean : null;
  const soc = number(1,0,100), input = number(4,0,5000), output = number(5,0,5000);
  // A heartbeat or output-only ACK must never make old power values appear fresh.
  const powerReport = [1,4,5].some(tag => Object.hasOwn(fields,tag)) && [soc,input,output].some(v => v !== null);
  if(powerReport)this.lastReport = now;
  if ((powerReport || this.lastReport > 0 && [43,44,46].some(tag => Object.hasOwn(fields,tag))) && this.device) {
   this.onReading({ device: { ...this.device, online: true }, soc, inputWatts: input, outputWatts: output, temperatureC: null,
    acOn: bool(43), dcOn: bool(46), usbOn: bool(44), cloudCheckedAt: null, measuredAt: new Date(this.lastReport).toISOString(), source: 'quectel-lan', freshness: 'live' });
  }
  if (this.command && Object.hasOwn(fields,this.command.tag) && fields[this.command.tag] === this.command.on) {
   clearTimeout(this.command.timer); this.command.resolve(); this.command = null;
  }
 }
 private async subscribe() {
  await this.send(19,encodeFields([[100,'num',3]]),true);
  await this.send(17,Uint8Array.from(tags.flatMap(u16)),true);
  await this.send(28729,encodeFields([[1,'num',30],[2,'num',1]]),true);
 }
 async refresh() { if (!this.ready) throw Error('Спочатку підключи локальну станцію'); await this.subscribe(); }
 async setOutput(port: 'ac' | 'dc' | 'usb', on: boolean) {
  const tag = portTags[port];
  if (!this.ready || this.command || !tag || !this.lastReport || Date.now()-this.lastReport > 30000 || typeof this.values[tag] !== 'boolean' || Date.now()-(this.updated[tag]||0) > 30000) throw Error('Свіжий стан виходу недоступний. Спочатку онови показники.');
  const confirmed = new Promise<void>((resolve,reject) => {
   const timer = setTimeout(() => { this.command = null; reject(Error('Команду надіслано, але станція ще не підтвердила стан виходу')); },10000);
   this.command = { tag, on, resolve, reject, timer };
  });
  try { await Promise.all([this.send(19,encodeFields([[tag,'bool',on]]),true).then(() => this.send(17,Uint8Array.from(u16(tag)),true)),confirmed]); }
  catch (error) { this.rejectCommand(error instanceof Error ? error : Error('Команду не підтверджено')); throw error; }
 }
 private rejectCommand(error: Error) { if(this.command){clearTimeout(this.command.timer);this.command.reject(error);this.command=null;} }
 private async fail(message: string) { await this.disconnect(); this.onStatus(message,true); }
 async disconnect() {
  const id = this.id; this.id = ''; this.ready = false;
  if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null;
  if (this.auth) { clearTimeout(this.auth.timer); this.auth.reject(Error('Локальне підключення завершено')); this.auth = null; }
  if (this.command) { clearTimeout(this.command.timer); this.command.reject(Error('Зв’язок втрачено до підтвердження команди')); this.command = null; }
  this.key = null; this.keyBytes = null; this.iv = null; this.values = {}; this.updated = {};
  if (id) await NativeLan.disconnect({ sessionId: id }).catch(() => {});
 }
}

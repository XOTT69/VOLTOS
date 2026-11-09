import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authBytes, decodeFields, encodeFields, FrameDecoder, loginProof, packet, privateIPv4, type Fields } from '../src/oukitel-wire';
import { energyEstimate, chargeMinutes } from '../src/device-insights';
const fake = vi.hoisted(() => ({ omit:0, listeners: {} as Record<string,(event: {sessionId:string;data?:string;connected?:boolean})=>void>, sent: [] as {command:number;fields:Fields}[], id:'', key: null as CryptoKey|null, iv: null as Uint8Array<ArrayBuffer>|null, values: {1:75,4:0,5:120,43:true,44:false,46:true} as Fields }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({
 addListener: async (name:string, callback:(event:{sessionId:string;data?:string;connected?:boolean})=>void) => {fake.listeners[name]=callback;return {remove:async()=>{}};},
 connect: async ({sessionId}:{sessionId:string}) => {fake.id=sessionId;},
 disconnect: async () => {},
 write: async ({data}:{data:string}) => {
  const frame = new FrameDecoder().feed(Uint8Array.from(atob(data),c=>c.charCodeAt(0)))[0];
  async function reply(command:number,bytes:Uint8Array<ArrayBuffer>,encrypted=false){
   const payload=encrypted?new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:fake.iv!},fake.key!,bytes)):bytes;
   const raw=packet(200,command,payload);fake.listeners.lanData?.({sessionId:fake.id,data:btoa(String.fromCharCode(...raw))});
  }
  if(frame.command===28722){await reply(28723,encodeFields([[1,'string','0123456789abcdef']]));return;}
  if(frame.command===28724){fake.sent.push({command:frame.command,fields:decodeFields(frame.payload)});await reply(28725,encodeFields([[1,'num',0]]));return;}
  const payload=new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:fake.iv!},fake.key!,frame.payload));
  if(frame.command===19){const fields=decodeFields(payload);fake.sent.push({command:19,fields});Object.assign(fake.values,fields);}
  if(frame.command===17){
   const entries=Object.entries(fake.values).filter(([tag])=>Number(tag)!==100 && Number(tag)!==fake.omit).map(([tag,value])=>[Number(tag),typeof value==='boolean'?'bool':'num',value] as [number,'bool'|'num',boolean|number]);
   await reply(20,encodeFields(entries),true);
  }
 },
}) }));
import { OukitelLan } from '../src/oukitel-lan';
const key='AAECAwQFBgcICQoLDA0ODw==';
beforeEach(async()=>{fake.id='';fake.omit=0;fake.sent=[];fake.values={1:75,2:240,3:30,4:0,5:120,20:100,27:0,43:true,44:false,46:true};fake.key=await crypto.subtle.importKey('raw',authBytes(key),'AES-CBC',false,['encrypt','decrypt']);fake.iv=new TextEncoder().encode('0123456789abcdef');});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
describe('LAN wire boundary',()=>{
 it('only accepts unicast private IPv4 peers',()=>{
  for(const host of ['192.168.1.50','10.0.0.8','172.16.0.12'])expect(privateIPv4(host)).toBe(true);
  for(const host of ['8.8.8.8','127.0.0.1','192.168.1.255','192.168.1.0','localhost','192.168.001.2','169.254.0.1','172.32.1.2'])expect(privateIPv4(host)).toBe(false);
 });
 it('round-trips signed numeric, bool and nonce fields',()=>{
  expect(decodeFields(encodeFields([[1,'num',75],[43,'bool',true],[14,'num',-12],[2,'string','nonce']]))).toEqual({1:75,43:true,14:-12,2:'nonce'});
  expect(()=>decodeFields(Uint8Array.from([0,10,7]))).toThrow('Неповне');
 });
 it('reassembles packet fragmentation and escaped bytes without accepting bad checksums',()=>{
  const payload=Uint8Array.from([170,85,170,170,1]), raw=packet(170,20,payload), decoder=new FrameDecoder();
  const frames=[];for(const byte of raw)frames.push(...decoder.feed(Uint8Array.of(byte)));
  expect(frames).toHaveLength(1);expect(frames[0].payload).toEqual(payload);
  const corrupt=packet(1,20,Uint8Array.of(1));corrupt[corrupt.length-1]^=1;expect(new FrameDecoder().feed(corrupt)).toEqual([]);
 });
 it('validates AES key length and the login proof format',async()=>{
  expect(()=>authBytes('wrong')).toThrow();expect(authBytes(key)).toHaveLength(16);
  expect(await loginProof(authBytes(key),'0123456789abcdef')).toMatch(/^[a-f0-9]{64}$/);
 });
});
describe('local Oukitel session',()=>{
 it('authenticates, subscribes and receives actual encrypted telemetry',async()=>{
  const readings:unknown[]=[], statuses:unknown[]=[];
  const client=new OukitelLan(reading=>readings.push(reading),(message,error)=>statuses.push({message,error}));
  try{
   await client.connect('192.168.1.50',key,{productKey:'P',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:false});
   await vi.waitFor(()=>expect(readings.length).toBeGreaterThan(0));
   expect(readings.at(-1)).toMatchObject({soc:75,outputWatts:120,source:'quectel-lan',freshness:'live',cloudCheckedAt:null});
   expect(fake.sent.some(frame=>frame.command===19&&frame.fields[100]===3)).toBe(true);
   expect(fake.sent.some(frame=>frame.command===19&&(Object.hasOwn(frame.fields,43)||Object.hasOwn(frame.fields,44)||Object.hasOwn(frame.fields,46)))).toBe(false);
  }finally{await client.disconnect();}
 });
 it('requires independent output telemetry to complete a local write',async()=>{
  const client=new OukitelLan(()=>{},()=>{});
  try{
   await client.connect('192.168.1.50',key,{productKey:'P',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:true});
   await vi.waitFor(()=>expect(client.ready).toBe(true));
   await client.setOutput('ac',false);
   expect(fake.sent).toContainEqual({command:19,fields:{43:false}});
  }finally{await client.disconnect();}
 });
 it('rejects controls while disconnected',async()=>{const client=new OukitelLan(()=>{},()=>{});await expect(client.setOutput('ac',false)).rejects.toThrow('недоступний');});
 it('reads station forecasts and confirms a numeric charging setting through telemetry',async()=>{
  const readings:unknown[]=[], client=new OukitelLan(r=>readings.push(r),()=>{});
  try{
   await client.connect('192.168.1.50',key,{productKey:'p11wN7',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:true});
   await vi.waitFor(()=>expect(readings.at(-1)).toMatchObject({remainingMinutes:240,chargeRate:100,frequency:0}));
   await client.setSetting('chargeRate',50);
   expect(fake.sent).toContainEqual({command:19,fields:{20:50}});
   expect(readings.at(-1)).toMatchObject({chargeRate:50});
   await expect(client.setSetting('chargeRate',101)).rejects.toThrow('не підтримується');
   await expect(client.setSetting('frequency',1)).rejects.toThrow('вимкни AC');
   await client.setOutput('ac',false);await client.setSetting('frequency',1);
   expect(fake.sent).toContainEqual({command:19,fields:{27:1}});
  }finally{await client.disconnect();}
 });
 it('does not accept a numeric write without readback of that exact tag',async()=>{
  const client=new OukitelLan(()=>{},()=>{});
  try{
   await client.connect('192.168.1.50',key,{productKey:'p11wN7',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:true});
   fake.omit=20;vi.useFakeTimers();
   const result=expect(client.setSetting('chargeRate',50)).rejects.toThrow('не підтвердила');
   await vi.waitFor(()=>expect(fake.sent).toContainEqual({command:19,fields:{20:50}}));
   await vi.advanceTimersByTimeAsync(10001);await result;
  }finally{await client.disconnect();}
 });
 it('cancels before asynchronous setup can create a background connection',async()=>{
  const client=new OukitelLan(()=>{},()=>{});
  const attempt=client.connect('192.168.1.50',key,{productKey:'P',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:true});
  await client.disconnect();await expect(attempt).rejects.toThrow('скасовано');expect(fake.id).toBe('');
 });
 it('does not expose advanced settings for an unverified product',async()=>{
  const readings:unknown[]=[],client=new OukitelLan(r=>readings.push(r),()=>{});
  try{
   await client.connect('192.168.1.50',key,{productKey:'unknown',deviceKey:'D',deviceName:'Station',productName:'Other model',online:true});
   await vi.waitFor(()=>expect(readings.at(-1)).toMatchObject({chargeRate:null,frequency:null,remainingMinutes:null}));
   await expect(client.setSetting('chargeRate',50)).rejects.toThrow('не підтримується');
   expect(fake.sent.some(frame=>Object.hasOwn(frame.fields,20))).toBe(false);
  }finally{await client.disconnect();}
 });
 it('rejects a stale setting even when other power telemetry was refreshed',async()=>{
  const client=new OukitelLan(()=>{},()=>{});
  try{
   await client.connect('192.168.1.50',key,{productKey:'p11wN7',deviceKey:'D',deviceName:'Station',productName:'P2001E Plus',online:true});
   vi.useFakeTimers();vi.setSystemTime(Date.now()+31000);fake.omit=20;await client.refresh();
   await expect(client.setSetting('chargeRate',50)).rejects.toThrow('Свіжий стан');
  }finally{await client.disconnect();}
 });
});
describe('device insights',()=>{
 it('integrates measured intervals and does not invent energy during gaps',()=>{
  const now=Date.now(), points=[0,60000,3600000].map(delta=>({at:now-3600000+delta,source:'bluetti' as const,deviceId:'D',output:120,input:0,soc:50}));
  expect(energyEstimate(points,'bluetti','D',now)).toMatchObject({outputWh:2,coveredMinutes:1,hasCoverage:true});
  expect(energyEstimate(points,'bluetti','OTHER',now).hasCoverage).toBe(false);
 });
 it('only estimates charging with positive measured net input',()=>{expect(chargeMinutes(50,200,100,1000)).toBe(300);expect(chargeMinutes(50,0,100,1000)).toBeNull();});
});
it('matches independent published login and encrypted telemetry vectors',async()=>{
 const bytes=authBytes('MDEyMzQ1Njc4OWFiY2RlZg=='),nonce='EXAMPLENONCE0001';
 expect(await loginProof(bytes,nonce)).toBe('e7657a24b4b4473d5abe6358bfa6764a0789568342187e8b7fe8cc2c75adc5c5');
 const aes=await crypto.subtle.importKey('raw',bytes,'AES-CBC',false,['decrypt']);
 const ciphertext=Uint8Array.from('586e62aac1aab8c7336a1daf71c4d618'.match(/../g)!,b=>parseInt(b,16));
 const plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:new TextEncoder().encode(nonce)},aes,ciphertext));
 expect(decodeFields(plaintext)).toEqual({1:97,43:false});
});

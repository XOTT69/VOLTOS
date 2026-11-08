import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const SERVICE='0000ff00-0000-1000-8000-00805f9b34fb';
const NOTIFY='0000ff01-0000-1000-8000-00805f9b34fb';
const WRITE='0000ff02-0000-1000-8000-00805f9b34fb';

export interface Eb3aReading {
  soc:number; inputWatts:number; outputWatts:number;
  dcInputWatts:number; acInputWatts:number; acOutputWatts:number; dcOutputWatts:number;
  acEnabled:boolean; dcEnabled:boolean; measuredAt:string; deviceName:string;
}
function crc16(arr:readonly number[]):number {
  let crc=65535;
  for(const byte of arr){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?(crc>>1)^0xa001:crc>>1;}
  return crc;
}
function frame(fn:number, addr:number, count:number):number[]{
  const bytes=[1,fn,addr>>8,addr&255,count>>8,count&255];
  const crc=crc16(bytes);return [...bytes,crc&255,crc>>8];
}
function word(bytes:number[],at:number):number{return bytes[at*2]*256+bytes[at*2+1];}
function valid(bytes:number[]):boolean{
  if(bytes.length<5)return false;
  const crc=crc16(bytes.slice(0,-2));
  return bytes.at(-2)===(crc&255)&&bytes.at(-1)===(crc>>8);
}

export class Eb3aBle {
  private deviceId:string|null=null;
  private name='BLUETTI EB3A';
  private chunks:number[]=[];
  private pending: {resolve:(bytes:number[])=>void;reject:(e:Error)=>void;fn:number;count:number;timer:ReturnType<typeof setTimeout>}|null=null;
  private queue:Promise<unknown>=Promise.resolve();
  private disconnectedCallback:()=>void=()=>{};
  get connected(){return this.deviceId!==null;}
  onDisconnect(callback:()=>void){this.disconnectedCallback=callback;}
  async connect():Promise<void>{
    if(!Capacitor.isNativePlatform() && !('bluetooth' in navigator))
      throw Error('BLE потребує iOS/Android застосунку або сумісного браузера.');
    await BleClient.initialize();
    const selected=await BleClient.requestDevice({optionalServices:[SERVICE],displayMode:'list'});
    if(!/EB3A|BLUETTI/i.test(selected.name||''))throw Error('Вибраний пристрій не схожий на BLUETTI EB3A.');
    if(!selected.deviceId)throw Error('Не вибрано станцію.');
    this.deviceId=selected.deviceId;
    this.name=selected.name||'BLUETTI EB3A';
    try{
      await BleClient.connect(selected.deviceId,()=>{
        this.deviceId=null;
        this.rejectPending(new Error('Bluetooth від’єднано'));
        this.disconnectedCallback();
      });
      await BleClient.startNotifications(selected.deviceId,SERVICE,NOTIFY,(value)=>{
        const b=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
        this.onChunk([...b]);
      });
    }catch(err){
      this.deviceId=null;
      try{await BleClient.disconnect(selected.deviceId)}catch{}
      throw err;
    }
  }
  private rejectPending(error:Error){
    const p=this.pending;if(p){this.pending=null;clearTimeout(p.timer);p.reject(error);}
  }
  private onChunk(chunk:number[]){
    this.chunks.push(...chunk);
    if(this.chunks.length>1024)this.chunks=this.chunks.slice(-512);
    while(this.chunks.length>=5){
      if(this.chunks[0]!==1){this.chunks.shift();continue;}
      const fn=this.chunks[1];
      let size:number;
      if(fn===3)size=5+this.chunks[2];
      else if(fn===6||fn===16)size=8;
      else if(fn&128)size=5;
      else{this.chunks.shift();continue;}
      if(size<5||size>255){this.chunks.shift();continue;}
      if(this.chunks.length<size)return;
      const response=this.chunks.splice(0,size);
      if(!valid(response))continue;
      const p=this.pending;
      if(!p)continue;
      this.pending=null;clearTimeout(p.timer);
      if(fn&128)p.reject(Error('EB3A повернула помилку Modbus '+response[2]));
      else if(fn!==p.fn || (fn===3&&response[2]!==p.count*2))p.reject(Error('Невірний формат відповіді EB3A'));
      else p.resolve(response);
    }
  }
  private async transaction(fn:number,addr:number,count:number):Promise<number[]>{
    const task=async()=>{
      const id=this.deviceId;if(!id)throw Error('Спочатку підключіть станцію.');
      this.chunks=[];
      const reply=new Promise<number[]>((resolve,reject)=>{
        const timer=setTimeout(()=>this.rejectPending(Error('Таймаут відповіді EB3A')),6500);
        this.pending={resolve,reject,fn,count,timer};
      });
      try{
        await BleClient.writeWithoutResponse(id,SERVICE,WRITE,numbersToDataView(frame(fn,addr,count)));
        return await reply;
      }catch(err){this.rejectPending(Error('Збій Bluetooth обміну'));throw err;}
    };
    const result=this.queue.then(task,task);
    this.queue=result.catch(()=>{});
    return result;
  }
  private async read(addr:number,count:number):Promise<number[]>{
    const response=await this.transaction(3,addr,count);
    return response.slice(3,-2);
  }
  async refresh():Promise<Eb3aReading>{
    // Same read-only EB3A registers used by XOTT69/Stats.
    const a=await this.read(10,40), b=await this.read(50,9);
    const values=[...a,...b];
    if(values.length<98)throw Error('Неповні дані EB3A');
    const dcIn=word(values,26),acIn=word(values,27),acOut=word(values,28),dcOut=word(values,29),soc=word(values,33);
    if(soc<0||soc>100||[dcIn,acIn,acOut,dcOut].some(x=>x>3000))
      throw Error('EB3A повернула нетипові показники. Перевірте прошивку.');
    const switches=await this.read(3007,2);
    return {
      soc,inputWatts:dcIn+acIn,outputWatts:acOut+dcOut,
      dcInputWatts:dcIn,acInputWatts:acIn,acOutputWatts:acOut,dcOutputWatts:dcOut,
      acEnabled:word(switches,0)!==0,dcEnabled:word(switches,1)!==0,
      measuredAt:new Date().toISOString(),deviceName:this.name
    };
  }
  /** Explicit user-initiated single-register write, followed by independent readback. */
  async setRegister(addr:3007|3008|3034|3063|3065|3066, value:number):Promise<number>{
    const allowed:Record<number,number[]>={3007:[0,1],3008:[0,1],3034:[1,2,3,4],3063:[0,1],3065:[0,1,2],3066:[0,1]};
    if(!allowed[addr]?.includes(value))throw Error('Недозволене значення команди.');
    if(!this.connected)throw Error('BLUETTI не підключено.');
    const response=await this.transaction(6,addr,value);
    if(response[2]!==((addr>>8)&255)||response[3]!==addr%256||
       response[4]!==((value>>8)&255)||response[5]!==value%256)
      throw Error('Неочікуване підтвердження Modbus.');
    const actual=word(await this.read(addr,1),0);
    if(actual!==value)throw Error('Станція не підтвердила виконання. Зчитано '+actual);
    return actual;
  }
  /** Optional register values are loaded separately so basic telemetry survives missing firmware features. */
  async readControls():Promise<{led:number|null;eco:number|null;chargeMode:number|null;lifting:number|null}>{
    const optional=async(addr:number)=>{try{return word(await this.read(addr,1),0)}catch{return null}};
    return {led:await optional(3034),eco:await optional(3063),chargeMode:await optional(3065),lifting:await optional(3066)};
  }
  async disconnect():Promise<void>{
    const id=this.deviceId;this.deviceId=null;
    this.rejectPending(Error('Bluetooth від’єднано'));
    if(id){
      try{await BleClient.stopNotifications(id,SERVICE,NOTIFY)}catch{}
      try{await BleClient.disconnect(id)}catch{}
    }
  }
}

import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { frame, validFrame, allowedWrite, registers, type BleControls } from './protocol';

const SERVICE='0000ff00-0000-1000-8000-00805f9b34fb';
const NOTIFY='0000ff01-0000-1000-8000-00805f9b34fb';
const WRITE='0000ff02-0000-1000-8000-00805f9b34fb';

export interface Eb3aReading {
  soc:number; inputWatts:number; outputWatts:number;
  dcInputWatts:number; acInputWatts:number; acOutputWatts:number; dcOutputWatts:number;
  acEnabled:boolean|null; dcEnabled:boolean|null; measuredAt:string; deviceName:string; deviceId:string;
}
function word(bytes:number[],at:number):number{return bytes[at*2]*256+bytes[at*2+1];}

export class Eb3aBle {
  private deviceId:string|null=null;
  private name='BLUETTI EB3A';
  private chunks:number[]=[];
  private pending: {resolve:(bytes:number[])=>void;reject:(e:Error)=>void;fn:number;count:number;timer:ReturnType<typeof setTimeout>}|null=null;
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private connecting=false;
  private disconnectedCallback:()=>void=()=>{};
  get connected(){return this.deviceId!==null;}
  onDisconnect(callback:()=>void){this.disconnectedCallback=callback;}
  async connect():Promise<void>{
    if(this.connecting||this.connected)throw Error('Bluetooth вже підключається або підключено.');
    if(!Capacitor.isNativePlatform() && !('bluetooth' in navigator))
      throw Error('BLE потребує iOS/Android застосунку або сумісного браузера.');
    this.connecting=true;
    try {
    await BleClient.initialize();
    const selected=await BleClient.requestDevice({optionalServices:[SERVICE],displayMode:'list'});
    if(!/EB3A/i.test(selected.name||''))throw Error('Обери саме EB3A. Інші моделі BLUETTI мають інший протокол.');
    if(!selected.deviceId)throw Error('Не вибрано станцію.');
    this.deviceId=selected.deviceId;
    this.generation++;
    this.name=selected.name||'BLUETTI EB3A';
    try{
      await BleClient.connect(selected.deviceId,()=>{
        if(this.deviceId!==selected.deviceId)return;
        this.deviceId=null;
        this.generation++;
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
    } finally { this.connecting=false; }
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
      if(!validFrame(response))continue;
      const p=this.pending;
      if(!p)continue;
      this.pending=null;clearTimeout(p.timer);
      if(fn&128)p.reject(Error('EB3A повернула помилку Modbus '+response[2]));
      else if(fn!==p.fn || (fn===3&&response[2]!==p.count*2))p.reject(Error('Невірний формат відповіді EB3A'));
      else p.resolve(response);
    }
  }
  private async transaction(fn:number,addr:number,count:number):Promise<number[]>{
    const generation=this.generation;
    const task=async()=>{
      if(generation!==this.generation)throw Error('Сесію Bluetooth змінено. Повтори дію.');
      const id=this.deviceId;if(!id)throw Error('Спочатку підключіть станцію.');
      this.chunks=[];
      const reply=new Promise<number[]>((resolve,reject)=>{
        const timer=setTimeout(()=>this.rejectPending(Error('Таймаут відповіді EB3A')),6500);
        this.pending={resolve,reject,fn,count,timer};
      });
      try{
        const sent=BleClient.writeWithoutResponse(id,SERVICE,WRITE,numbersToDataView(frame(fn,addr,count)));
        const [response]=await Promise.all([reply,sent]);
        return response;
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
    const deviceId=this.deviceId,generation=this.generation;
    // Same read-only EB3A registers used by XOTT69/Stats.
    const a=await this.read(10,40), b=await this.read(50,9);
    const values=[...a,...b];
    if(values.length<98)throw Error('Неповні дані EB3A');
    const dcIn=word(values,26),acIn=word(values,27),acOut=word(values,28),dcOut=word(values,29),soc=word(values,33);
    if(soc<0||soc>100||[dcIn,acIn,acOut,dcOut].some(x=>x>3000))
      throw Error('EB3A повернула нетипові показники. Перевірте прошивку.');
    let acEnabled:boolean|null=null,dcEnabled:boolean|null=null;
    try {
      const switches=await this.read(3007,2);
      const ac=word(switches,0),dc=word(switches,1);
      acEnabled=[0,1].includes(ac)?ac===1:null;
      dcEnabled=[0,1].includes(dc)?dc===1:null;
    } catch { /* Unsupported switches must not discard valid power measurements. */ }
    if(!deviceId||this.deviceId!==deviceId||this.generation!==generation)throw Error('Bluetooth від’єднано під час зчитування');
    return {
      soc,inputWatts:dcIn+acIn,outputWatts:acOut+dcOut,
      dcInputWatts:dcIn,acInputWatts:acIn,acOutputWatts:acOut,dcOutputWatts:dcOut,
      acEnabled,dcEnabled,
      measuredAt:new Date().toISOString(),deviceName:this.name,deviceId
    };
  }
  /** Explicit user-initiated single-register write, followed by independent readback. */
  async setRegister(addr:number, value:number):Promise<number>{
    if(!allowedWrite(addr,value))throw Error('Недозволене значення команди.');
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
  async readControls():Promise<BleControls>{
    const optional=async(key:keyof BleControls)=>{
      try{const def=registers[key],v=word(await this.read(def.address,1),0);return (def.values as readonly number[]).includes(v)?v:null}catch{return null}
    };
    return {led:await optional('led'),eco:await optional('eco'),ecoTime:await optional('ecoTime'),chargeMode:await optional('chargeMode'),lifting:await optional('lifting')};
  }
  async disconnect():Promise<void>{
    const id=this.deviceId;this.deviceId=null;
    this.generation++;
    this.rejectPending(Error('Bluetooth від’єднано'));
    if(id){
      try{await BleClient.stopNotifications(id,SERVICE,NOTIFY)}catch{}
      try{await BleClient.disconnect(id)}catch{}
    }
  }
}

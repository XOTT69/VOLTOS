import { endpoint } from './native-api';
export interface OukitelDevice {
 productKey:string;deviceKey:string;deviceName:string;productName:string;online:boolean;
}
export interface OukitelReading {
 device:OukitelDevice; soc:number|null; inputWatts:number|null;outputWatts:number|null;
 temperatureC:number|null; acOn:boolean|null;dcOn:boolean|null;usbOn:boolean|null;
 cloudCheckedAt:string; source:'quectel-cloud-shadow'; freshness:'unknown';
}
export interface OukitelControlResult {accepted:boolean;confirmed:boolean;on:boolean;port:'ac'|'dc'|'usb';message:string}
export const oukitel={
 control:(d:OukitelDevice,port:'ac'|'dc'|'usb',on:boolean)=>
  endpoint<OukitelControlResult>('oukitel','control','POST',{pk:d.productKey,dk:d.deviceKey,port,on}),
 session:async()=>endpoint('oukitel','session') as Promise<{connected:boolean}>,
 login:async(email:string,password:string)=>endpoint('oukitel','login','POST',{email,password}) as Promise<{connected:boolean;devices:OukitelDevice[]}>,
 logout:async()=>endpoint('oukitel','logout','POST',{}) as Promise<{connected:boolean}>,
 devices:async()=>endpoint('oukitel','devices') as Promise<{devices:OukitelDevice[]}>,
 state:async(d:OukitelDevice):Promise<OukitelReading>=>{
  const raw=await endpoint('oukitel','state','GET',undefined,{pk:d.productKey,dk:d.deviceKey}) as {
   raw?:{data?:{customizeTslInfo?:Array<{abId:string|number;resourceValce:unknown}>};customizeTslInfo?:Array<{abId:string|number;resourceValce:unknown}>};
   cloudCheckedAt:string;device:OukitelDevice
  };
  const attrs=raw.raw?.data?.customizeTslInfo??raw.raw?.customizeTslInfo??[];
  if(!raw.device||raw.device.deviceKey!==d.deviceKey||raw.device.productKey!==d.productKey||
     typeof raw.device.online!=='boolean'||!Number.isFinite(Date.parse(raw.cloudCheckedAt))||!Array.isArray(attrs))
   throw Error('Oukitel повернув некоректні дані станції');
  const ids=new Map(attrs.map(item=>[String(item.abId),item.resourceValce]));
  const num=(id:string,min=-100,max=100000):number|null=>{
   const x=ids.get(id);if((typeof x!=='number'&&typeof x!=='string')||String(x).trim()==='')return null;
   const v=Number(x);return Number.isFinite(v)&&v>=min&&v<=max?v:null;
  };
  const bool=(id:string):boolean|null=>{
   const x=ids.get(id);if(x===undefined||x===null)return null;
   if(['1','true','on'].includes(String(x).toLowerCase()))return true;
   if(['0','false','off'].includes(String(x).toLowerCase()))return false;
   return null;
  };
  const soc=num('1',0,100),input=num('4',0,3000),output=num('5',0,3000);
  if(soc===null&&input===null&&output===null)throw Error('Oukitel Cloud повернув порожню телеметрію. Останній стан не позначено як LIVE.');
  return {device:raw.device,soc,inputWatts:input,outputWatts:output,temperatureC:num('14',-20,100),acOn:bool('43'),usbOn:bool('44'),dcOn:bool('46'),
   cloudCheckedAt:raw.cloudCheckedAt,source:'quectel-cloud-shadow',freshness:'unknown'};
 }
};

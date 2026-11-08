export interface OukitelDevice {
 productKey:string;deviceKey:string;deviceName:string;productName:string;online:boolean;
}
export interface OukitelReading {
 device:OukitelDevice; soc:number|null; inputWatts:number|null;outputWatts:number|null;
 temperatureC:number|null; acOn:boolean|null;dcOn:boolean|null;usbOn:boolean|null;
 cloudCheckedAt:string; source:'quectel-cloud-shadow'; freshness:'unknown';
}
async function request(path:string,init?:RequestInit):Promise<unknown>{
 const r=await fetch('/api/oukitel?action='+path,{...init,cache:'no-store',credentials:'same-origin'});
 const j=await r.json().catch(()=>({error:'Некоректна відповідь'}));
 if(!r.ok)throw Error(typeof j?.error==='string'?j.error:'Помилка Oukitel '+r.status);
 return j;
}
const post=(body:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} as const);
export const oukitel={
 session:async()=>request('session') as Promise<{connected:boolean}>,
 login:async(email:string,password:string)=>request('login',post({email,password})) as Promise<{connected:boolean;devices:OukitelDevice[]}>,
 logout:async()=>request('logout',post({})) as Promise<{connected:boolean}>,
 devices:async()=>request('devices') as Promise<{devices:OukitelDevice[]}>,
 state:async(d:OukitelDevice):Promise<OukitelReading>=>{
  const raw=await request('state&pk='+encodeURIComponent(d.productKey)+'&dk='+encodeURIComponent(d.deviceKey)) as {
   raw?:{data?:{customizeTslInfo?:Array<{abId:string|number;resourceValce:unknown}>};customizeTslInfo?:Array<{abId:string|number;resourceValce:unknown}>};
   cloudCheckedAt:string;device:OukitelDevice
  };
  const attrs=raw.raw?.data?.customizeTslInfo??raw.raw?.customizeTslInfo??[];
  const ids=new Map(attrs.map(item=>[String(item.abId),item.resourceValce]));
  const num=(id:string,min=-100,max=100000):number|null=>{
   const x=ids.get(id);if(x===null||x===undefined||x==='')return null;
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
  return {device:d,soc,inputWatts:input,outputWatts:output,temperatureC:num('14',-20,100),acOn:bool('43'),usbOn:bool('44'),dcOn:bool('46'),
   cloudCheckedAt:raw.cloudCheckedAt,source:'quectel-cloud-shadow',freshness:'unknown'};
 }
};

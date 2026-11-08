export interface AtlanticState {
 connected:boolean; deviceOnline:boolean; gatewayOnline:boolean;
 name:string; roomTemperature:number|null;targetTemperature:number|null;
 power:boolean|null;mode:string|null;commands:string[];measuredAt:string;source:string;
}
type Credentials={authenticated:boolean;configured:boolean};
async function json(url:string,init?:RequestInit){
 const r=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});
 const data=await r.json().catch(()=>({error:'Некоректна відповідь сервера'}));
 if(!r.ok)throw Error(typeof data.error==='string'?data.error:'HTTP '+r.status);
 return data;
}
export const atlantic={
 session:()=>json('/api/bridge?action=session') as Promise<Credentials>,
 login:(password:string)=>json('/api/bridge?action=login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}) as Promise<{authenticated:boolean}>,
 logout:()=>json('/api/bridge?action=logout',{method:'POST'}) as Promise<{authenticated:boolean}>,
 state:()=>json('/api/bridge?action=state') as Promise<AtlanticState>,
 control:(action:'temperature'|'power'|'mode',value:number|boolean|string)=>json('/api/bridge?action=control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,value})}) as Promise<{accepted:boolean;confirmed:boolean}>,
};

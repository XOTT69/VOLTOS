import { endpoint } from './native-api';
import { inRange } from './core';

export interface AtlanticState {
 connected:boolean;deviceOnline:boolean;gatewayOnline:boolean;
 name:string;roomTemperature:number|null;targetTemperature:number|null;
 power:boolean|null;mode:string|null;commands:string[];measuredAt:string;source:string;
}
type Credentials={authenticated:boolean;configured:boolean};
export const atlantic={
 session:()=>endpoint<Credentials>('atlantic','session'),
 login:(password:string)=>endpoint<{authenticated:boolean}>('atlantic','login','POST',{password}),
 logout:()=>endpoint<{authenticated:boolean}>('atlantic','logout','POST',{}),
 state:async()=>{
  const data=await endpoint<AtlanticState>('atlantic','state');
  if(typeof data.deviceOnline!=='boolean'||typeof data.gatewayOnline!=='boolean'||
     !Array.isArray(data.commands)||!data.commands.every(c=>typeof c==='string')||
     (data.roomTemperature!==null&&!inRange(data.roomTemperature,-40,80))||
     (data.targetTemperature!==null&&!inRange(data.targetTemperature,7,30))||
     (data.power!==null&&typeof data.power!=='boolean')||!Number.isFinite(Date.parse(data.measuredAt)))
   throw Error('Cozytouch повернув неповні або некоректні показники');
  return data;
 },
 control:(action:'temperature'|'power'|'mode',value:number|boolean|string)=>
   endpoint<{accepted:boolean;confirmed:boolean}>('atlantic','control','POST',{action,value}),
};

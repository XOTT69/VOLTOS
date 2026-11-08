import { endpoint } from './native-api';

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
 state:()=>endpoint<AtlanticState>('atlantic','state'),
 control:(action:'temperature'|'power'|'mode',value:number|boolean|string)=>
   endpoint<{accepted:boolean;confirmed:boolean}>('atlantic','control','POST',{action,value}),
};

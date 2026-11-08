import { Capacitor, CapacitorHttp } from '@capacitor/core';

const BACKEND='https://voltos-belli.vercel.app';
export type Integration='atlantic'|'oukitel';
const tokens:Partial<Record<Integration,string>>={};
export function hasNativeToken(which:Integration){return Boolean(tokens[which]);}
export function clearNativeToken(which:Integration){delete tokens[which];}
export async function endpoint<T>(which:Integration,action:string,method:'GET'|'POST'='GET',payload?:unknown,params?:Record<string,string>):Promise<T>{
 const qs=new URLSearchParams({action,...(params||{})});
 const path='/api/'+(which==='atlantic'?'bridge':'oukitel')+'?'+qs.toString();
 if(Capacitor.isNativePlatform()){
  const response=await CapacitorHttp.request({
   url:BACKEND+path,method,
   headers:{'X-VOLTOS-NATIVE':'1',...(tokens[which]?{'Authorization':'Bearer '+tokens[which]}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},
   ...(method==='POST'?{data:payload??{}}:{}),
   connectTimeout:12000,readTimeout:23000,
  });
  const data=typeof response.data==='string'?JSON.parse(response.data):response.data;
  if(response.status<200||response.status>=300)
   throw Error(typeof data?.error==='string'?data.error:'HTTP '+response.status);
  if(action==='login'&&typeof data?.nativeToken==='string'){
    tokens[which]=data.nativeToken;
  }
  if(action==='logout')delete tokens[which];
  if(data&&typeof data==='object')delete data.nativeToken;
  return data as T;
 }
 const response=await fetch(path,{method,cache:'no-store',credentials:'same-origin',
  ...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload??{})}:{})
 });
 const data=await response.json().catch(()=>({error:'Некоректна відповідь сервера'}));
 if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'HTTP '+response.status);
 return data as T;
}

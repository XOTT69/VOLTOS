import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const BASE='https://iot-api.quecteleu.com';
const USER_DOMAIN='E.SP.4294967410';
const cookieName='voltos_oukitel';
const maxAge=12*60*60;
type Device={productKey:string;deviceKey:string;deviceName:string;productName:string;online:boolean};
const safeId=(x:unknown):x is string=>typeof x==='string'&&/^[\w-]{1,96}$/.test(x);
function key(){
 const v=process.env.VOLTOS_SESSION_SECRET||'';
 return v.length>=32?createHash('sha256').update(v+':oukitel-v1').digest():null;
}
function encSession(token:string){
 const k=key();if(!k)throw Error('Сервіс сесій не налаштовано');
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',k,iv);
 const payload=Buffer.from(JSON.stringify({token,exp:Date.now()+maxAge*1000}),'utf8');
 const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
function decSession(req:VercelRequest){
 const k=key();if(!k)return null;
 const c=isNative(req)?String(req.headers.authorization||'').replace(/^Bearer /i,''):
 String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!c||c.length>8192)return null;
 try{
  const b=Buffer.from(c,'base64url');if(b.length<30)return null;
  const decipher=createDecipheriv('aes-256-gcm',k,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));
  const data=JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString()) as {token:string;exp:number};
  return data.exp>Date.now()&&typeof data.token==='string'&&data.token.length<5000?data.token:null;
 }catch{return null;}
}
const cookie=(value:string,age:number)=>cookieName+'='+value+'; HttpOnly; Secure; SameSite=Strict; Path=/api/oukitel; Max-Age='+age;
function isNative(req:VercelRequest){return req.headers['x-voltos-native']==='1'&&!req.headers.origin;}
function isSameOrigin(req:VercelRequest){
 const host=req.headers['x-forwarded-host']||req.headers.host;
 const o=req.headers.origin;
 return o==='https://'+host||(process.env.NODE_ENV!=='production'&&o==='http://'+host);
}
function headers(res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
}
function commonHeaders(token?:string){
 return {'X-Q-Language':'en','quec-random-url':randomBytes(16).toString('hex'),
  'app-info':JSON.stringify({userDomain:USER_DOMAIN}),
  ...(token?{Authorization:token}:{})};
}
async function provider(path:string,token?:string,body?:URLSearchParams){
 const response=await fetch(BASE+path,{method:body?'POST':'GET',headers:{
  ...commonHeaders(token),...(body?{'content-type':'application/x-www-form-urlencoded'}:{})
 },body:body?.toString(),signal:AbortSignal.timeout(12000),cache:'no-store'});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||![0,200].includes(Number(data.code??0))){
  throw Error(response.status===401||Number(data?.code)===401?'Сесія Oukitel завершилася':'Сервіс Oukitel відхилив запит');
 }
 return data;
}
async function login(email:string,password:string){
 const appSecret=process.env.OUKITEL_APP_SECRET;
 if(!appSecret)throw Error('Інтеграція Oukitel ще не налаштована');
 const random=randomBytes(12).toString('base64url').slice(0,16);
 const md5=createHash('md5').update(random).digest('hex').toUpperCase();
 const aesKey=md5.slice(8,24), iv=aesKey.slice(8)+aesKey.slice(0,8);
 const cipher=createCipheriv('aes-128-cbc',Buffer.from(aesKey),Buffer.from(iv));
 const pwd=Buffer.concat([cipher.update(Buffer.from(password)),cipher.final()]).toString('base64')+'\n';
 const signature=createHash('sha256').update(email+pwd+random+appSecret).digest('hex');
 const data=await provider('/v2/enduser/enduserapi/emailPwdLogin',undefined,new URLSearchParams({
  email,pwd,random,signature,userDomain:USER_DOMAIN
 }));
 const t=data?.data?.accessToken?.token;
 if(typeof t!=='string'||!t)throw Error('Oukitel не підтвердив облікові дані');
 return t.startsWith('Bearer ')?t:'Bearer '+t;
}
async function devices(token:string):Promise<Device[]>{
 const data=await provider('/v2/binding/enduserapi/userDeviceList?pageNumber=1&pageSize=50',token);
 const list=data?.data?.list;
 if(!Array.isArray(list))throw Error('Oukitel не надав список пристроїв');
 return list.map((x:Record<string,unknown>)=>({
  productKey:String(x.productKey||''),deviceKey:String(x.deviceKey||''),
  deviceName:String(x.deviceName||''),productName:String(x.productName||''),
  online:x.online===true||Number(x.online)===1
 })).filter((x:Device)=>safeId(x.productKey)&&safeId(x.deviceKey));
}
export default async function handler(req:VercelRequest,res:VercelResponse){
 headers(res);
 const action=Array.isArray(req.query.action)?req.query.action[0]:req.query.action;
 if(req.method==='POST'&&!isSameOrigin(req)&&!isNative(req))return res.status(403).json({error:'Недозволене джерело запиту'});
 if(action==='session'&&req.method==='GET')return res.status(200).json({connected:Boolean(decSession(req))});
 if(action==='logout'&&req.method==='POST'){
  res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({connected:false});
 }
 if(action==='login'&&req.method==='POST'){
  const email=typeof req.body?.email==='string'?req.body.email.trim():'';
  const password=typeof req.body?.password==='string'?req.body.password:'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<1||password.length>256)
   return res.status(400).json({error:'Перевірте email і пароль Oukitel'});
  try{
   const token=await login(email,password);const list=await devices(token);
   const value=encSession(token);
   if(isNative(req))return res.status(200).json({connected:true,devices:list,nativeToken:value});
   res.setHeader('Set-Cookie',cookie(value,maxAge));
   return res.status(200).json({connected:true,devices:list});
  }catch(e){return res.status(401).json({error:e instanceof Error?e.message:'Помилка авторизації Oukitel'});}
 }
 const token=decSession(req);
 if(!token)return res.status(401).json({error:'Підключіть акаунт Oukitel у VOLTOS'});
 try{
  if(action==='devices'&&req.method==='GET')return res.status(200).json({devices:await devices(token)});
  if(action==='state'&&req.method==='GET'){
   const pk=req.query.pk,dk=req.query.dk;
   if(!safeId(pk)||!safeId(dk))return res.status(400).json({error:'Не обрано станцію'});
   const list=await devices(token);
   const owned=list.find(d=>d.productKey===pk&&d.deviceKey===dk);
   if(!owned)return res.status(403).json({error:'Це не ваш пристрій'});
   const data=await provider('/v2/binding/enduserapi/getDeviceBusinessAttributes?pk='+encodeURIComponent(pk)+'&dk='+encodeURIComponent(dk),token);
   return res.status(200).json({device:owned,raw:data,cloudCheckedAt:new Date().toISOString(),source:'quectel-cloud-shadow',freshness:'unknown'});
  }
  return res.status(405).json({error:'Непідтримуваний запит'});
 }catch(e){return res.status(502).json({error:e instanceof Error?e.message:'Oukitel недоступний'});}
}

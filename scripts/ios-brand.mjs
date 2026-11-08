import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dir='ios/App/App/Assets.xcassets/AppIcon.appiconset';
const contentPath=join(dir,'Contents.json');
const svgPath='public/icon.svg';

if(!existsSync(contentPath)){
 console.error('iOS AppIcon asset catalog not found:',contentPath);
 process.exitCode=1;
}else{
 const content=JSON.parse(readFileSync(contentPath,'utf8'));
 const svg=readFileSync(svgPath);
 let count=0;
 for(const image of content.images??[]){
  if(!image.filename)continue;
  const parts=String(image.size??'1024x1024').split('x');
  const base=parseFloat(parts[0])||1024;
  const scale=parseFloat(String(image.scale??'1x'))||1;
  const pixels=Math.round(base*scale);
  if(pixels<16||pixels>2048)continue;
  mkdirSync(dir,{recursive:true});
  const output=join(dir,image.filename);
  await sharp(svg,{density:300}).resize(pixels,pixels,{fit:'contain'}).png().toFile(output+'.tmp.png');
  const {renameSync}=await import('node:fs');
  renameSync(output+'.tmp.png',output);
  count++;
 }
 if(!count){
  console.error('No AppIcon images defined in Contents.json');
  process.exitCode=1;
 }else console.log('VOLTOS branded iOS icons generated:',count);
}

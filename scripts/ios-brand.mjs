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

const splashDir='ios/App/App/Assets.xcassets/Splash.imageset';
if(existsSync(join(splashDir,'Contents.json'))){
 const splash=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#f3f5f0"/><rect x="1206" y="1160" width="320" height="320" rx="90" fill="#193d2b"/><path d="m1385 1225-92 126h66l-15 111 93-140h-68z" fill="#c4efb5"/><text x="1366" y="1580" font-family="Helvetica,Arial,sans-serif" font-size="59" font-weight="bold" letter-spacing="9" text-anchor="middle" fill="#193d2b">VOLTOS</text></svg>');
 const catalog=JSON.parse(readFileSync(join(splashDir,'Contents.json'),'utf8'));
 const rendered=await sharp(splash).png().toBuffer();
 for(const asset of catalog.images)if(asset.filename)writeFileSync(join(splashDir,asset.filename),rendered);
 console.log('VOLTOS launch screen generated');
}

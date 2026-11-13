/**
 * Original V4-inspired procedural Canvas textures for V5:
 * town grass flecks (game.js/drawCityGround), street stone, wooden floor,
 * clay roof and farm soil. Repeatable pattern tiles avoid large per-frame loops.
 */
const contextPatterns=new WeakMap();
function random(i){const n=Math.sin(i*87.7+41.31)*43758.5453;return n-Math.floor(n)}
function patternTile(kind){
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const g=c.getContext('2d');
 if(kind==='grass'){
   g.fillStyle='#7ea65b';g.fillRect(0,0,128,128);
   for(let i=0;i<140;i++){
     const x=random(i*3+1)*128,y=random(i*3+2)*128;
     g.fillStyle=i%3===0?'#c2c98a65':i%3===1?'#486e4770':'#b1c78379';
     g.fillRect(x,y,3+random(i*2+18)*6,1+random(i+71)*2);
   }
   for(let i=0;i<8;i++){let x=random(i*7+12)*128,y=random(i*7+17)*128;
     g.strokeStyle='#55863b80';g.lineWidth=1.2;g.beginPath();g.moveTo(x,y+5);g.lineTo(x-2,y);g.moveTo(x,y+5);g.lineTo(x+2,y-2);g.stroke()}
 }else if(kind==='road'){
   g.fillStyle='#667579';g.fillRect(0,0,128,128);
   for(let i=0;i<180;i++){g.fillStyle=i%2?'#b9c3bc15':'#263d4d21';
     g.fillRect(random(i*7+23)*128,random(i*11+29)*128,2+random(i+40)*4,1+random(i+33)*3)}
   g.strokeStyle='#bed1d015';g.beginPath();g.moveTo(0,62);g.lineTo(128,61);g.stroke();
 }else if(kind==='soil'){
   g.fillStyle='#68472c';g.fillRect(0,0,128,128);
   for(let i=0;i<200;i++){g.fillStyle=i%4===0?'#3d2a1c6e':i%3===0?'#c098664d':'#8560395b';
     const x=random(i*3+2)*128,y=random(i*7+11)*128;
     g.beginPath();g.ellipse(x,y,1+random(i)*3,1+random(i+15)*2,0,0,Math.PI*2);g.fill()}
 }else if(kind==='wood'){
   g.fillStyle='#d5b18a';g.fillRect(0,0,128,128);
   for(let y=0;y<128;y+=32){
     g.fillStyle=y%64===0?'#ead1ac':'#cca078';g.fillRect(0,y,128,31);
     g.fillStyle='#f5ddbc66';g.fillRect(0,y+3,128,2);
     g.strokeStyle='#916a4d63';g.lineWidth=1.2;g.beginPath();
     g.moveTo(0,y+31);g.lineTo(128,y+31);g.stroke();
     for(let i=0;i<3;i++){const xx=random(y*11+i)*118,yy=y+7+random(i*19+y)*18;
       g.strokeStyle='#885d4540';g.beginPath();g.moveTo(xx,yy);g.quadraticCurveTo(xx+10,yy-2,xx+26,yy);g.stroke()}
   }
 }else if(kind==='roof'){
   g.fillStyle='#c47b55';g.fillRect(0,0,128,128);
   for(let y=0;y<128;y+=16){
     g.fillStyle='#f3ba8b78';g.fillRect(0,y,128,2);
     g.fillStyle='#733f3654';g.fillRect(0,y+14,128,2);
     for(let x=(Math.floor(y/16)%2)*25;x<128;x+=50){
       g.fillStyle='#6b3b2e77';g.fillRect(x,y+2,1.6,12);
     }
   }
 }
 return c;
}
function fill(ctx,kind,x,y,w,h,opacity=1){
 let map=contextPatterns.get(ctx);if(!map){map=new Map();contextPatterns.set(ctx,map)}
 let pattern=map.get(kind);if(!pattern){pattern=ctx.createPattern(patternTile(kind),'repeat');map.set(kind,pattern)}
 ctx.save();ctx.globalAlpha*=opacity;ctx.fillStyle=pattern;ctx.fillRect(x,y,w,h);ctx.restore();
}
export function grassTexture(ctx,x,y,w,h,a=1){fill(ctx,'grass',x,y,w,h,a)}
export function roadTexture(ctx,x,y,w,h,a=1){fill(ctx,'road',x,y,w,h,a)}
export function soilTexture(ctx,x,y,w,h,a=.92){fill(ctx,'soil',x,y,w,h,a)}
export function woodTexture(ctx,x,y,w,h,a=.93){fill(ctx,'wood',x,y,w,h,a)}
export function roofTexture(ctx,x,y,w,h,a=.87){fill(ctx,'roof',x,y,w,h,a)}

import {estateWorld,estateBounds,estateFenceSegments,estateGardenFields} from './shared/estate-layout.js?v=estate-guide-1';

export function drawCommunityMap(canvas,{lots,levels,owners,ownSlot,player,market,others}){
 const ctx=canvas.getContext('2d');
 const {width:w,height:h}=canvas;
 const {left,right,top,bottom}=estateWorld;
 const scale=Math.min((w-32)/(right-left),(h-32)/(bottom-top));
 const originX=(w-(right-left)*scale)/2;
 const originY=(h-(bottom-top)*scale)/2;
 const x=value=>originX+(value-left)*scale;
 const y=value=>originY+(value-top)*scale;
 const rect=(r,color)=>{
   ctx.fillStyle=color;
   ctx.fillRect(x(r.x),y(r.y),r.w*scale,r.h*scale);
 };
 const label=(value,px,py,color='#fff')=>{
   ctx.font='600 21px system-ui';
   ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.lineWidth=4;ctx.strokeStyle='#122b29';ctx.strokeText(value,x(px),y(py));
   ctx.fillStyle=color;ctx.fillText(value,x(px),y(py));
 };
 const marker=(px,py,radius,color)=>{
   ctx.beginPath();ctx.arc(x(px),y(py),radius,0,Math.PI*2);
   ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#142e2b';ctx.lineWidth=3;ctx.stroke();
 };

 ctx.fillStyle='#152d2a';ctx.fillRect(0,0,w,h);
 rect({x:left,y:top,w:right-left,h:bottom-top},'#365f46');
 rect({x:left,y:560,w:right-left,h:176},'#435a63');
 rect({x:left,y:645,w:right-left,h:5},'#bcc4a2');
 for(const lot of lots){
   const level=levels.get(lot.slot),own=lot.slot===ownSlot;
   const {x:west,y:north,w:width,h:height,gateY}=estateBounds(lot,level);
   const rear=lot.slot<4?north:north+height;
   const step=gateY+(lot.slot<4?-24:24);
   const fill=own?'#5b9366':owners.has(lot.slot)?'#517855':'#42694c';
   rect({x:lot.x,y:Math.min(rear,gateY),w:lot.w,h:height},fill);
   rect({x:west,y:Math.min(rear,step),w:width,h:Math.abs(rear-step)},fill);
   for(const field of estateGardenFields(lot,level))rect(field,'#9d7755');
   ctx.beginPath();
   for(const [ax,ay,bx,by] of estateFenceSegments(lot,level)){
     ctx.moveTo(x(ax),y(ay));ctx.lineTo(x(bx),y(by));
   }
   ctx.strokeStyle=own?'#d8f6ba':'#83a383';ctx.lineWidth=own?3:1.5;ctx.stroke();
   rect({x:lot.x+35,y:lot.y+55,w:192,h:165},own?'#f4bf73':'#c38c61');
   label(String(lot.slot+1),lot.x+130,lot.y+135);
 }
 const marketX=market.x+market.w/2,marketY=market.y+market.h/2;
 ctx.save();
 ctx.translate(x(marketX),y(marketY));
 ctx.rotate(Math.PI/4);
 ctx.fillStyle='#f5cd74';ctx.fillRect(-8,-8,16,16);
 ctx.restore();
 for(const p of others)marker(p.x,p.y,6,'#a9c6ff');
 marker(player.x,player.y,10,'#9cf2da');
}


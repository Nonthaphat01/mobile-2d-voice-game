/**
 * V4 original vector character model and motion system, adapted for V5 Firebase.
 * Source: user-provided game.js (appearance, head, clothing, procedural limbs and walk cycle).
 * No imported image sprites are needed: the original model was drawn using Canvas 2D.
 */
const appearanceOptions = {
 gender:['ชาย','หญิง','ไม่ระบุ'],
 skin:['ขาวอมชมพู','สีน้ำผึ้งอ่อน','สีน้ำผึ้ง','น้ำตาล','น้ำตาลเข้ม'],
 hair:['ดำ','น้ำตาล','ทอง','แดงเข้ม','เทาเงิน'],
 style:['ผมสั้น','ผมยาว','ผมหยิก','ผมมัด'],
 outfit:['ฟ้าคราม','ส้มอิฐ','เขียวใบไม้','ม่วงลาเวนเดอร์','เหลืองมัสตาร์ด','ชมพูกุหลาบ'],
 accessory:['ไม่มี','แว่นตา','หมวกแก๊ป']
};
const baseAppearance={gender:2,skin:1,hair:1,style:0,outfit:0,accessory:0};
const skinTones=[
 ['#fff0dc','#efc1a1','#cc8e7c'],['#ffe3bb','#e5ab7f','#b5755b'],
 ['#f5d298','#c78c5e','#975839'],['#dba474','#a76a47','#794332'],
 ['#b87e5e','#81503c','#55332b']
];
const hairTones=[
 ['#586278','#283244','#151b2c'],['#9e7356','#614534','#382b25'],
 ['#ffe9a2','#cda063','#8d613c'],['#c9695a','#843c35','#482b2f'],
 ['#e1e9ed','#a6aebd','#626d84']
];
const outfitTones=[
 ['#a2e0e8','#4f9aa9','#30707b'],['#ffc196','#d47c5e','#9a493b'],
 ['#d6e899','#7ca464','#436d4e'],['#d1c0f1','#9075b6','#604b83'],
 ['#ffe4a1','#cd9e46','#906632'],['#f7b7c6','#c97792','#8d4964']
];
const bodyProfiles=[
 {shoulder:16.5,waist:12.4,hips:11.2,neck:5,headY:-27,headWidth:13.5,jaw:10.4},
 {shoulder:12.2,waist:8.5,hips:12.1,neck:3.8,headY:-25.7,headWidth:12.4,jaw:7.3},
 {shoulder:14.2,waist:10.8,hips:11.2,neck:4.4,headY:-26,headWidth:13,jaw:8.8}
];
const avatarMotion=new WeakMap();

function cleanAppearance(value){
 const result={...baseAppearance};
 if(!value||typeof value!=='object')return result;
 for(const [key,options] of Object.entries(appearanceOptions)){
   const index=value[key];
   if(Number.isInteger(index)&&index>=0&&index<options.length)result[key]=index;
 }
 return result;
}
function characterAppearance(p){
 if(p.appearance)return p.appearance;
 let hash=0;
 for(const c of p.name||'ผู้เล่น')hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 return {gender:hash%3,skin:1+hash%4,hair:hash%5,style:(hash>>>4)%4,outfit:(hash>>>7)%6,accessory:(hash>>>10)%3};
}
function shapeEllipse(c,x,y,rx,ry,color,angle=0){
 c.beginPath();c.ellipse(x,y,rx,ry,angle,0,2*Math.PI);c.fillStyle=color;c.fill();
}
function shapeRound(c,x,y,w,h,r,color){
 c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();
}
function shapeLine(c,points,color,width=1){
 c.beginPath();c.moveTo(...points[0]);
 for(const point of points.slice(1))c.lineTo(...point);
 c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
}
function lightGradient(c,x1,y1,x2,y2,tones){
 const gradient=c.createLinearGradient(x1,y1,x2,y2);
 tones.forEach((tone,index)=>gradient.addColorStop(index/(tones.length-1),tone));
 return gradient;
}
function activityPose(action,now){
 if(!action)return null;
 const phase=Math.max(0,Math.min(1,(now-action.started)/action.duration));
 const beat=Math.sin(phase*Math.PI*(action.kind==='cook'?8:4));
 return {kind:action.kind,item:action.item,phase,beat};
}
function smoothstep(from,to,value){return ease((value-from)/(to-from))}
function ease(value){
 const fraction=Math.max(0,Math.min(1,value));
 return fraction*fraction*(3-2*fraction);
}
function poseProgress(p,now){
 const m=p.poseMotion;
 if(!m)return {seat:p.pose==='sit'?1:0,x:p.x,y:p.y};
 const progress=Math.max(0,Math.min(1,(now-m.started)/m.duration));
 const sitting=m.kind==='sit';
 const travel=ease(sitting?progress/.72:(progress-.3)/.7);
 return {
   seat:sitting?ease((progress-.2)/.8):1-ease(progress/.7),
   x:m.fromX+(p.x-m.fromX)*travel,y:m.fromY+(p.y-m.fromY)*travel
 };
}
function movingCharacter(p,now){
 const face=Number.isFinite(p.face)?p.face:Math.PI/2;
 const place=p.scene||'outside';
 let motion=avatarMotion.get(p);
 if(!motion){
   motion={face,body:face,phase:0,steps:0,blend:0,sleep:p.pose==='sleep'?1:0,now,x:p.x,y:p.y,place};
   avatarMotion.set(p,motion);
 }
 const gap=now-motion.now;
 const elapsed=Math.max(0,Math.min(50,gap));
 const snap=gap>250||place!==motion.place||Math.hypot(p.x-motion.x,p.y-motion.y)>100;
 if(snap){
   Object.assign(motion,{x:p.x,y:p.y,face,body:face,blend:0,phase:0,place});
 }
 const follow=p.id&&!p.positionInterpolated&&!p.poseMotion&&!p.action&&p.pose==='stand'&&!snap?1-Math.exp(-elapsed/44):1;
 const x=motion.x+(p.x-motion.x)*follow;
 const y=motion.y+(p.y-motion.y)*follow;
 const dx=x-motion.x,dy=y-motion.y,travel=Math.hypot(dx,dy);
 const walking=!!p.walking&&!p.action&&(!p.pose||p.pose==='stand');
 const heading=walking&&travel>.05?Math.atan2(dy,dx):face;
 const turn=(previous,target,delay)=>previous+Math.atan2(Math.sin(target-previous),Math.cos(target-previous))*(1-Math.exp(-elapsed/delay));
 motion.face=turn(motion.face,face,52);
 motion.body=turn(motion.body,heading,98);
 const speed=elapsed?travel*1000/elapsed:0;
 const effort=walking?Math.min(1,speed/(p.route?62:p.swimming?100:155)):0;
 motion.blend+=(effort-motion.blend)*(1-Math.exp(-elapsed/(effort>motion.blend?78:110)));
 if(walking&&travel>.02){
   const stride=p.route?62:p.swimming?92:112;
   const phase=motion.phase+travel/stride*2*Math.PI;
   motion.steps+=Math.floor(phase/Math.PI)-Math.floor(motion.phase/Math.PI);
   motion.phase=phase%(2*Math.PI);
 }
 motion.sleep=Math.max(0,Math.min(1,motion.sleep+(p.pose==='sleep'?1:-1)*elapsed/480));
 if(p.pose==='sleep')motion.onBed=p.onBed;
 Object.assign(motion,{now,x,y});
 return motion;
}
function stepPose(phase,side){
 const cycle=(phase/(2*Math.PI)+(side===1?.5:0))%1;
 const stance=.60;
 if(cycle<stance)return {reach:1-2*cycle/stance,lift:0};
 const swing=(cycle-stance)/(1-stance);
 return {reach:2*ease(swing)-1,lift:Math.sin(swing*Math.PI)};
}
function drawSleeper(c,a,skin,hair,shirt,now,onBed,progress){
 c.save();
 c.rotate(onBed?-.03:.12);
 const breath=Math.sin(now/640)*.65;
 const profile=bodyProfiles[a.gender];
 if(onBed){
   shapeRound(c,-51,-19,40,37,11,'#bdaabc65');
   shapeRound(c,-52,-22,40,37,11,lightGradient(c,0,-22,0,15,['#fffaf4','#faf2e8','#ded6d4']));
   shapeLine(c,[[-48,5],[-45,10],[-18,10]],'#d8cacb',1.1);
 }else{
   shapeEllipse(c,-3,14,41,10,'#171b3429');
   shapeEllipse(c,30,18,21,6,'#171b3429');
 }
 // The farther limbs rest partly behind the body. Both bent knees and feet stay visible.
 shapeLine(c,[[-13,-6],[-22,-13],[-36,-9]],skin[2],5.7);
 shapeEllipse(c,-37,-9,3.4,2.8,skin[1],-.25);
 shapeLine(c,[[10,1],[30,-4],[45,4]],'#37445a',10.5);
 shapeLine(c,[[14,-2],[29,-6],[41,1]],'#637185',2.4);
 shapeEllipse(c,47,5,4.1,6.2,'#e0dcd2',-.23);
 shapeLine(c,[[11,5],[29,11],[42,19]],'#435670',10.5);
 shapeLine(c,[[16,4],[30,8],[41,16]],'#73819a',2.4);
 shapeEllipse(c,45,19,4.6,6.4,'#faf1dc',-.34);
 shapeLine(c,[[42,15],[45,16],[47,19]],'#c8bfb7',1.2);
 // A lifted shoulder and a small rise of the chest give the breathing motion a fixed rest position.
 const shoulder=-7-profile.shoulder*.15-breath;
 shapeEllipse(c,-21,1,7.6,5.1,skin[2],.12);
 c.beginPath();
 c.moveTo(-18,shoulder);
 c.bezierCurveTo(-8,shoulder-3,1,-7-breath,13,-5);
 c.quadraticCurveTo(18,-4,17,4);
 c.quadraticCurveTo(17,10,9,10.5);
 c.bezierCurveTo(0,10,-9,13,-17,9);
 c.quadraticCurveTo(-22,3,-18,shoulder);
 c.fillStyle=lightGradient(c,0,-12,0,13,shirt);c.fill();
 shapeLine(c,[[-16,-7],[-14,-3],[-17,2]],shirt[0],1.4);
 shapeLine(c,[[11,-4],[13,3],[12,9]],shirt[2],1.2);
 shapeLine(c,[[-15,3-breath],[-10,8-breath]],shirt[2],8);
 shapeLine(c,[[-10,8-breath],[-14,15],[-25,12]],skin[2],5.6);
 shapeLine(c,[[-10,8-breath],[-14,13.8],[-24,11]],skin[1],3);
 shapeEllipse(c,-26,11.6,4,3.1,skin[0],.19);
 // The cheek sits against the pillow, with one elbow folded toward the face.
 const headX=-33,headY=-1;
 if(a.style===1)shapeEllipse(c,headX-5,headY+4,15,12,hair[2],-.2);
 if(a.style===3)shapeEllipse(c,headX-10,headY-8,6,5.5,hair[2],-.27);
 shapeEllipse(c,headX,headY,13.6,11.5,lightGradient(c,-42,-11,-25,7,hair),-.26);
 if(a.style===2){
   for(const [dx,dy] of [[-9,-6],[-5,-9],[0,-10],[5,-9],[8,-6]]){
     shapeEllipse(c,headX+dx,headY+dy,4,3.8,hair[1],-.22);
     shapeEllipse(c,headX+dx-.7,headY+dy-1.2,1.5,1,hair[0],-.22);
   }
 }
 shapeEllipse(c,headX+9,headY+1.9,3.3,4.1,skin[2],.23);
 c.beginPath();
 c.moveTo(headX-11,headY-3);
 c.quadraticCurveTo(headX-5,headY-3,headX+1,headY-7);
 c.quadraticCurveTo(headX+4,headY-4,headX+10,headY-2);
 c.quadraticCurveTo(headX+13,headY+5,headX+7,headY+9.5);
 c.quadraticCurveTo(headX+3,headY+13,headX-5,headY+10);
 c.quadraticCurveTo(headX-12,headY+7,headX-11,headY-3);
 c.fillStyle=lightGradient(c,-40,-4,-26,10,skin);c.fill();
 shapeLine(c,[[headX-7,headY+1],[headX-5,headY+2.3],[headX-2.7,headY+1.6]],hair[2],1.3);
 shapeLine(c,[[headX+2.2,headY+1.2],[headX+4.4,headY+2.3],[headX+6.8,headY+1]],hair[2],1.3);
 shapeEllipse(c,headX+.3,headY+4,1.4,1.1,skin[2]);
 shapeLine(c,[[headX-1.4,headY+6.7],[headX+.8,headY+7],[headX+2,headY+6.5]],'#a16863',1);
 shapeEllipse(c,headX+7.3,headY+4.3,2.5,1.35,'#d17a6b43',-.15);
 if(progress>.85){
   const alpha=c.globalAlpha;
   c.fillStyle='#466e89';c.textAlign='center';
   for(let i=0;i<3;i++){
     const drift=(now/2300+i/3)%1;
     c.globalAlpha=alpha*Math.sin(drift*Math.PI)*.83;
     c.font='bold '+Math.round(9+drift*9)+'px system-ui';
     c.fillText('z',-29+drift*27+Math.sin(drift*5)*3,-18-drift*26);
   }
   c.globalAlpha=alpha;
 }
 c.restore();
}
function drawHead(c,lookX,lookY,a,skin,hair,shirt,speaking,motion,now,unhappy=false){
 const side=Math.abs(lookX),turn=side*side,direction=Math.sign(lookX)||1;
 const away=smoothstep(.22,.92,-lookY),back=away>.75;
 const profile=bodyProfiles[a.gender];
 const headX=lookX*2, headY=profile.headY;
 c.save();c.translate(headX,headY);
 const hairFill=lightGradient(c,-9,-13,10,12,hair);
 if(a.style===1||a.style===3){
   shapeEllipse(c,a.style===1?0:-7,-1,a.style===1?15:8,a.style===1?19:11,hair[2],.28);
   shapeEllipse(c,-9,4,3,9,hair[1],.22);
 }
 const width=profile.headWidth-turn*2.5,jaw=profile.jaw-turn*2;
 const frontWeight=turn*(1-away), nose=frontWeight*4.8;
 const contour=(x,y)=>[x*direction,y];
 const earBack=-width+1+turn*4;
 shapeEllipse(c,...contour(earBack,1),3.1,4,skin[2]);
 if(turn<.9){
   c.save();c.globalAlpha*=1-turn;
   shapeEllipse(c,...contour(width-1,1),3.1,4,skin[1]);
   c.restore();
 }
 c.beginPath();
 c.moveTo(...contour(-width,1));
 c.bezierCurveTo(...contour(-width-2,-21),...contour(width+2,-21),...contour(width-frontWeight*1.4,-1.4));
 c.quadraticCurveTo(...contour(width-frontWeight*.4,1.2),...contour(width+nose*.84,2.8));
 c.quadraticCurveTo(...contour(width+nose,3.7),...contour(width-frontWeight*.55,5));
 c.quadraticCurveTo(...contour(width+frontWeight*.8,8.6),...contour(jaw+frontWeight*3.5,10.1));
 c.quadraticCurveTo(...contour(frontWeight*2.9,a.gender===1?17.6:15),...contour(-jaw,10.1));
 c.quadraticCurveTo(...contour(-width,8),...contour(-width,1));
 c.fillStyle=lightGradient(c,-10,-11,9,11,skin);c.fill();
 if(away>0){
   c.save();c.globalAlpha*=away;
   c.fillStyle=hairFill;c.fill();c.restore();
 }
 if(away<.92){
   c.save();c.globalAlpha*=1-away;
   shapeEllipse(c,...contour(5.4+turn*.6,6),3.4,1.8,'#d17a6b46');
   if(turn<.5)shapeEllipse(c,...contour(-7,6),3.4*(1-turn),1.8,'#d17a6b46');
   const gazeX=lookX*5.7, gazeY=lookY*.9+(motion?.kind==='read'?1.4:0);
   const blink=(now+(a.hair+1)*413)%3900>3770;
   for(const offset of [-5.4,5.4]){
     const far=Math.sign(offset)!==direction;
     const alpha=far?1-smoothstep(.45,.85,side):1;
     if(alpha<=.01)continue;
     c.save();c.globalAlpha*=alpha;
     const ex=gazeX+offset*(1-.7*turn),eyeWidth=1-.37*turn;
     const slope=unhappy?Math.sign(offset)*1.4:0;
     shapeLine(c,[[ex-2*eyeWidth,-3.4+gazeY+slope],[ex+.6,-4.1+gazeY],[ex+2.1*eyeWidth,-3.4+gazeY-slope]],hair[1],unhappy?1.65:a.gender===0?1.55:1.05);
     if(blink)shapeLine(c,[[ex-1.6*eyeWidth,.3+gazeY],[ex+1.6*eyeWidth,.3+gazeY]],hair[2],1.35);
     else{
       shapeEllipse(c,ex,.2+gazeY,2.1*eyeWidth,2.4,'#fff9ee');
       shapeEllipse(c,ex+lookX*.55,.2+gazeY,1.27*eyeWidth,1.83,'#263349');
       shapeEllipse(c,ex+lookX*.75-.2,-.6+gazeY,.46,.57,'#fff');
       if(a.gender===1){
         const outer=Math.sign(offset);
         shapeLine(c,[[ex+outer*1.3,-1.5+gazeY],[ex+outer*2.7,-2.35+gazeY]],hair[2],1.05);
       }
     }
     if(a.accessory===1){
       c.beginPath();c.roundRect(ex-4*eyeWidth,-2,8*eyeWidth,6,2);
       c.strokeStyle='#3f5063';c.lineWidth=1.3;c.stroke();
     }
     c.restore();
   }
   if(turn<.65)shapeEllipse(c,gazeX+lookX,3.8,1.7*(1-turn),1.1,skin[2]);
   const chewing=motion?.kind==='eat'&&motion.phase>.26;
   const mouthX=gazeX+lookX*2.6,mouthWidth=2-turn*.75;
   if(speaking||chewing)shapeEllipse(c,mouthX,7.5,mouthWidth+Math.abs(Math.sin(now/83)),1.3+Math.abs(Math.sin(now/75))*1.2,'#91485a');
   else if(unhappy)shapeLine(c,[[mouthX-mouthWidth-1,8.7],[mouthX,6.4],[mouthX+mouthWidth+1,8.7]],'#794751',1.6);
   else shapeLine(c,[[mouthX-mouthWidth,7],[mouthX,8-turn],[mouthX+mouthWidth,7]],'#975d5b',1.25);
   if(a.accessory===1&&side<.8)shapeLine(c,[[gazeX-1,0],[gazeX+1,0]],'#3f5063',1.1);
   c.restore();
 }
 c.save();c.translate(-lookX*1.65,0);c.scale(1-turn*.16,1);
 if(a.style===2){
   for(let i=0;i<9;i++){
     const theta=Math.PI+i*Math.PI/8;
     const x=Math.cos(theta)*11,y=-5+Math.sin(theta)*9;
     shapeEllipse(c,x,y,4.7,5.4,hairFill);
     shapeEllipse(c,x-.9,y-1.6,1.8,1.2,hair[0],.42);
   }
 }else if(a.gender===1){
   c.beginPath();c.moveTo(-12.7,2);
   c.bezierCurveTo(-20,-14,1,-22,11,-14);
   c.quadraticCurveTo(17,-8,12,1);
   c.quadraticCurveTo(9,-5,7,-11);
   c.quadraticCurveTo(-.5,-4,-12.7,2);
   c.fillStyle=hairFill;c.fill();
   c.beginPath();c.moveTo(-11,-7);c.quadraticCurveTo(-6,-15,4,-13);
   c.strokeStyle=hair[0];c.lineWidth=1.6;c.stroke();
 }else{
   c.beginPath();c.moveTo(-13,-2);c.bezierCurveTo(-18,-19,13,-24,14,-6);
   c.quadraticCurveTo(12,-5,12,-1);c.quadraticCurveTo(8,-7,3,-9);
   c.quadraticCurveTo(-4,-2,-13,-2);c.fillStyle=hairFill;c.fill();
   c.beginPath();c.moveTo(-11,-9);c.quadraticCurveTo(-4,-17,5,-13);
   c.strokeStyle=hair[0];c.lineWidth=1.7;c.lineCap='round';c.stroke();
 }
 if(a.style===3){
   shapeEllipse(c,8,-15,6.7,5.4,hair[2],.5);
   shapeEllipse(c,7,-17,3.5,2.1,hair[0],.6);
   shapeEllipse(c,7,-13,4.2,1.2,shirt[0],-.1);
 }
 if(a.accessory===2){
   shapeEllipse(c,-.5,-13,14,5.6,shirt[2]);
   shapeEllipse(c,-1.6,-15,12,5,lightGradient(c,-10,-18,12,-11,shirt));
   if(!back)shapeEllipse(c,lookX*4,-9,12.5,3.4,shirt[0],lookX*.12);
   shapeEllipse(c,-1.5,-19,2.2,1.2,shirt[0]);
 }
 c.restore();
 c.restore();
}
function fishCast(phase){
 return smoothstep(.035,.15,phase)-smoothstep(.15,.28,phase);
}
function drawHeldProp(c,motion,x,y,now,lookX){
 if(motion.kind==='cook'){
   shapeEllipse(c,x+1,y+1,11,5,'#263f46');
   shapeEllipse(c,x+1,y,9.6,4,'#586e6e');
   shapeEllipse(c,x+1,y-.4,6.2,2.5,'#fbcf72');
   shapeLine(c,[[x+8,y],[x+15,y-2]],'#353c41',3);
   shapeLine(c,[[x-8,y-9],[x+motion.beat*6,y-.8]],'#a47954',2.8);
   for(let i=0;i<3;i++){
     const ascent=((now/1450)+i/3)%1;
     shapeEllipse(c,x-6+i*6+Math.sin(ascent*5+i)*2,y-6-ascent*11,1.1+ascent,1.7+ascent,'rgba(245,255,226,'+(.8-ascent*.8)+')');
   }
 }else if(motion.kind==='eat'){
   const held=motion.item==='sandwich';
   if(held){
     shapeRound(c,x-5,y-3,10,7,2,'#ce8746');
     shapeRound(c,x-4.5,y-2,9,3,1,'#ffe7a4');
     shapeLine(c,[[x-4,y+1],[x+4,y+1]],'#83a24a',1.6);
   }else{
     shapeLine(c,[[x+4,y+6],[x-2,y-3]],'#d0e2e0',2.3);
     shapeEllipse(c,x-2,y-3,3.4,2.4,'#eec27c');
   }
 }else if(motion.kind==='water'){
   shapeRound(c,x-6,y-4,13,9,2,'#65c5c8');
   shapeLine(c,[[x+4,y+1],[x+11,y+2],[x+14,y+6]],'#3b8d9f',2.8);
   c.beginPath();c.arc(x-4,y-3,4,Math.PI,Math.PI*1.85);c.strokeStyle='#296a78';c.lineWidth=2;c.stroke();
   for(let i=0;i<3;i++){
     const drip=((now/390)+i/3)%1;
     shapeEllipse(c,x+14+drip*7,y+7+drip*9,1,1.5,'#b4edf3');
   }
 }else if(motion.kind==='plant'||motion.kind==='harvest'){
   shapeLine(c,[[x-1,y-7],[x+4,y+1]],'#ba8a59',2.8);
   shapeEllipse(c,x+4,y+3,3.2,5.1,'#c0d8d6',-.52);
   shapeEllipse(c,x+3,y+3,1.5,2.8,'#dae9df',-.52);
 }else if(motion.kind==='read'){
   const cover='#74558d',page='#fff1d8',spineY=-5;
   shapeRound(c,-12,-12,24,14,2,cover);
   c.beginPath();c.moveTo(0,1);c.quadraticCurveTo(-6,-2,-11,0);
   c.lineTo(-11,-11);c.quadraticCurveTo(-5,-13,0,-9);
   c.quadraticCurveTo(5,-13,11,-11);c.lineTo(11,0);c.quadraticCurveTo(5,-2,0,1);
   c.fillStyle=page;c.fill();
   shapeLine(c,[[0,-9],[0,0]],'#caa88e',1);
   for(let i=0;i<3;i++){
     shapeLine(c,[[-8,spineY+i*2],[-3,spineY+i*2+1]],'#c9a68f',.7);
     shapeLine(c,[[3,spineY+i*2+1],[8,spineY+i*2]],'#c9a68f',.7);
   }
   const pageTurn=Math.max(0,Math.sin((motion.phase*3%1)*Math.PI*2))**14;
   if(pageTurn>.03){
     c.beginPath();c.moveTo(0,-9);c.quadraticCurveTo(5-12*pageTurn,-18,10-20*pageTurn,-10);
     c.lineTo(10-20*pageTurn,0);c.quadraticCurveTo(5,-3,0,1);c.fillStyle='#fff8e8';c.fill();
   }
 }else if(motion.kind==='fish'){
   const direction=lookX<-.17?-1:1,cast=fishCast(motion.phase);
   const tipX=direction*(16+cast*8),tipY=-25+cast*8;
   shapeLine(c,[[x,y+2],[x+direction*3,y-3]],'#614938',3.7);
   shapeLine(c,[[x,y],[x+direction*5,y-12],[tipX,tipY]],'#51493e',1.9);
   shapeEllipse(c,x-direction*1.5,y,3,2.5,'#c8a96c');
   shapeEllipse(c,tipX,tipY,1.2,1.2,'#ebce87');
 }
}
function drawShirt(c,profile,a,shirt,skin,side,back){
 const shoulder=profile.shoulder*side,waist=profile.waist*side,hips=profile.hips*side,neck=profile.neck;
 c.beginPath();
 c.moveTo(-neck,-17);c.quadraticCurveTo(-shoulder,-16,-shoulder,-10);
 c.quadraticCurveTo(-shoulder,-7,-waist,1);
 c.quadraticCurveTo(-hips,5,-hips,8);
 c.quadraticCurveTo(0,10,hips,8);
 c.quadraticCurveTo(hips,5,waist,1);
 c.quadraticCurveTo(shoulder,-7,shoulder,-10);
 c.quadraticCurveTo(shoulder,-16,neck,-17);
 c.closePath();
 c.fillStyle=lightGradient(c,-shoulder,-13,shoulder,8,shirt);c.fill();
 shapeLine(c,[[-hips+2,7],[0,8],[hips-2,7]],shirt[2],1.2);
 shapeRound(c,-neck,-20,neck*2,6.7,3,skin[2]);
 if(back)return;
 if(a.gender===1){
   c.beginPath();c.moveTo(-neck-2,-15);c.quadraticCurveTo(0,-8,neck+2,-15);
   c.strokeStyle=shirt[0];c.lineWidth=1.55;c.stroke();
   shapeLine(c,[[-waist+1,1],[0,2],[waist-1,1]],shirt[0],1.2);
 }else{
   shapeLine(c,[[-neck,-15],[0,-11],[neck,-15]],shirt[0],1.45);
   shapeRound(c,3,-6,5.5,4.8,1.35,shirt[0]);
 }
}
function drawSwimmer(c,p,now,a,skin,hair,shirt,face,speaking,swing){
 const headingX=Math.cos(face),headingY=Math.sin(face);
 const kick=now/(p.walking?112:220);
 const bob=Math.sin(kick)*1.8,bodyY=11+bob;
 const wakeX=-headingX*12*swing,wakeY=-headingY*7*swing;
 shapeEllipse(c,wakeX,5+wakeY,22+swing*9,7,'#a4e3ec5c');
 shapeEllipse(c,0,4,16,6,'#467e8b6a');
 c.save();
 c.beginPath();c.rect(-48,-60,96,64);c.clip();
 c.translate(headingX*bob*.5,bodyY);
 const profile=bodyProfiles[a.gender];
 drawShirt(c,profile,a,shirt,skin,.75,headingY<-.68);
 for(const side of [-1,1]){
   const phase=kick+(side===1?Math.PI:0);
   const reach=(.5+.5*Math.sin(phase))*swing;
   const shoulderX=side*10;
   const handX=side*(15+8*reach)+headingX*reach*6;
   const handY=-5-Math.max(0,Math.cos(phase))*10*reach-headingY*reach*5;
   shapeLine(c,[[shoulderX,-12],[(handX+shoulderX)*.55,-10],[handX,handY]],skin[2],5.2);
   shapeLine(c,[[shoulderX,-12],[(handX+shoulderX)*.55,-11],[handX,handY-1]],skin[1],3.1);
   shapeEllipse(c,handX,handY,2.8,2.6,skin[0]);
 }
 drawHead(c,headingX,headingY,a,skin,hair,shirt,speaking,null,now);
 c.restore();
 for(let i=0;i<3;i++){
   const wave=(now/730+i/3)%1,rx=7+wave*18;
   const distance=(8+wave*15)*swing;
   c.beginPath();c.ellipse(-headingX*distance,4-headingY*distance*.4,rx,2+wave*4,0,Math.PI*.08,Math.PI*.92);
   c.strokeStyle='rgba(225,253,251,'+((1-wave)*(.35+.35*swing))+')';c.lineWidth=1.15;c.stroke();
 }
}
function paintCharacter(c,p,now,speaking=false,visual=null,seat=p.pose==='sit'?1:0){
 const a=characterAppearance(p);
 const skin=skinTones[a.skin],hair=hairTones[a.hair],shirt=outfitTones[a.outfit];
 const profile=bodyProfiles[a.gender];
 const motion=activityPose(p.action,now);
 const face=visual?.face??(Number.isFinite(p.face)?p.face:Math.PI/2);
 const body=visual?.body??face;
 const lookX=Math.cos(face),lookY=Math.sin(face);
 const walkX=Math.cos(body),walkY=Math.sin(body);
 const sideView=walkX*walkX,narrow=1-sideView*.49;
 const swing=visual?.blend??Number(!!p.walking&&!motion);
 if(p.swimming){drawSwimmer(c,p,now,a,skin,hair,shirt,face,speaking,swing);return}
 const phase=visual?.phase??now/115;
 const squat=motion?.kind==='exercise'?(.5-.5*Math.cos(motion.phase*Math.PI*8)):0;
 const dancing=motion?.kind==='dance',danceBeat=dancing?motion.phase*Math.PI*16:0;
 const danceSway=dancing?Math.sin(danceBeat):0,danceHop=dancing?Math.abs(Math.sin(danceBeat))*2:0;
 const dip=seat*6+squat*8.4;
 const bob=-Math.abs(Math.sin(phase))*2.35*swing;
 const bend=motion&&['plant','harvest','water'].includes(motion.kind);
 const chestX=Math.cos(phase)*1.05*swing+walkX*(seat*1.5+squat*1.1+swing*1.9)+(bend?1.4:0)+danceSway*3.7;
 const chestY=dip+bob+(bend?3:0)-danceHop+Math.sin(now/580)*.42*(1-swing);
 const sleep=ease(visual?.sleep??Number(p.pose==='sleep'));
 if(sleep>=.72){
   c.save();c.translate(0,4*(1-sleep));
   drawSleeper(c,a,skin,hair,shirt,now,visual?.onBed??p.onBed,sleep);
   c.restore();
   return;
 }
 shapeEllipse(c,2,18,18+squat*2-sideView*4,5.8,'#13243730');
 shapeEllipse(c,1,16,12-sideView*2,4,'#17263d38');
 c.save();
 const fall=ease(sleep/.72);
 if(fall){
   c.translate(-fall,3*fall);c.scale(1+.18*fall,1);
   c.rotate(-Math.PI*.5*fall);
 }
 const legOrder=walkX<-.2?[1,-1]:[-1,1];
 for(const side of legOrder){
   const foot=stepPose(phase,side);
   const reach=foot.reach*swing,lift=foot.lift*swing;
   const danceStep=dancing?Math.max(0,Math.sin(danceBeat)*side):0;
   const hipX=side*(profile.hips*.46)*narrow+chestX;
   const footX=side*(5.7+squat*3.3+seat*.65)*narrow+walkX*(reach*10+seat*2.6)+side*danceStep*4;
   const footY=14+fall*18+walkY*(reach*6+seat*2.9)-lift*4.5-danceStep*3;
   const kneeX=(hipX+footX)*.5+walkX*(lift*2.7+seat*2.9)+side*squat*1.7;
   const kneeY=(chestY+footY)*.5+2+walkY*(seat*2.4+squat*1.7);
   const farther=side===legOrder[0],legWidth=7.6-sideView*(farther?1.8:0);
   shapeLine(c,[[hipX,chestY+5],[kneeX,kneeY],[footX,footY]],farther?'#37465e':'#52647c',legWidth);
   shapeLine(c,[[hipX-.5,chestY+7],[kneeX-.4,kneeY]],'#ffffff27',1.55);
   c.save();c.translate(footX,footY);c.rotate(walkX*(.19+lift*.30-reach*.17));
   shapeRound(c,-5+walkX*1.9,-2.25,10,5.7,2.3,'#2e3c50');
   shapeRound(c,-4.7+walkX*1.9,1.05,9.4,1.9,1,shirt[0]);
   c.restore();
 }
 c.translate(chestX,chestY);
 c.rotate(walkX*swing*.055);
 const propHand=motion?.kind==='fish'&&lookX<-.17?-1:1;
 let heldX=13,heldY=-2;
 const drawArm=side=>{
   const shoulderX=side*(profile.shoulder*narrow-1.6);
   const armSwing=-stepPose(phase,side).reach*swing;
   let handX=shoulderX+side*2.9+walkX*(armSwing*7.2+seat*2);
   let handY=2+walkY*armSwing*3.8-seat*2;
   if(motion?.kind==='eat'&&side===1){
     const lift=Math.min(1,motion.phase*4);
     handX=14-lift*(11+motion.beat);
     handY=-1-lift*(15+motion.beat*2);
   }else if(motion?.kind==='cook'){
     handX=side===1?14+motion.beat*2:-8-motion.beat*3;
     handY=side===1?-4:-8-motion.beat*2;
   }else if(bend&&side===1){
     handX=15+motion.beat*3;handY=5+motion.beat*2;
   }else if(motion?.kind==='exercise'){
     handX=side*(profile.shoulder+2.8-squat*3.8);
     handY=2-squat*12;
   }else if(dancing){
     handX=side*(17+5*Math.cos(danceBeat+side*Math.PI*.3));
     handY=-8-13*(.5+.5*Math.sin(danceBeat+side*Math.PI*.5));
   }else if(motion?.kind==='read'){
     handX=side*9;
     handY=-5;
   }else if(motion?.kind==='fish'){
     const cast=fishCast(motion.phase);
     handX=side===propHand?side*(9+cast*7):side*4;
     handY=(side===propHand?-7:-4)-cast*4;
   }
   const elbow=[(shoulderX+handX)*.5+side*1.7,(-12+handY)*.55+2.4];
   const sleeveWidth=(a.gender===0?7.4:6.7)-sideView*(side===legOrder[0]?1.5:0);
   shapeLine(c,[[shoulderX,-12],elbow,[handX,handY]],shirt[2],sleeveWidth);
   shapeLine(c,[[shoulderX-.65,-11],[elbow[0]-.4,elbow[1]-1]],shirt[0],2.4);
   shapeEllipse(c,handX,handY,3.5,3.7,lightGradient(c,handX-2,handY-3,handX+2,handY+2,skin));
   if(side===propHand){heldX=handX;heldY=handY}
 };
 const sideOn=sideView>.30;
 if(sideOn)drawArm(legOrder[0]);
 drawShirt(c,profile,a,shirt,skin,narrow,walkY<-.65);
 if(!sideOn)drawArm(legOrder[0]);
 drawArm(legOrder[1]);
 drawHead(c,lookX,lookY,a,skin,hair,shirt,speaking,motion,now,p.unhappy);
 if(motion)drawHeldProp(c,motion,heldX,heldY,now,lookX);
 else if(p.inMine){
   c.save();c.translate(heldX,heldY);c.rotate(p.swing?Math.sin(now/74)*1.1-.25:.1);
   shapeLine(c,[[0,5],[5,-14]],'#9d704c',4);
   c.textAlign='center';c.font='17px system-ui';c.fillText(TOOLS[p.tool||0].icon,5,-10);c.restore();
 }
 c.restore();
}
/** Render the original V4 character at a world position. Pass a stable actor object per player. */
export const V4_APPEARANCE_OPTIONS=appearanceOptions;
export const V4_BASE_APPEARANCE=baseAppearance;
export {cleanAppearance};
export function renderClassicAvatar(c,p,now,{speaking=false}={}){
  const pose=poseProgress(p,now),motion=movingCharacter(p,now);
  const x=pose.x+motion.x-p.x,y=pose.y+motion.y-p.y;
  c.save();
  c.translate(x,y);
  paintCharacter(c,p,now,speaking,motion,pose.seat);
  c.restore();
  return {x,y};
}

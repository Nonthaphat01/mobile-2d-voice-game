'use strict';

// World and collision, input, animation, map and game loop.

const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');let W=0,H=0,last=performance.now(),vx=0,vy=0,joyPointer=null;function resize(){W=innerWidth;H=innerHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=W*d;canvas.height=H*d;ctx.setTransform(d,0,0,d,0,0)}addEventListener('resize',resize);
const world={w:780,h:550},objects=[{x:125,y:95,w:130,h:68,t:'sofa'},{x:310,y:120,w:140,h:80,t:'table'},{x:89,y:239,w:76,h:76,t:'plant'},{x:120,y:370,w:120,h:75,t:'bed'},{x:555,y:370,w:115,h:70,t:'cabinet'},{x:475,y:120,w:65,h:65,t:'chair'}];const me={x:390,y:310,face:0,name:'ผู้เล่น',text:'',until:0,color:'#527bea',pose:'stand',furniture:null,walking:false,swimming:false,onBed:false,scene:'room',tool:0};

function toast(t){$('toast').textContent=t}

const MINE={cols:40,rows:28,tile:40,entryX:19,entryY:13};
const TOOLS=[
 {name:'อีเต้อเริ่มต้น',icon:'⛏️',unlock:1,power:1,speed:1},
 {name:'ค้อนเหล็ก',icon:'🔨',unlock:3,power:2,speed:1.06},
 {name:'สว่านขุดแร่',icon:'⚙️',unlock:6,power:3,speed:1.65}
];
let scene='room',roomPosition={x:me.x,y:me.y},minePosition={x:(MINE.entryX+.5)*MINE.tile,y:(MINE.entryY+.5)*MINE.tile};
const mineResetInterval=20*60*1000;
let soloMineResetAt=Date.now()+mineResetInterval;
let miningLevel=1,miningXp=0,minedCount=0,hitCount=0,selectedTool=0,lastMineSwing=0,rockSwingUntil=0,rockSwingAt=0;
let mineBroken=new Set(),mineDamage=new Map(),mineEffects=[],mineView={scale:1,cx:0,cy:0};
const mineIndex=(x,y)=>y*MINE.cols+x;
const rockCell=id=>({x:id%MINE.cols,y:Math.floor(id/MINE.cols)});
function inMineBounds(x,y){return x>=1&&y>=1&&x<MINE.cols-1&&y<MINE.rows-1}
function startingGap(x,y){return x>=17&&x<=21&&y>=11&&y<=15}
function makeStartingGap(){for(let y=11;y<=15;y++)for(let x=17;x<=21;x++)mineBroken.add(mineIndex(x,y))}
function rockVariant(x,y){return ((x*61+y*107+x*y*17)>>>0)%11}
function rockMaxHp(x,y){return 2+(rockVariant(x,y)%3)}
function threshold(lv){return Math.round(17+lv*11+lv*lv*2)}
function miningSpeed(){return (1+Math.min(2.6,(miningLevel-1)*.115))*TOOLS[selectedTool].speed}
function swingCooldown(){return Math.max(105,Math.round(660/miningSpeed()))}
function miningPower(){return TOOLS[selectedTool].power+Math.floor((miningLevel-1)/4)}
function loadMine(){try{let d=JSON.parse(localStorage.getItem('thai2d_mine_v3')||'{}');
 if(Number.isSafeInteger(d.resetAt)&&d.resetAt>0&&d.resetAt<=Date.now()+mineResetInterval)soloMineResetAt=d.resetAt;
 miningLevel=Math.max(1,Math.min(99,Number(d.level)||1));miningXp=Math.max(0,Number(d.xp)||0);
 minedCount=Math.max(0,Number(d.mined)||0);hitCount=Math.max(0,Number(d.hits)||0);
 for(const id of (Array.isArray(d.broken)?d.broken:[]).slice(0,1100)){
  const i=Number(id),p=rockCell(i);if(Number.isInteger(i)&&inMineBounds(p.x,p.y))mineBroken.add(i)
 }
 selectedTool=TOOLS[Number(d.tool)]?.unlock<=miningLevel?Number(d.tool):0;
 }catch(e){} }
function saveMine(){try{const broken=[...(soloMine||mineBroken)].filter(i=>{const p=rockCell(i);return !startingGap(p.x,p.y)});
 localStorage.setItem('thai2d_mine_v3',JSON.stringify({level:miningLevel,xp:miningXp,mined:minedCount,hits:hitCount,broken,tool:selectedTool,resetAt:soloMineResetAt}));
 }catch(e){} }
function miningHud(){const max=threshold(miningLevel);$('mineLevel').textContent='⛏️ Lv. '+miningLevel;
 $('mineSpeed').textContent=miningSpeed().toFixed(1)+'×';$('mineXpBar').style.width=Math.min(100,100*miningXp/max)+'%';
 $('mineXpLabel').textContent='EXP '+miningXp+' / '+max+' • ทุบ '+hitCount+' ครั้ง';
 $('mineOre').textContent='🪨 หิน '+minedCount;$('mineHps').textContent='⚡ '+miningPower()+' / ครั้ง';
 $('mineToolName').textContent='ถือ: '+TOOLS[selectedTool].icon+' '+TOOLS[selectedTool].name;
 for(const button of document.querySelectorAll('[data-tool]')){const i=Number(button.dataset.tool);
  button.classList.toggle('equipped',selectedTool===i);button.classList.toggle('locked',miningLevel<TOOLS[i].unlock);
  button.querySelector('small').textContent=miningLevel<TOOLS[i].unlock?'Lv.'+TOOLS[i].unlock:String(i+1);
 }
}
function switchTool(i){if(!Number.isInteger(i)||!TOOLS[i])return;
 if(miningLevel<TOOLS[i].unlock)return toast('🔒 '+TOOLS[i].name+' ปลดล็อกที่เลเวล '+TOOLS[i].unlock);
 selectedTool=i;miningHud();saveMine();toast('ถืออาวุธ: '+TOOLS[i].icon+' '+TOOLS[i].name)}
function addMineExp(n){miningXp+=n;while(miningLevel<99&&miningXp>=threshold(miningLevel)){
 miningXp-=threshold(miningLevel);miningLevel++;
 mineEffects.push({x:me.x,y:me.y-38,stamp:performance.now(),text:'LEVEL UP! '+miningLevel,col:'#ffe681',big:true});
 toast('🎉 เลเวล '+miningLevel+'! ขุดเร็วขึ้น • พลัง '+miningPower());}
 miningHud()}
function mineSolidAt(x,y){const pad=14,t=MINE.tile;
 for(const px of [x-pad,x+pad])for(const py of [y-pad,y+pad]){
 const tx=Math.floor(px/t),ty=Math.floor(py/t);
 if(!inMineBounds(tx,ty)||!mineBroken.has(mineIndex(tx,ty)))return true;
 }return false}
function mineEnter(){if(scene==='mine')return;if(me.pose!=='stand')rise(false);roomPosition={x:me.x,y:me.y,scene};
 if(scene==='outside')resetTownGreetings();
 scene='mine';me.x=minePosition.x;me.y=minePosition.y;me.pose='stand';me.face=0;me.walking=false;
 document.body.classList.add('mine-mode');$('mineToggle').textContent='↩️ ออกจากเหมือง';
 miningHud();broadcast(snapshot());toast('⛏️ เลือกช่อง 1 แล้วหันเข้าหาหิน กด Space หรือ 💥 เพื่อขุด!')}
function mineExit(){if(scene!=='mine')return;stopMineHold();clearInterval(mineSpaceInterval);minePosition={x:me.x,y:me.y};scene=roomPosition.scene;
 me.x=roomPosition.x;me.y=roomPosition.y;me.face=0;me.walking=false;me.pose='stand';
 document.body.classList.remove('mine-mode');$('mineToggle').textContent='⛏️ ไปเหมือง';
 broadcast(snapshot());toast('ออกจากเหมืองแล้ว บันทึกความคืบหน้าเรียบร้อย')}
$('mineToggle').addEventListener('click',()=>{if(lifeDialog.open||characterDialog.open||me.action||swimAtPlayer()||isInVehicle())return;if(scene==='mine')mineExit();else mineEnter();lifeHud()});
for(const b of document.querySelectorAll('[data-tool]'))b.addEventListener('click',()=>switchTool(Number(b.dataset.tool)));
function makeMineEffect(x,y,text,col='#c5e9ff'){mineEffects.push({x,y,stamp:performance.now(),text,col,big:false});if(mineEffects.length>45)mineEffects.shift()}
function applyRemoteMineHit(id,amount){if(mineBroken.has(id))return;const p=rockCell(id);if(!inMineBounds(p.x,p.y))return;
 mineDamage.set(id,Math.min(rockMaxHp(p.x,p.y), (mineDamage.get(id)||0)+Math.max(0,Math.min(10,Number(amount)||0))));
 rockSwingAt=id;rockSwingUntil=performance.now()+180}
function mineBreak(id,notify=true){const p=rockCell(id);if(!inMineBounds(p.x,p.y)||mineBroken.has(id))return false;
 mineBroken.add(id);mineDamage.delete(id);
 makeMineEffect((p.x+.5)*MINE.tile,(p.y+.5)*MINE.tile,'✦','#ffe59f');
 if(notify)sendMineChange({type:'minebreak',idx:id});saveMine();return true}
function mineTarget(){const x=Math.floor(me.x/MINE.tile),y=Math.floor(me.y/MINE.tile);const fx=Math.cos(me.face),fy=Math.sin(me.face);
 const tx=x+(Math.abs(fx)>=Math.abs(fy)?Math.sign(fx)||1:0),ty=y+(Math.abs(fy)>Math.abs(fx)?Math.sign(fy)||1:0);
 return {tx,ty}}
function mineStrike(tx,ty){if(scene!=='mine'||me.action||characterDialog.open||lifeDialog.open)return;if(roomCode&&!isHost&&roomMineGeneration===null)return toast('กำลังรอแผนที่เหมืองจากเจ้าของห้อง');const now=performance.now();if(now-lastMineSwing<swingCooldown())return;
 if(!Number.isInteger(tx)||!Number.isInteger(ty))return;
 if(!inMineBounds(tx,ty))return toast('สุดขอบเหมืองแล้ว');
 const myx=Math.floor(me.x/MINE.tile),myy=Math.floor(me.y/MINE.tile);
 if(Math.abs(tx-myx)+Math.abs(ty-myy)!==1)return toast('เดินเข้าไปใกล้หินก่อน');
 const id=mineIndex(tx,ty);if(mineBroken.has(id))return toast('ช่องนี้ขุดแล้ว หันไปทางก้อนหิน');
 me.face=Math.atan2(ty-myy,tx-myx);lastMineSwing=now;rockSwingUntil=now+230;rockSwingAt=id;hitCount++;
 const amount=miningPower(),hp=rockMaxHp(tx,ty),damage=Math.min(hp,(mineDamage.get(id)||0)+amount);
 playGameSound(damage>=hp?'break':'rock');
 mineDamage.set(id,damage);sendMineChange({type:'minehit',idx:id,amount});
 makeMineEffect((tx+.5)*MINE.tile,(ty+.5)*MINE.tile,'-'+amount,'#fff1a3');
 addMineExp(4);
 if(damage>=hp){mineBreak(id);minedCount++;awardCoins(3);addMineExp(9+rockVariant(tx,ty)%5);toast('💥 หินแตก! +EXP และ 3 เหรียญ')}
 miningHud();saveMine()}
function doMineStrike(){const t=mineTarget();mineStrike(t.tx,t.ty)}
let mineHolding=false,mineHoldTimer=0;
function stopMineHold(){mineHolding=false;clearInterval(mineHoldTimer)}
$('mineHit').addEventListener('pointerdown',e=>{e.preventDefault();$('mineHit').setPointerCapture(e.pointerId);mineHolding=true;doMineStrike();clearInterval(mineHoldTimer);mineHoldTimer=setInterval(()=>{if(mineHolding)doMineStrike()},55)});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>$('mineHit').addEventListener(type,stopMineHold));
addEventListener('keydown',e=>{if(scene!=='mine'||lifeDialog.open||characterDialog.open||me.action||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
 if(['1','2','3'].includes(e.key)){switchTool(Number(e.key)-1);e.preventDefault()}
 if(e.code==='Space'){e.preventDefault();if(!e.repeat){doMineStrike();clearInterval(mineSpaceInterval);mineSpaceInterval=setInterval(()=>{if(scene==='mine')doMineStrike();else clearInterval(mineSpaceInterval)},60)}}});
let mineSpaceInterval=0;addEventListener('keyup',e=>{if(e.code==='Space'){clearInterval(mineSpaceInterval);mineSpaceInterval=0}});addEventListener('blur',()=>{clearInterval(mineSpaceInterval);mineSpaceInterval=0});
const joy=$('joy'),stick=$('stick');function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,lim=(r.width-62)/2,len=Math.hypot(dx,dy)||1,k=Math.min(1,lim/len);vx=dx*k/lim;vy=dy*k/lim;stick.style.transform=`translate(${dx*k}px,${dy*k}px)`}joy.addEventListener('pointerdown',e=>{if(joyPointer!==null)return;joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoy(e)});for(const type of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(type,e=>{if(e.pointerId===joyPointer){joyPointer=null;vx=vy=0;stick.style.transform=''}});const keys=new Set();const movementKeys=new Set(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);function movementKey(e){return /^Key[WASD]$/.test(e.code)?e.code[3].toLowerCase():e.key.startsWith('Arrow')?e.key:e.key.toLowerCase()}addEventListener('keydown',e=>{if(lifeDialog.open||characterDialog.open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;const k=movementKey(e);if(movementKeys.has(k)){keys.add(k);e.preventDefault()}});addEventListener('keyup',e=>{const k=movementKey(e);if(movementKeys.has(k)){keys.delete(k);e.preventDefault()}});addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear()});const activatables=new Set(['bed','sofa','chair']);

function objectAt(x,y){return (scene==='outside'?outsideBlocks:objects).find(o=>x+15>o.x&&x-15<o.x+o.w&&y+15>o.y&&y-15<o.y+o.h)}
function hit(x,y){if(scene==='outside')return x<24||y<24||x>TOWN.w-24||y>TOWN.h-24||!!objectAt(x,y);return x<40||y<40||x>740||y>510||!!objectAt(x,y)}
function rect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function circle(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function drawDecor(now){
 const t=now/1000;
 // Window: moving clouds and a cozy animated glow.
 rect(510,30,195,55,9,'#5b7d8c');rect(516,36,183,43,6,'#83c8d1');
 circle(560+Math.sin(t/6)*25,48,11,'#e5f6f1c9');circle(576+Math.sin(t/6)*25,50,9,'#e5f6f1c9');
 rect(605+Math.sin(t/8)*15,46,59,10,8,'#e5f6f1aa');
 rect(600,36,5,43,2,'#e8ded0');rect(516,55,183,4,1,'#e8ded0');
 // Warm lamp in a corner, gently pulsing.
 const g=ctx.createRadialGradient(697,300,3,697,300,120);g.addColorStop(0,'#ffe8a85d');g.addColorStop(1,'#ffe8a800');
 ctx.fillStyle=g;ctx.fillRect(575,178,248,248);circle(697,300,10,'#efc579');circle(697,300,4,'#fff6d2');
 // Rug and woven rug pattern.
 rect(266,236,250,210,23,'#9bc1b2');rect(277,247,228,188,19,'#bcdacf');
 ctx.strokeStyle='#d5ece2';ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.roundRect(291+i*8,263+i*8,200-i*16,156-i*16,14);ctx.stroke()}
 // Paintings and a clock on the wall.
 rect(93,30,96,44,5,'#9b8263');rect(98,35,86,34,3,'#d4e6ba');
 circle(125,46,7,'#f5de84');ctx.fillStyle='#709e7b';ctx.beginPath();ctx.moveTo(101,68);ctx.lineTo(133,47);ctx.lineTo(163,68);ctx.fill();
 circle(393,54,20,'#faf5df');circle(393,54,16,'#c9dfea');
 ctx.save();ctx.translate(393,54);ctx.rotate(t/60);rect(-1,-12,2,12,1,'#57677b');ctx.restore();
 ctx.save();ctx.translate(393,54);ctx.rotate(t/5);rect(-1,-14,2,14,1,'#57677b');ctx.restore();
 // Floating dust motes for an animated, lived-in scene.
 for(let i=0;i<15;i++){const x=65+(i*139)%655+Math.sin(t*.7+i)*7,y=85+(i*71)%390+Math.cos(t*.6+i)*7;circle(x,y,1.2+Math.sin(t+i)*.3,'#fff8d875')}
}
function drawFurniture(o,now){
 const t=now/1000;
 const colors={sofa:'#527f9f',table:'#aa7950',plant:'#67976c',bed:'#b67d91',cabinet:'#94795e',chair:'#ae865d'};
 rect(o.x+5,o.y+6,o.w,o.h,11,'#172b3540');rect(o.x,o.y,o.w,o.h,11,colors[o.t]);
 if(o.t==='sofa'){
   rect(o.x+9,o.y+9,o.w-18,20,6,'#97c6d8');rect(o.x+10,o.y+34,48,24,7,'#75adc7');rect(o.x+68,o.y+34,50,24,7,'#75adc7');
 }
 if(o.t==='table'){
  rect(o.x+10,o.y+10,o.w-20,o.h-20,6,'#c89f74');circle(o.x+35,o.y+33,11,'#f6e9d6');circle(o.x+35,o.y+33,8,'#8e6653');
  ctx.strokeStyle='#ffffffb0';ctx.lineWidth=2;for(let i=0;i<2;i++){ctx.beginPath();const sx=o.x+30+i*8+Math.sin(t*2+i)*3;ctx.moveTo(sx,o.y+20);ctx.quadraticCurveTo(sx+6,o.y+10,sx,o.y+4);ctx.stroke()}
  rect(o.x+69,o.y+23,38,23,4,'#e4cba0');rect(o.x+73,o.y+27,30,3,1,'#688aa8');
 }
 if(o.t==='bed'){
  rect(o.x+7,o.y+5,o.w-14,o.h-10,9,'#e7ccd3');rect(o.x+12,o.y+11,37,o.h-22,8,'#fff8ed');
  rect(o.x+52,o.y+11,o.w-63,o.h-22,7,'#8fc4cc');
  ctx.strokeStyle='#ecf4e9a8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x+75,o.y+14);ctx.lineTo(o.x+75,o.y+o.h-13);ctx.stroke();
 }
 if(o.t==='chair'){rect(o.x+7,o.y+6,o.w-14,15,5,'#eac69d');rect(o.x+11,o.y+28,o.w-22,o.h-37,7,'#e0b583')}
 if(o.t==='plant'){
  rect(o.x+35,o.y+56,36,39,8,'#c38b68');
  for(let i=0;i<5;i++){ctx.save();ctx.translate(o.x+52,o.y+50);ctx.rotate(Math.sin(t*1.3+i)*.06+i*.74);ctx.fillStyle=i%2?'#408c5f':'#78bc7a';ctx.beginPath();ctx.ellipse(0,-20-i*2,10,22,.1,0,Math.PI*2);ctx.fill();ctx.restore()}
 }
 if(o.t==='cabinet'){
  rect(o.x+9,o.y+11,o.w-18,15,5,'#ac947a');rect(o.x+9,o.y+34,o.w-18,26,5,'#b39c82');circle(o.x+o.w/2,o.y+46,4,'#eadbb1');
  rect(o.x+7,o.y-11,31,17,4,'#a6d1c4');circle(o.x+24,o.y-13,8,'#a9d3a1');
 }
}
function drawMine(now){
 const tile=MINE.tile;
 const scale=Math.max(.82,Math.min(1.28,Math.min(W/530,H/600)*1.08));
 const vw=W/scale,vh=H/scale;
 const camX=Math.max(0,Math.min(MINE.cols*tile-vw,me.x-vw/2));
 const camY=Math.max(0,Math.min(MINE.rows*tile-vh,me.y-vh/2));
 mineView={scale,cx:camX,cy:camY};
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b111d';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.scale(scale,scale);ctx.translate(-camX,-camY);
 const minC=Math.max(0,Math.floor(camX/tile)-1),maxC=Math.min(MINE.cols-1,Math.ceil((camX+vw)/tile)+1);
 const minR=Math.max(0,Math.floor(camY/tile)-1),maxR=Math.min(MINE.rows-1,Math.ceil((camY+vh)/tile)+1);
 for(let y=minR;y<=maxR;y++)for(let x=minC;x<=maxC;x++){
   const bx=x*tile,by=y*tile,id=mineIndex(x,y),v=rockVariant(x,y);
   if(mineBroken.has(id)){
     rect(bx,by,tile+.5,tile+.5,0,(x+y)%2===0?'#263345':'#2b3948');
     ctx.strokeStyle='#364559';ctx.lineWidth=.8;ctx.strokeRect(bx+1,by+1,tile-2,tile-2);
     circle(bx+13+v,by+10+(v%7),2,'#59707b');circle(bx+30,by+30,1.5,'#596f75');
     if((x*13+y*7)%13===0)circle(bx+30,by+9,2,'#90c6bf');
     continue;
   }
   const border=x===0||y===0||x===MINE.cols-1||y===MINE.rows-1;
   rect(bx,by,tile+.3,tile+.3,1,border?'#1b2333':v%3===0?'#627082':v%3===1?'#536273':'#58687a');
   rect(bx+3,by+3,tile-6,tile-7,5,border?'#283346':v%2?'#657686':'#6f7f8d');
   ctx.strokeStyle='#354756';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(bx+9,by+11);ctx.lineTo(bx+18,by+15);ctx.lineTo(bx+15,by+24);ctx.moveTo(bx+22,by+27);ctx.lineTo(bx+30,by+19);ctx.stroke();
   if(v===1||v===7){ctx.fillStyle=v===7?'#e4b76d':'#9ce1d0';ctx.beginPath();ctx.moveTo(bx+27,by+10);ctx.lineTo(bx+33,by+17);ctx.lineTo(bx+28,by+25);ctx.lineTo(bx+22,by+17);ctx.fill()}
   const taken=mineDamage.get(id)||0;if(taken>0){
     const pct=Math.min(1,taken/rockMaxHp(x,y));ctx.strokeStyle='#201f28';ctx.lineWidth=1.6+pct*1.4;ctx.beginPath();ctx.moveTo(bx+7,by+6);ctx.lineTo(bx+19,by+20);ctx.lineTo(bx+10,by+32);if(pct>.4){ctx.moveTo(bx+19,by+20);ctx.lineTo(bx+35,by+12)}if(pct>.7){ctx.moveTo(bx+19,by+20);ctx.lineTo(bx+30,by+36)}ctx.stroke();
   }
   if(rockSwingAt===id&&now<rockSwingUntil){rect(bx+3,by+3,tile-6,tile-6,4,'#fff8d055')}
 }
 // Mining lights follow players, but rocks remain visible around them.
 for(const p of others.values())if(p.scene==='mine')avatar(p);
 avatar(me);
 for(const e of mineEffects){const age=(now-e.stamp)/1000;if(age>1.1)continue;
   ctx.save();ctx.globalAlpha=Math.max(0,1-age/.95);ctx.textAlign='center';ctx.font=e.big?'bold 23px system-ui':'bold 18px system-ui';ctx.fillStyle=e.col;ctx.fillText(e.text,e.x,e.y-age*47);ctx.restore();
 }
 mineEffects=mineEffects.filter(e=>now-e.stamp<1100);
 // Subtle light spilling from the entrance.
 const lx=(MINE.entryX+.5)*tile,ly=(MINE.entryY+.5)*tile;
 circle(lx-55,ly-60,11,'#e5b668');circle(lx-55,ly-60,5,'#ffeaa6');
 ctx.restore();
 // An always-visible cave heading.
 ctx.fillStyle='#fff3ce';ctx.textAlign='center';ctx.font='bold 14px system-ui';if(W>760)ctx.fillText('⛏️ เหมืองหิน • ขุดเปิดทางได้รอบทิศ',W/2,30);
}
function drawRoom(now){
 ctx.clearRect(0,0,W,H);
 const roomLight=ctx.createRadialGradient(W*.5,H*.46,60,W*.5,H*.5,Math.max(W,H)*.72);
 roomLight.addColorStop(0,'#45605b');roomLight.addColorStop(1,'#14252f');
 ctx.fillStyle=roomLight;ctx.fillRect(0,0,W,H);
 ctx.save();mapTransform();
 rect(-7,9,794,552,21,'#0e1d2c66');
 rect(0,0,780,550,18,'#648b86');rect(9,9,762,532,14,'#b5b98e');
 rect(24,24,732,502,10,'#dcc19d');
 for(let y=26;y<524;y+=40){
   for(let x=26;x<754;x+=40){
     const shade=((x*53+y*67+x*y*29)>>>0)%5;
     ctx.fillStyle=['#b57e4d16','#f8e2b349','#ab794c27','#f6d8ac49','#daae7732'][shade];
     ctx.fillRect(x,y,Math.min(39,754-x),Math.min(39,524-y));
   }
 }
 ctx.strokeStyle='#bda98a';ctx.lineWidth=1;
 for(let x=40;x<740;x+=40){ctx.beginPath();ctx.moveTo(x,26);ctx.lineTo(x,524);ctx.stroke()}
 for(let y=40;y<510;y+=40){ctx.beginPath();ctx.moveTo(26,y);ctx.lineTo(754,y);ctx.stroke()}
 drawDecor(now);
 drawWorkoutMat('room');
 for(const o of objects){
   if(o.t==='fridge'||o.t==='stove')drawKitchen(o);
   else drawFurniture(o,now);
 }
 drawDoor(390,513);mapLabel('ไปละแวกบ้าน',390,503);
 drawCat(now);
 for(const p of others.values())if(p.scene==='room'||!p.scene)avatar(p);
 avatar(me);
 ctx.restore();
}
let sprintPointer=null,sprintKey=false,sprintBlend=0;
const sprintButton=$('runBoost');
sprintButton.addEventListener('pointerdown',event=>{
 if(sprintPointer!==null)return;
 sprintPointer=event.pointerId;
 sprintButton.setPointerCapture(event.pointerId);
});
for(const type of ['pointerup','pointercancel','lostpointercapture']){
 sprintButton.addEventListener(type,event=>{if(event.pointerId===sprintPointer)sprintPointer=null});
}
addEventListener('keydown',event=>{if(event.key==='Shift')sprintKey=true});
addEventListener('keyup',event=>{if(event.key==='Shift')sprintKey=event.getModifierState('Shift')});
function resetSprint(){
 sprintPointer=null;sprintKey=false;sprintBlend=0;
}
addEventListener('blur',resetSprint);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetSprint()});

function render(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 let dx=vx,dy=vy;
 if(keys.size){dx=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));dy=Number(keys.has('s')||keys.has('ArrowDown'))-Number(keys.has('w')||keys.has('ArrowUp'))}
 const length=Math.hypot(dx,dy);
 if(length>1){dx/=length;dy/=length}
 const canWalk=me.pose==='stand'&&!lifeDialog.open&&!characterDialog.open&&!mapDialog.open&&!me.action&&!poseIsChanging(now)&&vehicleAllowsMovement();
 if(length<=.08)dx=dy=0;
 else if(canWalk)me.face=Math.atan2(dy,dx);
 const blend=1-Math.exp(-dt*(length>.08?13:24));
 walkX=canWalk?walkX+(dx-walkX)*blend:0;
 walkY=canWalk?walkY+(dy-walkY)*blend:0;
 dx=walkX;dy=walkY;
 me.walking=false;
 const canSprint=canWalk&&!isInVehicle()&&!me.swimming&&life.needs.energy>8;
 const sprinting=canSprint&&length>.08&&(sprintKey||sprintPointer!==null);
 sprintBlend+=(Number(sprinting)-sprintBlend)*(1-Math.exp(-dt*12));
 if(canWalk&&Math.hypot(dx,dy)>.08){
   const speed=vehicleMovementSpeed()*(canSprint?1+.43*sprintBlend:1);
   const nx=me.x+dx*speed*dt,ny=me.y+dy*speed*dt;
   if(scene==='mine'){
     const px=me.x,py=me.y;if(!mineSolidAt(nx,me.y))me.x=nx;if(!mineSolidAt(me.x,ny))me.y=ny;
     me.walking=Math.hypot(me.x-px,me.y-py)>.1;
   }else{
     const px=me.x,py=me.y;
     if(!outdoorTravelBlocked(nx,me.y))me.x=nx;
     if(!outdoorTravelBlocked(me.x,ny))me.y=ny;
     me.walking=Math.hypot(me.x-px,me.y-py)>.1;
   }
 }
 const running=sprinting&&me.walking;
 if(me.running!==running){
   me.running=running;
   sprintButton.setAttribute('aria-pressed',String(running));
   $('energy').classList.toggle('sprinting',running);
 }
 tickVehicle(now,dt);tickWater(now,dt);tickMineClock();
 tickMultiplayer(now);
 lifeTick(now,dt);
 if(scene==='mine')drawMine(now);else if(scene==='outside')drawOutside(now);else drawRoom(now);
 drawShopIncomeHud(now);
 tickGameSound(now);
 requestAnimationFrame(render);
}
canvas.addEventListener('pointerdown',e=>{
 if(scene!=='mine'||lifeDialog.open)return;
 const rect=canvas.getBoundingClientRect();
 const tx=Math.floor(((e.clientX-rect.left)/mineView.scale+mineView.cx)/MINE.tile);
 const ty=Math.floor(((e.clientY-rect.top)/mineView.scale+mineView.cy)/MINE.tile);
 if(inMineBounds(tx,ty)){me.face=Math.atan2((ty+.5)*MINE.tile-me.y,(tx+.5)*MINE.tile-me.x);mineStrike(tx,ty)}
});

let soloMine=null, roomMineGeneration=null;
let roomMineResetAt=0;
const mineStart=()=>({x:(MINE.entryX+.5)*MINE.tile,y:(MINE.entryY+.5)*MINE.tile});
function updateMineResetButton(){
 const button=$('mineReset');
 button.disabled=!!roomCode&&!isHost;
 button.title=button.disabled?'เจ้าของห้องเป็นคนรีเซ็ตเหมือง':'รีเซ็ตแผนที่เหมือง';
}
function swapMineMap(broken=[]){
 mineBroken=new Set();
 makeStartingGap();
 for(const value of broken.slice(0,MINE.cols*MINE.rows)){
   if(!Number.isInteger(value))continue;
   const cell=rockCell(value);
   if(inMineBounds(cell.x,cell.y))mineBroken.add(value);
 }
 mineDamage=new Map();mineEffects=[];
 rockSwingUntil=0;
 stopMineHold();
 clearInterval(mineSpaceInterval);
 minePosition=mineStart();
 if(scene==='mine'){Object.assign(me,minePosition);me.walking=false}
}
function beginHostedMine(){
 soloMine=mineBroken;
 // A room starts from its host's saved tunnels and owns its subsequent changes.
 mineBroken=new Set(soloMine);
 roomMineGeneration=0;
 roomMineResetAt=Date.now()+mineResetInterval;
 updateMineResetButton();
}
function endRoomMine(){
 if(soloMine)swapMineMap([...soloMine]);
 soloMine=null;roomMineGeneration=null;roomMineResetAt=0;hostedTownOrigin=null;
}
function mineWorldPacket(){
 return {type:'minesync',generation:roomMineGeneration,remaining:Math.max(0,roomMineResetAt-Date.now()),townHour:townHour(),broken:[...mineBroken]};
}
function acceptMineWorld(peerId,packet){
 if(isHost||peerId!==hostId||!Array.isArray(packet.broken))return;
 if(!Number.isSafeInteger(packet.generation)||packet.generation<0)return;
 if(!Number.isFinite(packet.remaining)||packet.remaining<0||packet.remaining>mineResetInterval)return;
 if(roomMineGeneration!==null&&packet.generation<=roomMineGeneration)return;
 const reset=roomMineGeneration!==null;
 if(!soloMine)soloMine=mineBroken;
 roomMineGeneration=packet.generation;
 roomMineResetAt=Date.now()+packet.remaining;
 syncTownHour(packet.townHour);
 swapMineMap(packet.broken);
 if(reset)toast('เจ้าของห้องรีเซ็ตเหมืองแล้ว');
}
function sendMineChange(packet){
 if(roomMineGeneration!==null)broadcast({...packet,generation:roomMineGeneration});
}
function isCurrentMineChange(packet){
 return roomMineGeneration!==null&&packet.generation===roomMineGeneration;
}
function applyMineReset(){
 swapMineMap();
 if(roomMineGeneration!==null){
   roomMineResetAt=Date.now()+mineResetInterval;
   roomMineGeneration++;
   broadcast(mineWorldPacket());
 }else soloMineResetAt=Date.now()+mineResetInterval;
 saveMine();
}
function resetMineWorld(){
 if(scene!=='mine'||(roomCode&&!isHost))return;
 applyMineReset();
 lifeDialog.close();
 toast('รีเซ็ตเหมืองแล้ว • พร้อมขุดหินรอบใหม่');
}
let lastMineClock=0;
function tickMineClock(){
 const now=Date.now();
 if(now-lastMineClock<200)return;
 lastMineClock=now;
 if(roomMineGeneration===null&&now>=soloMineResetAt){
   applyMineReset();
   if(scene==='mine')toast('เหมืองรีเซ็ตอัตโนมัติ • พร้อมขุดรอบใหม่');
 }
 if(isHost&&roomMineGeneration!==null&&now>=roomMineResetAt){
   applyMineReset();
   if(scene==='mine')toast('เหมืองของห้องรีเซ็ตอัตโนมัติ');
 }
 if(scene!=='mine')return;
 const hud=$('mineCountdown');
 if(roomCode&&!isHost&&roomMineGeneration===null){hud.textContent='รอเวลาเหมืองจากเจ้าของห้อง';return}
 const seconds=Math.max(0,Math.ceil(((roomMineGeneration===null?soloMineResetAt:roomMineResetAt)-now)/1000));
 hud.textContent='รีเซ็ตใน '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function drawMineReset(){
 lifeRow('หินจะกลับมาเต็มเหมืองและคนที่อยู่ในเหมืองจะกลับจุดเริ่มต้น เลเวล อุปกรณ์ หินในกระเป๋า และเงินยังอยู่');
 lifeRow(roomMineGeneration!==null?'มีผลกับทุกคนในห้องนี้':'มีผลกับเหมืองที่เล่นคนเดียว',
  [['ยืนยันรีเซ็ต',resetMineWorld]]);
}
$('mineReset').onclick=()=>{if(scene==='mine'&&!$('mineReset').disabled)openLife('mineReset')};

function cityRegion(x,y){
 const district=cityDistricts.find(d=>x>=d.x&&x<d.x+d.w&&y>=d.y&&y<d.y+d.h);
 if(district)return district.label;
 if(x>=2639||y>=1728)return 'ถนนรอบเมือง';
}
function cityBoxVisible(cam,x,y,w,h){
 return x+w>=cam.x&&x<=cam.x+cam.vw&&y+h>=cam.y&&y<=cam.y+cam.vh;
}
function drawCityGround(cam){
 for(const {x,y,w,h,grass,path} of cityDistricts){
   if(!cityBoxVisible(cam,x,y,w,h))continue;
   rect(x,y,w,h,18,grass);
   const firstX=x+20+Math.max(0,Math.floor((cam.x-x-20)/74))*74;
   const firstY=y+20+Math.max(0,Math.floor((cam.y-y-20)/68))*68;
   for(let tx=firstX;tx<Math.min(x+w-10,cam.x+cam.vw+10);tx+=74){
     for(let ty=firstY;ty<Math.min(y+h-10,cam.y+cam.vh+10);ty+=68){
       const dx=tx+(Math.floor(ty*1.37)%21),dy=ty+(Math.floor(tx*2.01)%23);
       rect(dx,dy,5,2,1,'#f1e4ad36');rect(dx+10,dy+4,4,2,1,'#526b4733');
     }
   }
   rect(x+37,y+288,w-74,8,4,path);
 }
}
function drawCityRoads(cam){
 const roads=cityRoads.filter(([x,y,w,h])=>cityBoxVisible(cam,x,y,w,h));
 for(const [x,y,w,h] of roads){
   rect(x,y,w,h,3,'#d4c7a9');rect(x+5,y+5,w-10,h-10,3,'#606f73');
 }
 for(const [x,y,w,h] of roads){
   if(w>h){
     rect(x,y+9,w,2,1,'#c1ccbc');rect(x,y+h-11,w,2,1,'#c1ccbc');
     for(let tx=Math.max(x+16,Math.floor(cam.x/70)*70);tx<Math.min(x+w-28,cam.x+cam.vw+35);tx+=70){
       if(!cityRoads.some(([rx,,rw,rh])=>rh>rw&&tx+30>=rx&&tx<=rx+rw))rect(tx,y+h*.5,32,3,1,'#efd396');
     }
   }else{
     rect(x+9,y,2,h,1,'#c1ccbc');rect(x+w-11,y,2,h,1,'#c1ccbc');
     for(let ty=Math.max(y+16,Math.floor(cam.y/70)*70);ty<Math.min(y+h-28,cam.y+cam.vh+35);ty+=70){
       if(!cityRoads.some(([,ry,rw,rh])=>rw>rh&&ty+30>=ry&&ty<=ry+rh))rect(x+w*.5,ty,3,32,1,'#efd396');
     }
   }
 }
}
function drawCityMinimapRoads(px,py,scale){
 for(const {x,y,w,h,grass} of cityDistricts)rect(px+x*scale,py+y*scale,w*scale,h*scale,1,grass);
 for(const [x,y,w,h] of cityRoads)rect(px+x*scale,py+y*scale,w*scale,h*scale,1,'#596873');
 for(const event of activeCityEvents){
   if(event.resolved)continue;
   circle(px+event.x*scale,py+event.y*scale,3.3,'#a46c42');
   circle(px+event.x*scale,py+event.y*scale,2.1,'#ffe195');
 }
}
function cityCourt(x,y,w,h,color){
 rect(x-8,y-8,w+16,h+16,18,'#536b624b');rect(x,y,w,h,12,color);
 ctx.save();ctx.strokeStyle='#f6edced0';ctx.lineWidth=3;
 ctx.strokeRect(x+14,y+14,w-28,h-28);
 ctx.beginPath();ctx.moveTo(x+w/2,y+14);ctx.lineTo(x+w/2,y+h-14);ctx.stroke();
 ctx.beginPath();ctx.arc(x+w/2,y+h/2,h*.17,0,Math.PI*2);ctx.stroke();
 ctx.strokeRect(x+14,y+h*.29,w*.15,h*.42);ctx.strokeRect(x+w*.85-14,y+h*.29,w*.15,h*.42);
 ctx.restore();
}
function cityBench(x,y,color='#a8795a'){
 rect(x-28,y+4,58,10,5,'#4b63503a');
 rect(x-21,y-9,4,19,2,'#585a52');rect(x+17,y-9,4,19,2,'#585a52');
 rect(x-25,y-14,50,9,3,color);rect(x-25,y-2,50,8,3,color);
}
function drawCityScenery(visible,now){
 for(const district of cityDistricts){
   const x=district.x+1200,y=district.y+732;
   if(!visible(x,y,850))continue;
   if(district.key==='sports'){
     cityCourt(x-385,y-205,770,410,'#629b71');
     cityCourt(x+470,y-167,196,333,'#c68973');
     for(let i=0;i<4;i++)rect(x-340,y-247-i*8,680,6,2,i%2?'#547b83':'#ddd0aa');
   }else if(district.key==='campus'){
     rect(x-386,y-207,774,414,53,'#d3d6a7');
     rect(x-354,y-172,706,346,47,'#80ad74');
     for(const dx of [-285,-149,149,285])for(const dy of [-98,98])cityBench(x+dx,y+dy);
     for(let i=0;i<6;i++)rect(x-38+i*13,y-156,6,314,2,'#d8cda6');
     townEllipse(x,y,48,30,'#bccca2');townEllipse(x,y,39,22,'#78a7a5');
   }else if(district.key==='market'){
     rect(x-386,y-179,773,367,24,'#d4b68e');
     for(let i=0;i<10;i++){
       const px=x-318+i%5*157,py=y-91+Math.floor(i/5)*177;
       rect(px-57,py-12,111,60,10,'#a8795b');rect(px-64,py-27,126,31,9,'#6b7466');
       for(let stripe=0;stripe<6;stripe++)rect(px-61+stripe*20,py-23,19,18,3,(stripe+i)%2?'#e1af77':'#ba756c');
       circle(px-22,py+22,6,'#e5a966');circle(px-6,py+24,6,'#ce8169');circle(px+10,py+22,6,'#9aaf77');
     }
   }else if(district.key==='arts'){
     rect(x-366,y-188,732,378,34,'#d9c7a9');
     rect(x-334,y-166,668,322,26,'#acc4a4');
     for(const dx of [-255,-125,125,255])for(const dy of [-102,102]){
       const xx=x+dx,yy=y+dy;
       townEllipse(xx,yy,35,19,'#d5cbad');rect(xx-11,yy-24,22,25,4,'#928596');
       circle(xx,yy-22,13,'#c39291');circle(xx-3,yy-26,7,'#e5c3af');
     }
     rect(x-2,y-143,4,286,1,'#e4d7b2');circle(x,y,34,'#d5cbad');circle(x,y,27,'#81b4ae');
   }else if(district.key==='orchard'){
     rect(x-420,y-224,838,446,32,'#969b59');
     for(let col=0;col<9;col++){
       const px=x-366+col*90;
       rect(px-25,y-196,50,392,18,'#927553');
       for(let row=0;row<7;row++){
         const py=y-171+row*56;
         townEllipse(px+4,py+2,19,10,'#6e6a4e');
         circle(px,py-5,15,'#658f5a');circle(px-4,py-10,10,'#8eaa65');
         circle(px-4,py-9,3,'#eab465');circle(px+6,py-4,3,'#d28961');
       }
     }
   }else if(district.key==='hills'){
     for(let i=0;i<6;i++){
       const px=x-330+i*127,py=y+Math.sin(i*1.5)*90;
       townEllipse(px,py+54,52,18,'#42645150');
       rect(px-40,py+13,80,40,6,'#846b62');
       ctx.fillStyle=['#b97868','#e0bb7d','#70948d'][i%3];
       ctx.beginPath();ctx.moveTo(px-46,py+34);ctx.lineTo(px,py-31);ctx.lineTo(px+44,py+34);ctx.fill();
       ctx.fillStyle='#4d5255';ctx.beginPath();ctx.moveTo(px-13,py+33);ctx.lineTo(px+1,py+5);ctx.lineTo(px+14,py+33);ctx.fill();
     }
     circle(x+15,y+120,17,'#715b52');circle(x+15,y+117,10,'#dc965d');circle(x+15,y+115,5+Math.sin(now/170)*2,'#f2c26b');
   }else if(district.key==='harbor'){
     for(let i=0;i<5;i++){
       const px=x-327+i*143,py=y-192;
       rect(px-5,py,41,82,6,'#846d5d');
       for(let j=0;j<8;j++)rect(px,py+2+j*9,30,7,1,'#bf9a79');
       townEllipse(px+24,py+114,17,34,['#e3ba8c','#6996a6','#bf8071'][i%3]);
       rect(px+18,py+96,13,35,4,'#e8dfbd');
     }
   }else if(district.key==='coast'){
     for(let i=0;i<6;i++){
       const px=district.x+618+i%2*194,py=y-87+Math.floor(i/2)*117+Math.sin(i)*16;
       townEllipse(px+12,py+19,27,10,'#4b5e5146');
       rect(px-2,py-32,4,53,2,'#67564e');
       circle(px,py-29,20,['#cf7966','#e0b06d','#648e9e'][i%3]);
       circle(px-5,py-36,10,'#f1d4aa9a');circle(px,py-31,3,'#695c4f');
       cityBench(px+23,py+19,'#a49472');
     }
   }
 }
}

function inBackyard(x,y){
 return x>backyard.x&&x<backyard.x+backyard.w&&y>backyard.y&&y<backyard.y+backyard.h;
}
function atHomeDoor(){
 return Math.abs(me.x-homeDoor.x)<36&&me.y>homeBuilding.y+homeBuilding.h+13&&me.y<homeDoor.y+19;
}
function nearTownShop(){
 return Math.hypot(me.x-townShopDoor.x,me.y-townShopDoor.y)<51&&me.y>townShop.y+townShop.h;
}
function townRegion(x,y){
 if(inBackyard(x,y))return 'สวนหลังบ้าน';
 if(x>=townShop.x-35&&x<townShop.x+townShop.w+100&&y>=townShop.y-37&&y<townShopDoor.y+66)return townShop.label;
 if(x>Math.min(homeBuilding.x,homeGarage.x)-25&&x<Math.max(homeBuilding.x+homeBuilding.w,homeGarage.x+homeGarage.w)+20&&
   y>=Math.min(homeBuilding.y,homeGarage.y)-14&&y<Math.max(homeDoor.y,garagePosition.y)+64)return 'หน้าบ้าน';
 const district=cityRegion(x,y);if(district)return district;
 if(x>1685&&y>780)return 'ริมทะเลสาบ';
 if(x<1355&&y>1330)return 'สวนเรือนเพาะชำ';
 if(x<1355&&y>800)return 'ทุ่งดอกไม้';
 if(x>=790&&x<1685&&y<805)return 'ย่านร้านค้า';
 if(x>=1685&&y<=780)return 'ย่านริมคลอง';
 if(x<790&&y>=330&&y<600)return 'สวนชุมชน';
 return 'ละแวกบ้าน';
}

function townRandom(seed){
 return ()=>{
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   return seed/4294967296;
 };
}
const townSeeded=townRandom(519);
const townFlecks=Array.from({length:2120},()=>({
 x:townSeeded()*TOWN.w,y:townSeeded()*TOWN.h,
 color:['#72965337','#5c8b5738','#d1dd9b56','#a3c286'][Math.floor(townSeeded()*4)],
 size:1+townSeeded()*2
}));
const townTrees=townTreeSpots.map(([x,y],i)=>({x,y,size:20+(i*31)%15,hue:i%4}));
function townCamera(){
 const scale=Math.max(.65,Math.min(1.22,Math.min(W/640,H/490)))*(isInVehicle()?.88:1);
 const vw=W/scale,vh=H/scale;
 return {scale,vw,vh,x:Math.max(0,Math.min(TOWN.w-vw,me.x-vw/2)),y:Math.max(0,Math.min(TOWN.h-vh,me.y-vh/2))};
}
function townEllipse(x,y,rx,ry,fill){
 ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function townDrawGround(cam){
 const colors=ctx.createLinearGradient(0,0,TOWN.w,TOWN.h);
 colors.addColorStop(0,'#a7c579');colors.addColorStop(.55,'#92bb75');colors.addColorStop(1,'#779f70');
 ctx.fillStyle=colors;ctx.fillRect(cam.x,cam.y,cam.vw,cam.vh);drawCityGround(cam);
 for(const {x,y,color,size} of townFlecks){
   if(x<cam.x||x>cam.x+cam.vw||y<cam.y||y>cam.y+cam.vh)continue;
   ctx.fillStyle=color;ctx.fillRect(x,y,size*2,size);
 }
 for(const [x,y,w,h] of townPaths){
   rect(x,y,w,h,5,'#75956260');rect(x+2,y+1,w-4,h-3,5,'#e1ce9e');
   ctx.fillStyle='#f3e3b67f';ctx.fillRect(x+3,y+3,w-6,2);
 }
 const {y:roadY,h:roadHeight,crosswalks}=mainRoad;
 rect(16,roadY,TOWN.w-32,roadHeight,5,'#4d6062');
 rect(18,roadY+3,TOWN.w-36,roadHeight-5,3,'#606d71');
 rect(18,roadY+5,TOWN.w-36,2,0,'#c6c6aa80');
 rect(18,roadY+roadHeight-7,TOWN.w-36,2,0,'#c6c6aa80');
 for(let x=Math.max(30,Math.floor(cam.x/53)*53);x<Math.min(TOWN.w-28,cam.x+cam.vw);x+=53)rect(x,roadY+roadHeight/2,27,3,1,'#e8bd73');
 for(const x of crosswalks){
   rect(x-18,roadY+2,33,roadHeight-3,0,'#49575a');
   for(let y=roadY+9;y<roadY+roadHeight-4;y+=10)rect(x-16,y,29,5,0,'#e6dfbe');
 }
}
function townDrawLake(lake,now){
 const {x,y,w,h,r}=lake;
 rect(x-4,y-4,w+8,h+8,r,'#b7c482');
 rect(x+1,y+3,w,h,r,'#6b8e68');
 rect(x,y,w,h,r,'#78b1a1');
 rect(x+8,y+7,w-16,h-15,Math.max(12,r-6),'#75a7aa');
 for(let i=0;i<Math.floor(w/16);i++){
   const xx=x+26+(i*37)%(w-52),yy=y+24+(i*13)%(h-48);
   rect(xx+Math.sin(now/1300+i)*6,yy,10+i%12,1.7,1,i%2?'#d1e7d594':'#a5d2c2');
 }
 for(let i=0;i<6;i++){
   const xx=x+35+(i*59)%(w-60);
   townEllipse(xx,y+h-13,6,3,'#597d52');
 }
 drawFishingShore(lake,now);
}
function townDrawHouse(h){
 if(h.kind==='garage'){drawGarageBuilding(h);return}
 const {x,y,w}=h,depth=h.h;
 townEllipse(x+w/2+11,y+depth-1,w*.63,17,'#4357424d');
 rect(x+w*.06,y+28,w*.91,depth-22,7,'#7d786c');
 rect(x,y+25,w,depth-25,7,h.wall);
 rect(x,y+45,w,6,1,'#b59b754b');
 rect(x,y+depth-8,w,8,4,'#b59b7568');
 const roof=ctx.createLinearGradient(0,y,0,y+43);
 roof.addColorStop(0,h.roof);roof.addColorStop(.64,h.roof);roof.addColorStop(1,'#3d3849');
 rect(x-8,y-4,w+16,48,9,roof);
 rect(x-7,y-6,w+14,8,5,'#f3d7ac55');
 for(let r=1;r<=3;r++){
   const yy=y+r*11;
   rect(x-7,yy,w+14,1,0,'#372d3443');
   for(let col=x+((r%2)*9);col<x+w;col+=18)rect(col,yy-8,1,8,0,'#372d3433');
 }
 for(const xx of [x+19,x+w-52]){
   rect(xx-3,y+50,39,27,4,'#b69775');
   rect(xx,y+52,33,21,3,townDarkness()>.5?'#ffd98b':'#577884');rect(xx+1,y+53,32,7,3,townDarkness()>.5?'#fff2bd':'#a1bcc2');
   rect(xx+15,y+52,2,20,0,'#fff1cd');rect(xx,y+62,33,1,0,'#fff1cd');
 }
 drawDoor(x+w/2,y+depth-24);
 if(h.kind==='shop'){
   rect(x+2,y+44,w-4,14,2,'#a66553');
   for(let i=0;i<Math.floor(w/13);i++)rect(x+4+i*13,y+43,11,13,2,i%2?'#fcdfa9':'#de8c6f');
   rect(x+w/2-20,y+depth-23,40,22,4,'#55827b');
   rect(x+w/2-16,y+depth-19,31,9,3,'#9ec4b3');
   rect(x+w/2-26,y+depth+2,52,10,4,'#bf9473');
 }
 mapLabel(h.label,x+w/2,y+26,'#fff3d4');
}
function drawGarageBuilding({x,y,w,h,wall,roof,label}){
 townEllipse(x+w/2+10,y+h,w*.60,16,'#43574252');
 rect(x,y+22,w,h-22,6,wall);
 rect(x-7,y-3,w+14,40,7,roof);
 for(let i=8;i<w;i+=15)rect(x+i,y+3,1,29,0,'#d5dbda55');
 rect(x+11,y+42,w-22,h-43,6,'#423d3c');
 rect(x+16,y+45,w-32,h-49,4,'#899e9f');
 for(let py=y+51;py<y+h-7;py+=6)rect(x+17,py,w-34,2,1,'#576f73');
 rect(x+w/2-9,y+h-15,18,4,2,'#e3dfc1');
 rect(x+6,y+h-3,w-12,5,1,'#636b63');
 mapLabel(label,x+w/2,y+28,'#fff1ca');
}
function drawHomeForecourt(){
 const homeFront=homeBuilding.y+homeBuilding.h;
 const garageFront=homeGarage.y+homeGarage.h;
 const shopFront=townShop.y+townShop.h;
 const left=Math.min(homeBuilding.x,homeGarage.x)-12;
 const top=Math.min(homeFront,garageFront)-8;
 const right=Math.max(homeBuilding.x+homeBuilding.w,homeGarage.x+homeGarage.w)+19;
 const bottom=Math.max(homeDoor.y,garagePosition.y)+40;
 rect(left,top,right-left,bottom-top,15,'#b6a184');
 rect(left+5,top+5,right-left-10,bottom-top-11,12,'#d9c8a3');
 rect(townShop.x-58,shopFront-5,townShop.w+71,Math.max(39,townShopDoor.y-shopFront+24),12,'#d9c8a3');
 rect(garagePosition.x-23,garageFront-7,47,Math.max(35,garagePosition.y-garageFront+70),8,'#9ea198');
 rect(homeDoor.x-22,homeFront-8,44,bottom-homeFront+8,8,'#e9d4a5');
 for(let y=homeFront+2;y<bottom-3;y+=13)rect(homeDoor.x-20,y,40,1.5,1,'#c9ae86');
}
function townDrawCar(car){
 const x=car.direction===1?car.x:TOWN.w-car.x;
 const {y,color,direction,kind}=car;
 ctx.save();ctx.translate(x,y);ctx.scale(direction,1);
 const back=kind?39:31;
 townEllipse(3,7,back+6,12,'#27353a73');
 for(const xx of [-back+9,21])rect(xx-5,-15,10,30,3,'#293438');
 rect(-back,-12,back+35,25,9,'#3b4b51');
 rect(-back,-14,back+35,23,8,color);
 rect(-back+6,-13,back+17,2,1,'#ffffff80');
 rect(kind?-13:-18,-11,35,18,6,'#3f6172');
 rect(11,-10,7,16,4,'#a6c4ca');
 rect(-14,-9,20,13,3,color);
 rect(32,-10,5,5,2,'#fff0ba');rect(32,3,5,5,2,'#fff0ba');
 rect(-back,-8,3,5,1,'#be453d');rect(-back,3,3,5,1,'#be453d');
 ctx.restore();
}
function townDrawTree(tree,now){
 const {x,y,size,hue}=tree;
 const trunk='#795d48';
 const greens=['#47815a','#528550','#5b8550','#668d54'];
 const tops=['#71a969','#83ae61','#99ac67','#9eb76b'];
 townEllipse(x+9,y+1,size*1.15,12,'#3c5c474b');
 rect(x-5,y-size*.85,10,size,5,trunk);
 const sway=Math.sin(now/1700+x)*1.3;
 circle(x+sway,y-size*1.43,size,greens[hue]);
 circle(x-9+sway,y-size*1.62,size*.67,tops[hue]);
 circle(x+10+sway,y-size*1.43,size*.52,greens[hue]);
 circle(x-12+sway,y-size*1.74,size*.3,'#bfce766a');
}
function townDrawFlowerBeds(){
 for(const [x,y,w,h] of townFlowerBeds){
   rect(x,y,w,h,12,'#7a9860');rect(x+3,y+3,w-6,h-6,10,'#769b60');
   for(let i=0;i<Math.floor(w*h/222);i++){
     const xx=x+6+(i*23)%(w-12),yy=y+7+(i*19)%(h-13);
     circle(xx,yy,2.7,['#edd596','#dc94a1','#bba4ca'][i%3]);
     circle(xx,yy,1,'#fff0b6');
   }
 }
}
function townSign(text,x,y){
 rect(x-2,y-3,4,16,2,'#8b644f');
 rect(x-63,y-26,126,24,7,'#785d4b');
 rect(x-61,y-25,122,21,6,'#e6d2a1');
 mapLabel(text,x,y-10,'#493e36');
}
function townDrawMinimap(cam){
 const small=W<680,w=small?108:154,h=Math.round(w*TOWN.h/TOWN.w);
 const x=12,y=H-(small?156:186)-h;
 if(y<150)return;
 const scale=w/TOWN.w,px=x+7,py=y+7;
 rect(x,y,w+14,h+14,10,'#243f35dc');
 rect(px,py,w,h,6,'#aec587');drawCityMinimapRoads(px,py,scale);
 rect(px+1,py+mainRoad.y*scale,w-2,mainRoad.h*scale,2,'#5c6b70');
 for(const lake of townLakes)rect(px+lake.x*scale,py+lake.y*scale,lake.w*scale,lake.h*scale,2,'#5f9a9b');
 for(const building of townBuildings)rect(px+building.x*scale,py+building.y*scale,building.w*scale,building.h*scale,1,building.roof);
 ctx.strokeStyle='#fff1c6ba';ctx.lineWidth=1;
 ctx.strokeRect(px+cam.x*scale,py+cam.y*scale,Math.min(w,cam.vw*scale),Math.min(h,cam.vh*scale));
 circle(px+homeDoor.x*scale,py+homeDoor.y*scale,3,'#fff0ab');
 circle(px+townShopDoor.x*scale,py+townShopDoor.y*scale,2,'#eb9d5c');
 rect(px+backyard.x*scale,py+backyard.y*scale,backyard.w*scale,backyard.h*scale,2,'#73935e');
 circle(px+me.x*scale,py+me.y*scale,5,'#233d35');
 circle(px+me.x*scale,py+me.y*scale,3,'#fffbec');
}
function drawOutside(now){
 const cam=townCamera();
 const visible=(x,y,pad=100)=>x>=cam.x-pad&&y>=cam.y-pad&&x<=cam.x+cam.vw+pad&&y<=cam.y+cam.vh+pad;
 ctx.clearRect(0,0,W,H);
 ctx.save();ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
 townDrawGround(cam);drawCityRoads(cam);drawStreetPosts(cam);
 for(const lake of townLakes)if(visible(lake.x+lake.w/2,lake.y+lake.h/2,lake.w/2+25))townDrawLake(lake,now);
 townDrawFlowerBeds();
 rect(954,417,252,114,19,'#c2a77e');
 rect(960,418,243,109,18,'#e8d4a8');
 townEllipse(1082,477,44,24,'#8d9d86');
 townEllipse(1082,475,39,20,'#83b8ad');
 rect(1080,446,4,28,1,'#d3e3c7');
 circle(1082,447,5,'#a9d4c6');
 for(const {label,x,y} of townDistricts)if(visible(x,y))townSign(label,x,y);
 if(visible(homeDoor.x,homeDoor.y,285))drawHomeForecourt();
 if(visible(backyard.x+backyard.w/2,backyard.y+backyard.h/2,210))drawGarden(now);
 if(visible(workoutMats.outside.x,workoutMats.outside.y))drawWorkoutMat('outside');
 const drawList=[];
 for(const h of townBuildings)if(visible(h.x+h.w/2,h.y+h.h/2,160))drawList.push([h.y+h.h,()=>townDrawHouse(h)]);
 for(const t of townTrees)if(visible(t.x,t.y))drawList.push([t.y,()=>townDrawTree(t,now)]);
 for(const car of townTraffic){
   const x=((now/1000*car.speed+car.offset)%(TOWN.w+220))-110;
   if(visible(car.direction===1?x:TOWN.w-x,car.y))drawList.push([car.y+8,()=>townDrawCar({...car,x})]);
 }
 drawCityScenery(visible,now);
 const people=[me,...townResidentsNow(),...[...others.values()].filter(p=>p.scene==='outside')];
 for(const p of people)if(visible(p.x,p.y)&&!isVehicleRider(p))drawList.push([p.y,()=>{drawFishingLine(p,now);avatar(p)}]);
 queueGardenDrawing(drawList,visible);
 queueStallDrawing(drawList,visible,now);queueCityActors(drawList,visible,now);queueCityTraffic(drawList,visible,now);queueVehicleDrawing(drawList,visible,now);
 drawList.sort((a,b)=>a[0]-b[0]);
 for(const [,draw] of drawList)draw();
 ctx.restore();
 drawNightOverTown(cam);
 townDrawMinimap(cam);
}

const townDayLength=8*60*1000;
let hostedTownOrigin=null;
function townHour(at=Date.now()){
 const elapsed=Math.max(0,at-(hostedTownOrigin??life.clock.origin));
 return (9+elapsed*24/townDayLength)%24;
}
function syncTownHour(hour){
 if(!Number.isFinite(hour)||hour<0||hour>=24)return;
 hostedTownOrigin=Date.now()-((hour+15)%24)*townDayLength/24;
}
function isTownNight(hour=townHour()){return hour>=20||hour<6}
function townDarkness(hour=townHour()){
 if(hour>=20||hour<5)return 1;
 if(hour<7)return (7-hour)/2;
 return hour<18?0:(hour-18)/2;
}
function timeReadout(){
 const minutes=Math.floor(townHour()*60);
 const hour=Math.floor(minutes/60);
 return (isTownNight(hour)?'☾ ':'☀ ')+String(hour).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}

function drawStreetPosts(cam){
 for(const {x,y} of streetLights){
   if(x<cam.x-20||x>cam.x+cam.vw+20||y<cam.y-45||y>cam.y+cam.vh+35)continue;
   rect(x-4,y,11,4,2,'#52645d65');
   rect(x-1,y-26,3,27,2,'#4c5e5b');
   rect(x-5,y-30,11,7,2,'#536562');
   rect(x-3,y-28,7,4,1,'#ecd3a2');
 }
}
function drawNightOverTown(cam){
 const dark=townDarkness();
 if(!dark)return;
 ctx.save();
 ctx.fillStyle='rgba(20,34,78,'+dark*.63+')';ctx.fillRect(0,0,W,H);
 ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
 ctx.globalCompositeOperation='screen';
 ctx.globalAlpha=dark;
 for(const {x,y} of streetLights){
   if(x<cam.x-90||x>cam.x+cam.vw+90||y<cam.y-90||y>cam.y+cam.vh+90)continue;
   const glow=ctx.createRadialGradient(x,y-18,3,x,y-18,64);
   glow.addColorStop(0,'#ffdb956f');glow.addColorStop(1,'#ffca6800');
   ctx.fillStyle=glow;ctx.fillRect(x-64,y-82,128,128);
   circle(x+1,y-26,4,'#ffd891');
 }
 ctx.restore();
}

const workoutMats={room:{x:390,y:388},outside:outdoorWorkoutMat};
const seatedMotionTime=360;
let walkX=0,walkY=0;

function pauseWalking(){
 walkX=walkY=0;
 keys.clear();
}
function poseIsChanging(now=performance.now()){
 return !!me.poseMotion&&now-me.poseMotion.started<me.poseMotion.duration;
}
function setRiseButton(){
 const button=$('rise');
 button.classList.toggle('show',me.pose!=='stand'||gestureActive());
 button.textContent=gestureActive()?'หยุด (E)':me.pose==='sleep'&&me.onBed?'🛏️ ลุกจากเตียง (E)':'🧍 ลุกยืน (E)';
}
function setPose(next,x,y,animate){
 me.poseMotion=animate?{
   kind:next,started:performance.now(),duration:seatedMotionTime,fromX:me.x,fromY:me.y
 }:null;
 me.pose=next;me.x=x;me.y=y;me.walking=false;
 pauseWalking();
 setRiseButton();
 broadcast(snapshot());
}
function useFurniture(furniture){
 if(!furniture||!activatables.has(furniture.t)||scene!=='room'||me.pose!=='stand'||me.action||poseIsChanging())return false;
 const bed=furniture.t==='bed';
 me.onBed=bed;
 me.furniture={x:me.x,y:me.y};
 me.face=Math.PI/2;
 const seatX=furniture.t==='sofa'?Math.max(furniture.x+25,Math.min(furniture.x+furniture.w-25,me.x)):furniture.x+furniture.w/2;
 setPose(bed?'sleep':'sit',seatX,furniture.y+furniture.h/2+(bed?1:0),!bed);
 toast(bed?'กำลังพักบนเตียง · E เพื่อลุก':'กำลังนั่งพัก · E เพื่อลุกยืน');
 return true;
}
function rise(animate=true){
 if(me.pose==='stand')return;
 const from=me.pose;
 const {x,y}=me.furniture;
 me.furniture=null;me.onBed=false;
 setPose('stand',x,y,animate&&from==='sit');
 toast('ลุกยืนแล้ว');
}
function poseMotionPacket(){
 if(!poseIsChanging())return null;
 const {kind,started,duration,fromX,fromY}=me.poseMotion;
 return {kind,remaining:Math.round(started+duration-performance.now()),fromX,fromY};
}
function readPoseMotion(p,data){
 if((p.scene!=='room'&&p.scene!=='outside')||!data||!['stand','sit'].includes(data.kind)||data.kind!==p.pose||
   !Number.isFinite(data.remaining)||data.remaining<=0||data.remaining>seatedMotionTime||
   !Number.isFinite(data.fromX)||!Number.isFinite(data.fromY)||
   Math.hypot(data.fromX-p.x,data.fromY-p.y)>145){
   p.poseMotion=null;
   return;
 }
 if(p.poseMotion?.kind===data.kind&&p.poseMotion.fromX===data.fromX&&p.poseMotion.fromY===data.fromY&&
   performance.now()-p.poseMotion.started<seatedMotionTime)return;
 p.poseMotion={kind:data.kind,fromX:data.fromX,fromY:data.fromY,duration:seatedMotionTime,
   started:performance.now()+data.remaining-seatedMotionTime};
}
function nearFurniture(){
 const seat=objects.find(o=>{
   if(!activatables.has(o.t))return false;
   const dx=me.x-Math.max(o.x,Math.min(me.x,o.x+o.w));
   const dy=me.y-Math.max(o.y,Math.min(me.y,o.y+o.h));
   return Math.hypot(dx,dy)<38;
 });
 if(seat)return {label:seat.t==='bed'?'นอนพัก':seat.t==='sofa'?'นั่งโซฟา':'นั่งเก้าอี้',run:()=>useFurniture(seat)};
}
function nearWorkout(){
 const mat=workoutMats[scene];
 if(!mat||Math.hypot(me.x-mat.x,me.y-mat.y)>50)return;
 return {label:'ออกกำลังกาย',run:()=>{
   if(life.needs.energy<12)return toast('พลังงานไม่พอ ลองนั่งพักหรือนอนก่อน');
   beginActivity('exercise','exercise','กำลังทำสควอต…',()=>{
     changeNeed('energy',-12);
     changeNeed('mood',16);
     toast('ทำสควอตครบ 4 ครั้งแล้ว · ความสุขเพิ่มขึ้น');
   },Math.PI/2);
 }};
}
function drawWorkoutMat(place){
 const {x,y}=workoutMats[place];
 rect(x-35,y-17,70,38,10,'#293b3f36');
 rect(x-35,y-22,70,38,10,'#365b69');
 rect(x-31,y-19,62,29,7,'#7da6ab');
 for(let i=-1;i<=1;i++)rect(x-25,y-6+i*6,50,2,1,'#c4dce48a');
 mapLabel('เสื่อออกกำลังกาย',x,y+35,'#3a544b');
}
function updateWorkoutHud(now){
 const panel=$('workoutStatus');
 const exercising=me.action?.kind==='exercise';
 panel.hidden=!exercising;
 if(!exercising)return;
 const elapsed=now-me.action.started;
 const repetition=Math.min(4,1+Math.floor(elapsed/(me.action.duration/4)));
 $('workoutLabel').textContent='สควอต '+repetition+' / 4';
 $('workoutProgress').value=elapsed/me.action.duration;
}
$('rise').addEventListener('click',endCurrentPose);
addEventListener('keydown',event=>{
 if(event.repeat||lifeDialog.open||characterDialog.open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 if((event.code==='KeyE'||event.key.toLowerCase()==='e'||event.key==='Escape')&&(me.pose!=='stand'||gestureActive())){
   endCurrentPose();
   event.preventDefault();
 }
});

function shoreDistance(x,y,lake){
 const dx=Math.abs(x-lake.x-lake.w/2)-lake.w/2+lake.r;
 const dy=Math.abs(y-lake.y-lake.h/2)-lake.h/2+lake.r;
 return Math.hypot(Math.max(0,dx),Math.max(0,dy))+Math.min(0,Math.max(dx,dy))-lake.r;
}

function waterAt(x,y){
 return townLakes.find(lake=>shoreDistance(x,y,lake)<0&&!onFishingPier(x,y,lake));
}

function onFishingPier(x,y,lake){
 const edge=lake.x+lake.w,center=lake.y+lake.h*.55;
 return x>=edge-21&&x<=edge+22&&y>=center-13&&y<=center+11;
}

function swimAtPlayer(){
 return scene==='outside'&&!!waterAt(me.x,me.y);
}

function tickWater(now,dt){
 const swimming=swimAtPlayer();
 if(swimming!==!!me.swimming){
   me.swimming=swimming;
   if(scene==='outside'){
     toast(swimming?'กำลังว่ายน้ำ · ใช้ปุ่มเดินเพื่อว่ายไปที่ฝั่ง':'ขึ้นจากน้ำแล้ว · ตกปลาได้ใกล้ริมฝั่ง');
   }
 }
 if(swimming)changeNeed('energy',-dt*.23);
}

function fishingBank(x,y){
 let closest=null,distance=34;
 for(const lake of townLakes){
   const gap=onFishingPier(x,y,lake)?0:shoreDistance(x,y,lake);
   if(gap>=0&&gap<distance){closest=lake;distance=gap}
 }
 return closest;
}

function nearFishing(){
 if(scene!=='outside'||swimAtPlayer())return;
 const lake=fishingBank(me.x,me.y);
 if(!lake)return;
 return {label:'ตกปลา',run:()=>{
   if(life.bag.fish>=99999)return toast('กระเป๋าใส่ปลาเต็มแล้ว');
   const angle=Math.atan2(lake.y+lake.h/2-me.y,lake.x+lake.w/2-me.x);
   beginActivity('fish','fish','กำลังเหวี่ยงเบ็ดลงน้ำ…',()=>{
     life.bag.fish=(life.bag.fish||0)+1;
     toast('ตกได้ปลาน้ำจืด 1 ตัว · เก็บไว้ในกระเป๋า');
   },angle);
 }};
}

function drawFishingShore(lake,now){
 const x=lake.x+lake.w;
 const y=lake.y+lake.h*.55;
 // A narrow pier runs from the east bank into the water.
 rect(x-18,y-8,40,25,5,'#31595c45');
 rect(x-21,y-13,43,24,4,'#8b6a4d');
 for(let i=0;i<7;i++)rect(x-19+i*6,y-11,5,20,1,i%2?'#c5a47a':'#b99268');
 for(const xx of [x-20,x+18]){
   rect(xx,y-14,4,6,1,'#71553d');
   rect(xx,y+8,4,6,1,'#71553d');
 }
 circle(x+28,y+2,8,'#2d6572');
 ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#f9fcff';
 ctx.fillText('🎣',x+28,y+5);

 for(let i=0;i<3;i++){
   const t=(now/4200+i/3)%1;
   const cx=lake.x+lake.w*(.25+i*.22);
   const cy=lake.y+lake.h*(.35+(i%2)*.32);
   ctx.save();
   ctx.globalAlpha=(1-t)*.4;
   ctx.strokeStyle='#e1f6ed';
   ctx.lineWidth=1.35;
   ctx.beginPath();ctx.ellipse(cx,cy,2+t*15,1+t*7,0,0,Math.PI*2);ctx.stroke();
   ctx.restore();
 }
}

function drawFishingLine(p,now){
 if(p.action?.kind!=='fish')return;
 const lake=fishingBank(p.x,p.y);
 if(!lake)return;
 const elapsed=Math.max(0,now-p.action.started);
 const fraction=Math.min(1,elapsed/p.action.duration);
 if(fraction<.11||fraction>=1)return;
 const cx=lake.x+lake.w/2,cy=lake.y+lake.h/2;
 const angle=Math.atan2(cy-p.y,cx-p.x);
 const cast=Math.min(1,(fraction-.11)/.12);
 const reel=Math.max(0,(fraction-.80)/.20);
 const distance=Math.min(84,Math.hypot(cx-p.x,cy-p.y))*cast*(1-reel);
 const lineX=p.x+Math.cos(angle)*distance;
 const lineY=p.y+Math.sin(angle)*distance;
 const rodX=p.x+(Math.cos(p.face)<0?-16:16);
 const rodY=p.y-25;
 const bobY=lineY-(cast<1?Math.sin(cast*Math.PI)*24:Math.sin(now/165)*1.5);
 ctx.save();
 ctx.strokeStyle='#e8f7f4de';ctx.lineWidth=1.1;
 ctx.beginPath();ctx.moveTo(rodX,rodY);
 ctx.quadraticCurveTo((rodX+lineX)/2,Math.min(rodY,bobY)-6,lineX,bobY);
 ctx.stroke();
 if(cast===1&&reel<.65){
   const pulse=(now/(fraction>.68?350:920))%1;
   ctx.globalAlpha=.68*(1-pulse);
   ctx.strokeStyle='#f3fdef';
   ctx.beginPath();ctx.ellipse(lineX,bobY+2,4+pulse*10,2+pulse*5,0,0,Math.PI*2);ctx.stroke();
   ctx.globalAlpha=1;
 }
 circle(lineX,bobY,3.25,'#fff6d7');circle(lineX,bobY+1.4,2.4,'#d86560');
 if(reel>.65){
   ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('🐟',lineX,bobY+14);
 }
 ctx.restore();
}

const freeGestures={dance:'เต้น',read:'อ่านหนังสือ'};
function gestureActive(){return !!me.action&&Object.hasOwn(freeGestures,me.action.kind)}
function stopGesture(){
 if(!gestureActive())return;
 me.action=null;completeActivity=null;
 setRiseButton();
 broadcast(snapshot());
}
function endCurrentPose(){
 if(gestureActive()){
   stopGesture();toast('กลับสู่ท่ายืน');
 }else if(me.pose!=='stand')rise();
}
function canChoosePose(){
 return scene!=='mine'&&!swimAtPlayer()&&!isInVehicle()&&(!me.action||gestureActive());
}
function choosePose(next){
 if(!canChoosePose()||poseIsChanging())return;
 lifeDialog.close();
 stopGesture();
 if(next==='stand'){endCurrentPose();return}
 if(me.pose!=='stand')rise(false);
 if(next==='sit'||next==='sleep'){
   me.furniture={x:me.x,y:me.y};
   me.onBed=false;me.face=Math.PI/2;
   setPose(next,me.x,me.y,next==='sit');
   toast(next==='sleep'?'กำลังนอนพัก · E เพื่อลุก':'กำลังนั่งพัก · E เพื่อลุก');
   return;
 }
 beginActivity(next,next,'กำลัง'+freeGestures[next]+'…',()=>{
   changeNeed('mood',next==='dance'?8:6);
   toast(next==='dance'?'เต้นเสร็จแล้ว':'อ่านหนังสือเสร็จแล้ว');
 },Math.PI/2);
 setRiseButton();
}
function drawPoseMenu(){
 const choices=[['stand','🧍 ท่าเริ่มต้น / ยืน'],['sit','🪑 นั่ง'],['sleep','💤 นอน'],
   ['dance','♫ เต้น'],['read','📖 อ่านหนังสือ']];
 for(const [key,label] of choices)lifeRow(label,[['เลือก',()=>choosePose(key),(me.action?.kind||me.pose)===key]]);
}
function openPoseMenu(){
 if(lifeDialog.open||characterDialog.open||!canChoosePose())return;
 openLife('poses');
}
$('poseMenu').onclick=openPoseMenu;
addEventListener('keydown',event=>{
 if(event.repeat||event.defaultPrevented||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 if(event.code==='KeyG'||event.key.toLowerCase()==='g'){openPoseMenu();event.preventDefault()}
});

const vehicleModels={
 bicycle:{label:'จักรยาน',icon:'🚲',capacity:2,speed:278,radius:12,body:'#63a188',light:'#a8dfc1',dark:'#3e6e60'},
 motorcycle:{label:'มอเตอร์ไซค์',icon:'🏍️',capacity:2,speed:405,radius:16,body:'#cb6556',light:'#f3a17f',dark:'#8e403e'},
 car:{label:'รถยนต์',icon:'🚗',capacity:4,speed:470,radius:22,body:'#567e9f',light:'#93bdd2',dark:'#355469'}
};
const boardRange=62;
const vehicleMessages=new Set(['v-board','v-board-ok','v-board-no','v-leave','v-eject']);
let drivingVehicle=null,parkedVehicle=null,ridingVehicle=null,pendingBoard=null;

function isInVehicle(){return !!(drivingVehicle||ridingVehicle)}
function vehicleAllowsMovement(){return !ridingVehicle}
function vehicleMovementSpeed(){return drivingVehicle?vehicleModels[drivingVehicle.key].speed:swimAtPlayer()?105:175}
function isVehicleMessage(type){return vehicleMessages.has(type)}
function validVehicleKey(key){return typeof key==='string'&&Object.hasOwn(vehicleModels,key)}
function validVehicleId(id){return typeof id==='string'&&/^[a-z0-9]{6,32}$/.test(id)}
function validPeerId(id){return typeof id==='string'&&id.length>0&&id.length<=90}
function newVehicleId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function vehicleNear(p,x=me.x,y=me.y,range=boardRange){
 return Math.hypot(p.x-x,p.y-y)<=range;
}
function vehicleLand(x,y){return !hit(x,y)&&!waterAt(x,y)}
function outdoorTravelBlocked(x,y){
 if(!drivingVehicle)return hit(x,y);
 const r=vehicleModels[drivingVehicle.key].radius;
 return ![[0,0],[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dy])=>vehicleLand(x+dx,y+dy));
}
function findVehicleExit(x,y,angle){
 const angles=[angle+Math.PI/2,angle-Math.PI/2,angle+Math.PI,angle];
 for(const distance of [49,65,89]){
   for(const heading of angles){
     const nx=x+Math.cos(heading)*distance,ny=y+Math.sin(heading)*distance;
     if(vehicleLand(nx,ny))return {x:nx,y:ny};
   }
 }
 return vehicleLand(x,y)?{x,y}:garagePosition;
}
function canApproachVehicle(){
 return scene==='outside'&&!swimAtPlayer()&&!me.action&&me.pose==='stand'&&!poseIsChanging();
}
function startDriving(key,x=garagePosition.x,y=garagePosition.y,face=Math.PI/2){
 if(!validVehicleKey(key)||!canApproachVehicle()||isInVehicle()||!vehicleNear({x,y},me.x,me.y,70)||!vehicleLand(x,y))return;
 pendingBoard=null;parkedVehicle=null;
 drivingVehicle={id:newVehicleId(),key,face,seats:Array(vehicleModels[key].capacity-1).fill(null)};
 me.x=x;me.y=y;me.face=face;me.walking=false;
 pauseWalking();
 if(lifeDialog.open)lifeDialog.close();
 startGameAudio();
 toast('กำลังขับ'+vehicleModels[key].label+' · E เพื่อลงรถ');
 broadcast(snapshot());
}
function drawVehicleGarage(){
 for(const [key,model] of Object.entries(vehicleModels)){
   itemTile({icon:model.icon,label:model.label,detail:model.capacity+' ที่นั่ง',action:['ขึ้นขับ',()=>startDriving(key)]});
 }
}
function nearVehicle(){
 if(scene!=='outside')return;
 if(isInVehicle())return {label:drivingVehicle?'จอดแล้วลงรถ':'ลงจากรถ',run:leaveVehicle};
 if(!canApproachVehicle())return;
 let closest=null,distance=boardRange;
 for(const p of others.values()){
   if(p.scene!=='outside'||p.walking||!p.drivenVehicle||!connections.get(p.id)?.open)continue;
   const gap=Math.hypot(me.x-p.x,me.y-p.y);
   if(gap<distance){closest=p;distance=gap}
 }
 if(closest?.drivenVehicle.seats.includes(null)){
   return {label:'ขึ้น'+vehicleModels[closest.drivenVehicle.key].label+'ของ '+cleanName(closest.name),
     run:()=>requestVehicleBoard(closest)};
 }
 if(parkedVehicle&&vehicleNear(parkedVehicle,me.x,me.y,54)){
   const {key,x,y,face}=parkedVehicle;
   return {label:'ขึ้นขับ'+vehicleModels[key].label,run:()=>startDriving(key,x,y,face)};
 }
 if(vehicleNear(garagePosition,me.x,me.y,48))return {label:'รับรถข้างโรงรถ',run:()=>openLife('garage')};
 if(closest)return {label:vehicleModels[closest.drivenVehicle.key].label+'เต็ม',run:()=>requestVehicleBoard(closest)};
}
function requestVehicleBoard(driver){
 if(!canApproachVehicle()||isInVehicle()||!vehicleNear(driver)||driver.walking)return;
 if(!driver.drivenVehicle?.seats.includes(null))return toast('รถคันนี้เต็มแล้ว');
 if(pendingBoard&&performance.now()<pendingBoard.until)return;
 if(!connections.get(driver.id)?.open)return toast('เชื่อมต่อคนขับไม่ได้');
 pendingBoard={peer:driver.id,id:driver.drivenVehicle.id,request:newVehicleId(),until:performance.now()+3000};
 sendTo(driver.id,{type:'v-board',id:pendingBoard.id,request:pendingBoard.request});
 toast('กำลังขอขึ้นรถ…');
}
function leavePassenger(notify=true){
 if(!ridingVehicle)return;
 const ride=ridingVehicle;
 ridingVehicle=null;
 if(notify)sendTo(ride.peer,{type:'v-leave',id:ride.id});
 if(scene==='outside')Object.assign(me,findVehicleExit(me.x,me.y,me.face));
 pauseWalking();me.walking=false;
 toast('ลงจากรถแล้ว');
 broadcast(snapshot());
}
function leaveVehicle(){
 if(ridingVehicle){leavePassenger();return}
 if(!drivingVehicle)return;
 const ride=drivingVehicle;
 parkedVehicle={id:ride.id,key:ride.key,x:me.x,y:me.y,face:me.face};
 drivingVehicle=null;
 for(const seat of ride.seats)if(seat)sendTo(seat.peer,{type:'v-eject',id:ride.id});
 Object.assign(me,findVehicleExit(me.x,me.y,me.face));
 pauseWalking();me.walking=false;
 toast('จอด'+vehicleModels[ride.key].label+'แล้ว');
 broadcast(snapshot());
}
function vehiclePacket(){
 if(drivingVehicle)return {state:'driving',id:drivingVehicle.id,key:drivingVehicle.key,seats:drivingVehicle.seats.map(seat=>seat?.peer||null)};
 if(ridingVehicle)return {state:'riding',id:ridingVehicle.id,key:ridingVehicle.key,driver:ridingVehicle.peer,seat:ridingVehicle.seat};
 if(parkedVehicle)return {state:'parked',...parkedVehicle};
 return null;
}
function readVehicleState(p,data,peerId){
 p.id=peerId;
 p.drivenVehicle=null;p.riddenVehicle=null;p.parkedVehicle=null;
 if(!data||!validVehicleKey(data.key)||!validVehicleId(data.id))return;
 const {id,key}=data;
 const model=vehicleModels[key];
 if(data.state==='driving'&&p.scene==='outside'&&Array.isArray(data.seats)){
   const unique=new Set([p.id]);
   const seats=Array.from({length:model.capacity-1},(_,index)=>{
     const peer=data.seats[index];
     if(!validPeerId(peer)||unique.has(peer))return null;
     unique.add(peer);return peer;
   });
   p.drivenVehicle={id,key,seats};
 }else if(data.state==='riding'&&p.scene==='outside'&&validPeerId(data.driver)&&data.driver!==p.id&&
   Number.isInteger(data.seat)&&data.seat>=0&&data.seat<model.capacity-1){
   p.riddenVehicle={id,key,driver:data.driver,seat:data.seat};
   if(drivingVehicle?.id===id&&drivingVehicle.key===key&&data.driver===myId){
     const seat=drivingVehicle.seats[data.seat];
     if(seat?.peer===p.id)seat.until=performance.now()+4200;
   }
 }else if(data.state==='parked'&&Number.isFinite(data.x)&&Number.isFinite(data.y)&&Number.isFinite(data.face)&&
   data.x>=24&&data.x<=TOWN.w-24&&data.y>=24&&data.y<=TOWN.h-24){
   p.parkedVehicle={id,key,x:data.x,y:data.y,face:data.face};
 }
}
function respondToVehicleRequest(peer,packet){
 const p=others.get(peer);
 const ride=drivingVehicle;
 if(!validVehicleId(packet.request)||!validVehicleId(packet.id)||!ride||ride.id!==packet.id)return;
 const existing=ride.seats.findIndex(s=>s?.peer===peer);
 const index=existing>=0?existing:ride.seats.indexOf(null);
 if(index<0||scene!=='outside'||me.walking||p?.scene!=='outside'||!vehicleNear(p,me.x,me.y,boardRange+12)||
   p.drivenVehicle||(p.riddenVehicle&&p.riddenVehicle.driver!==myId)){
   sendTo(peer,{type:'v-board-no',id:ride.id,request:packet.request});
   return;
 }
 ride.seats[index]={peer,until:performance.now()+4200};
 sendTo(peer,{type:'v-board-ok',id:ride.id,key:ride.key,seat:index,request:packet.request});
 broadcast(snapshot());
}
function handleVehicleMessage(peer,packet){
 if(packet.type==='v-board'){respondToVehicleRequest(peer,packet);return}
 if(packet.type==='v-leave'&&drivingVehicle?.id===packet.id){
   const index=drivingVehicle.seats.findIndex(s=>s?.peer===peer);
   if(index>=0){drivingVehicle.seats[index]=null;broadcast(snapshot())}
   return;
 }
 if(packet.type==='v-eject'&&ridingVehicle?.peer===peer&&ridingVehicle.id===packet.id){
   leavePassenger(false);
   return;
 }
 if(!pendingBoard||pendingBoard.peer!==peer||pendingBoard.id!==packet.id||pendingBoard.request!==packet.request)return;
 const request=pendingBoard;
 pendingBoard=null;
 if(packet.type==='v-board-no'){toast('ขึ้นรถไม่ได้ ลองรอให้รถจอดหรือที่นั่งว่าง');return}
 if(packet.type!=='v-board-ok'||request.until<performance.now()||!canApproachVehicle()||isInVehicle()||
   !validVehicleKey(packet.key)||!Number.isInteger(packet.seat)||packet.seat<0||packet.seat>=vehicleModels[packet.key].capacity-1)return;
 const driver=others.get(peer);
 if(!driver||driver.scene!=='outside'||driver.drivenVehicle?.id!==packet.id||driver.drivenVehicle.key!==packet.key||
   !vehicleNear(driver,me.x,me.y,boardRange+20))return;
 ridingVehicle={peer,id:packet.id,key:packet.key,seat:packet.seat,joined:performance.now()};
 me.x=driver.x;me.y=driver.y;me.face=driver.face;me.walking=false;
 pauseWalking();
 toast('ขึ้นรถแล้ว · E เพื่อลงรถ');
 broadcast(snapshot());
}
function vehiclePeerLeft(id){
 if(pendingBoard?.peer===id)pendingBoard=null;
 if(ridingVehicle?.peer===id)leavePassenger(false);
 if(drivingVehicle){
   const seat=drivingVehicle.seats.findIndex(slot=>slot?.peer===id);
   if(seat>=0)drivingVehicle.seats[seat]=null;
 }
}
function clearVehicleConnections(){
 pendingBoard=null;
 if(ridingVehicle)leavePassenger(false);
 if(drivingVehicle)drivingVehicle.seats.fill(null);
}
function tickVehicle(now,dt){
 if(pendingBoard&&now>=pendingBoard.until){
   pendingBoard=null;
   toast('คนขับยังไม่ตอบ ลองขึ้นรถใหม่');
 }
 if(drivingVehicle){
   for(let i=0;i<drivingVehicle.seats.length;i++){
     const seat=drivingVehicle.seats[i];
     if(seat&&now>=seat.until)drivingVehicle.seats[i]=null;
   }
 }
 if(!ridingVehicle)return;
 const ride=ridingVehicle;
 const driver=others.get(ride.peer);
 if(scene!=='outside'||driver?.scene!=='outside'||!connections.get(ride.peer)?.open||
   driver.drivenVehicle?.id!==ride.id||now-ride.joined>650&&driver.drivenVehicle.seats[ride.seat]!==myId){
   leavePassenger(false);
   return;
 }
 const factor=Math.min(1,dt*20);
 me.x+=(driver.x-me.x)*factor;me.y+=(driver.y-me.y)*factor;
 me.face=driver.face;me.walking=false;
}
function isVehicleRider(p){
 if(p===me)return isInVehicle();
 if(p.drivenVehicle)return true;
 const ride=p.riddenVehicle;
 if(!ride)return false;
 if(ride.driver===myId)return drivingVehicle?.id===ride.id&&drivingVehicle.seats[ride.seat]?.peer===p.id;
 const driver=others.get(ride.driver);
 return driver?.drivenVehicle?.id===ride.id&&driver.drivenVehicle.seats[ride.seat]===p.id;
}
function vehiclePerson(id){return id===myId?me:others.get(id)}
function vehicleHead(person,x,y,small=false){
 if(!person)return;
 const appearance=characterAppearance(person);
 const r=small?4.5:6.4;
 circle(x,y+1,r+1,'#1b3048');
 circle(x,y,r,skinTones[appearance.skin][1]);
 circle(x-1.2,y-1.7,r*.73,hairTones[appearance.hair][1]);
 circle(x+r*.45,y-1.6,1,'#f9e0be');
}
function vehicleWheel(x,y,w,h){
 rect(x,y,w,h,Math.min(w,h)/2,'#27323b');
 rect(x+1.5,y+1,w-3,h-2,Math.min(w,h)/2,'#45515a');
}
function drawCycle(model,key,riders){
 const motor=key==='motorcycle';
 const wheelLength=motor?16:14;
 vehicleWheel(-27,-4,wheelLength,motor?8:7);
 vehicleWheel(15,-4,wheelLength,motor?8:7);
 rect(-20,-1.5,41,3,1.5,model.dark);
 rect(-12,-5,motor?26:16,10,5,model.body);
 rect(-10,-4,motor?20:11,2.5,1,model.light);
 rect(-19,-5,11,10,4,'#415364');
 rect(14,-8,4,16,2,'#39485a');
 rect(24,-3,5,6,2,'#ffe4a7');
 vehicleHead(riders[1],-13,0);
 vehicleHead(riders[0],5,0);
}
function drawPassengerCar(model,riders){
 for(const [x,y] of [[-23,-19],[13,-19],[-23,12],[13,12]])vehicleWheel(x,y,12,7);
 rect(-34,-16,68,32,10,model.dark);
 rect(-33,-16,66,30,10,model.body);
 rect(-27,-14,54,3,2,model.light);
 rect(-23,-11,44,22,7,'#b7d7d3');
 rect(-19,-9,35,18,5,'#607f8e');
 rect(-4,-9,3,18,1,'#3d5c6c');
 rect(17,-11,8,22,4,'#99c6d0');
 rect(27,-11,5,7,2,'#fff2bb');rect(27,5,5,7,2,'#fff2bb');
 rect(-33,-11,4,6,2,'#f47d6f');rect(-33,6,4,6,2,'#f47d6f');
 vehicleHead(riders[0],7,-4,true);vehicleHead(riders[1],7,4,true);
 vehicleHead(riders[2],-12,-4,true);vehicleHead(riders[3],-12,4,true);
}
function drawPlayerVehicle(vehicle,driver=null,seats=[]){
 const model=vehicleModels[vehicle.key];
 const riders=[driver,...seats.map(id=>id&&vehiclePerson(id))];
 ctx.save();
 ctx.translate(vehicle.x,vehicle.y);
 ctx.rotate(vehicle.face);
 ctx.fillStyle='#17374a45';
 ctx.beginPath();ctx.ellipse(0,2,vehicle.key==='car'?39:32,vehicle.key==='car'?19:11,0,0,Math.PI*2);ctx.fill();
 if(vehicle.key==='car')drawPassengerCar(model,riders);
 else drawCycle(model,vehicle.key,riders);
 ctx.restore();
 if(!driver)return;
 const occupied=1+seats.filter(Boolean).length;
 const label=cleanName(driver.name)+' · '+occupied+'/'+model.capacity;
 ctx.font='bold 12px system-ui';ctx.textAlign='center';
 const width=ctx.measureText(label).width+16;
 rect(vehicle.x-width/2,vehicle.y-48,width,17,7,'#fff6e1ef');
 ctx.fillStyle='#334943';ctx.fillText(label,vehicle.x,vehicle.y-36);
 const present=riders.filter(Boolean);
 if(present.some(p=>p===me?voiceActive:p.talking&&Date.now()-(p.voiceSeen||0)<1600)){
   circle(vehicle.x+width/2+10,vehicle.y-39,7,'#4a9d89');
   ctx.fillStyle='#effff8';ctx.font='10px system-ui';ctx.fillText('🎙️',vehicle.x+width/2+10,vehicle.y-36);
 }
 const talking=present.filter(p=>p.text&&p.until>Date.now()).sort((a,b)=>b.until-a.until)[0];
 if(!talking)return;
 const message=cleanName(talking.name)+' · '+String(talking.text);
 ctx.font='bold 13px system-ui';
 const lines=[];let line='';
 for(const char of message){
   if(ctx.measureText(line+char).width>195){lines.push(line);line=''}
   line+=char;
 }
 if(line)lines.push(line);
 const visible=lines.slice(0,4);
 const bubbleWidth=Math.max(60,...visible.map(t=>ctx.measureText(t).width+22));
 const bubbleHeight=visible.length*17+8;
 const bubbleY=vehicle.y-53-bubbleHeight;
 rect(vehicle.x-bubbleWidth/2,bubbleY,bubbleWidth,bubbleHeight,8,'#fff8e9');
 ctx.fillStyle='#334943';
 visible.forEach((t,index)=>ctx.fillText(t,vehicle.x,bubbleY+15+index*17));
}
function drawVehicleGarageScene(){
 const {x,y}=garagePosition;
 rect(x-32,y-27,64,53,6,'#ece0b6');
 rect(x-29,y-24,58,47,5,'#7d8b86');
 for(let i=0;i<3;i++)rect(x-21+i*16,y+16,12,2,1,'#e6dec6');
 mapLabel('P',x,y+5,'#fff3cc');
 mapLabel('จุดรับรถ',x,y+39,'#40534b');
}
function queueVehicleDrawing(drawList,visible){
 if(visible(garagePosition.x,garagePosition.y))drawList.push([garagePosition.y-30,drawVehicleGarageScene]);
 if(parkedVehicle&&visible(parkedVehicle.x,parkedVehicle.y)){
   drawList.push([parkedVehicle.y,()=>drawPlayerVehicle(parkedVehicle)]);
 }
 if(drivingVehicle&&visible(me.x,me.y)){
   drawList.push([me.y,()=>drawPlayerVehicle({key:drivingVehicle.key,x:me.x,y:me.y,face:me.face},me,drivingVehicle.seats.map(seat=>seat?.peer))]);
 }
 for(const p of others.values()){
   if(p.parkedVehicle&&visible(p.parkedVehicle.x,p.parkedVehicle.y)){
     drawList.push([p.parkedVehicle.y,()=>drawPlayerVehicle(p.parkedVehicle)]);
   }
   if(p.drivenVehicle&&visible(p.x,p.y)){
     drawList.push([p.y,()=>drawPlayerVehicle({key:p.drivenVehicle.key,x:p.x,y:p.y,face:p.face},p,p.drivenVehicle.seats)]);
   }
 }
}

function leaveHome(){
 setLifeScene('outside',homeDoor.x,homeDoor.y);
 toast('ร้านอยู่หน้าบ้าน · โรงรถอยู่ทางซ้าย · เข้าสวนทางด้านขวาของบ้าน');
}
function setLifeScene(next,x,y){
 if(scene==='outside'&&next!=='outside')resetTownGreetings();
 scene=next;me.x=x;me.y=y;me.walking=false;me.face=next==='room'?-Math.PI/2:Math.PI/2;
 playGameSound('door');
 lifeHud();broadcast(snapshot());
}

function mapLabel(text,x,y,fill='#263831'){
 ctx.fillStyle=fill;ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText(text,x,y);
}
function drawDoor(x,y){
 rect(x-33,y,66,24,5,'#9f603e');
 rect(x-27,y+3,54,17,3,'#c18550');
 circle(x+19,y+10,3,'#f4ce78');
}
function mapTransform(){
 const scale=Math.min((W-16)/world.w,(H-16)/world.h,1.25);
 ctx.translate((W-world.w*scale)/2,(H-world.h*scale)/2);ctx.scale(scale,scale);
}

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
 const place=p===me?scene:p.scene;
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
 const follow=p.id&&!p.poseMotion&&!p.action&&p.pose==='stand'&&!snap?1-Math.exp(-elapsed/44):1;
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
function drawHead(c,lookX,lookY,a,skin,hair,shirt,speaking,motion,now){
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
     shapeLine(c,[[ex-2*eyeWidth,-3.4+gazeY],[ex+.6,-4.1+gazeY],[ex+2.1*eyeWidth,-3.4+gazeY]],hair[1],a.gender===0?1.55:1.05);
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
 drawHead(c,lookX,lookY,a,skin,hair,shirt,speaking,motion,now);
 if(motion)drawHeldProp(c,motion,heldX,heldY,now,lookX);
 else if(p.inMine){
   c.save();c.translate(heldX,heldY);c.rotate(p.swing?Math.sin(now/74)*1.1-.25:.1);
   shapeLine(c,[[0,5],[5,-14]],'#9d704c',4);
   c.textAlign='center';c.font='17px system-ui';c.fillText(TOOLS[p.tool||0].icon,5,-10);c.restore();
 }
 c.restore();
}
function avatar(p){
 const now=performance.now();
 const speaking=p===me?voiceActive:!!p.talking&&Date.now()-(p.voiceSeen||0)<1600;
 const inMine=(p===me?scene:p.scene)==='mine';
 const pose=poseProgress(p,now),motion=movingCharacter(p,now);
 const {seat}=pose;
 const x=pose.x+motion.x-p.x,y=pose.y+motion.y-p.y;
 ctx.save();ctx.translate(x,y);
 paintCharacter(ctx,inMine?{...p,inMine,tool:p===me?selectedTool:p.tool,swing:p===me?now<rockSwingUntil:p.swing}:p,now,speaking,motion,seat);
 ctx.restore();
 if(p!==me&&!personTextNearby(p))return;
 ctx.textAlign='center';ctx.font='bold 12px system-ui';
 const name=cleanName(p.name);
 const width=Math.max(44,ctx.measureText(name).width+19);
 const nameY=y-64+seat*5+motion.sleep*7+(p.swimming?12:0);
 rect(x-width/2,nameY,width,17,7,p===me?'#fff2cfea':'#fffff0ea');
 ctx.fillStyle='#33433e';ctx.fillText(name,x,nameY+12);
 if(speaking){
   circle(x+width/2+10,nameY+9,8,'#3a9f82');
   ctx.font='10px system-ui';ctx.fillText('🎙️',x+width/2+10,nameY+13);
 }
 if(!p.text||p.until<=Date.now())return;
 ctx.font='bold 13px system-ui';
 const lines=[];let line='';
 for(const char of p.text){
   if(ctx.measureText(line+char).width>204){lines.push(line);line=''}
   line+=char;
 }
 if(line)lines.push(line);
 const visible=lines.slice(0,4),bubbleWidth=Math.max(60,...visible.map(t=>ctx.measureText(t).width+22));
 const height=visible.length*19+10,bx=x-bubbleWidth/2,by=y-75-height+seat*5;
 rect(bx+1,by+2,bubbleWidth,height,9,'#172a3740');
 rect(bx,by,bubbleWidth,height,9,'#fff8e9');
 ctx.fillStyle='#273b37';
 visible.forEach((t,index)=>ctx.fillText(t,x,by+18+index*19));
}

const characterDialog=$('characterDialog');
const characterButton=$('editCharacter');
const characterStorage='thai2d_appearance_v5';
try{
 const stored=JSON.parse(localStorage.getItem(characterStorage)||'null');
 if(Number.isInteger(stored?.gender)&&appearanceOptions.gender[stored.gender])me.appearance=cleanAppearance(stored);
}catch{}
const characterForm=$('characterForm');
const genderFields=$('characterGender');
for(const [index,gender] of appearanceOptions.gender.entries()){
 const label=document.createElement('label');
 const radio=document.createElement('input');
 radio.type='radio';radio.required=true;radio.name='gender';radio.value=index;
 const text=document.createElement('span');text.textContent=gender;
 label.append(radio,text);genderFields.append(label);
}
const fieldNames={skin:'สีผิว',hair:'สีผม',style:'ทรงผม',outfit:'ชุด',accessory:'เครื่องประดับ'};
for(const [key,title] of Object.entries(fieldNames)){
 const label=document.createElement('label');
 label.textContent=title;
 const select=document.createElement('select');
 select.name=key;
 for(const [index,name] of appearanceOptions[key].entries()){
   const option=document.createElement('option');option.textContent=name;option.value=index;select.append(option);
 }
 label.append(select);$('characterOptions').append(label);
}
function readCharacterForm(){
 const values=Object.fromEntries([...new FormData(characterForm)].map(([key,value])=>[key,Number(value)]));
 return cleanAppearance(values);
}
function updateCharacterPreview(){
 const canvas=$('characterPreview'),preview=canvas.getContext('2d');
 if(!preview)return;
 preview.clearRect(0,0,canvas.width,canvas.height);
 preview.save();preview.translate(canvas.width/2,canvas.height*.66);preview.scale(3.5,3.5);
 paintCharacter(preview,{face:Math.PI/2,appearance:readCharacterForm()},700);
 preview.restore();
}
let customizedHairStyle=false;
function editCharacter(){
 customizedHairStyle=false;
 const fields=characterForm.elements;
 fields.namedItem('gender').value=me.appearance?.gender??'';
 const appearance=me.appearance||baseAppearance;
 for(const key of Object.keys(fieldNames))fields.namedItem(key).value=appearance[key];
 $('characterTitle').textContent=me.appearance?'แต่งตัวละคร':'สร้างตัวละคร';
 $('cancelCharacter').hidden=!me.appearance;
 $('saveCharacter').textContent=me.appearance?'บันทึกตัวละคร':'เริ่มเล่น';
 keys.clear();
 characterDialog.showModal();
 updateCharacterPreview();
}
characterForm.addEventListener('change',event=>{
 const field=event.target?.name;
 if(field==='style')customizedHairStyle=true;
 if(field==='gender'&&!me.appearance&&!customizedHairStyle){
   characterForm.elements.namedItem('style').value=Number(event.target.value)===1?1:0;
 }
 updateCharacterPreview();
});
characterForm.addEventListener('submit',event=>{
 event.preventDefault();
 if(!characterForm.elements.namedItem('gender').value)return;
 me.appearance=readCharacterForm();
 try{localStorage.setItem(characterStorage,JSON.stringify(me.appearance))}catch{}
 characterDialog.close();
 broadcast(snapshot());
});
characterDialog.addEventListener('cancel',event=>{if(!me.appearance)event.preventDefault()});
characterDialog.addEventListener('close',()=>keys.clear());
$('cancelCharacter').onclick=()=>characterDialog.close();
characterButton.onclick=()=>{if(!me.action&&!lifeDialog.open)editCharacter()};


const cityTrafficLanes=cityRoads.filter(([, ,w,h])=>w>h).slice(0,2)
 .flatMap(([left,y,width,height])=>[
   {left,width,y:y+height*.285,dir:1},{left,width,y:y+height*.69,dir:-1}
 ]);
function queueCityTraffic(drawList,visible,now){
 for(const [i,{left,width,y,dir}] of cityTrafficLanes.entries()){
   for(let j=0;j<5;j++){
     const travel=((now*(.09+i*.012)+j*width/5+i*423)%(width+200))-100;
     const position=left+(dir===1?travel:width-travel);
     if(!visible(position,y,75))continue;
     const x=dir===1?position:TOWN.w-position;
     const car={x,y,direction:dir,color:['#c4786d','#d5ae69','#7797af','#8f809b'][(i+j)%4],kind:(i+j)%2};
     drawList.push([y+8,()=>townDrawCar(car)]);
   }
 }
}

function startGame(){
 resize();
 makeStartingGap();
 loadMine();
 miningHud();
 initializeLife();
 if(!me.appearance)editCharacter();
 tickMineClock();
 saveMine();
 initializeMultiplayer();
 last=performance.now();
 requestAnimationFrame(render);
}
document.addEventListener('DOMContentLoaded',startGame,{once:true});

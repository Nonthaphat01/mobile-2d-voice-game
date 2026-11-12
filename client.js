import {MAX_PLAYERS,ROOM_IDS,starter,sanitizeState,applyAction,lots,WORLD,GROW_MS} from './shared/rules.js';

const el=id=>document.getElementById(id);
const c=el('game'),ctx=c.getContext('2d');
const cfg=window.GAME_CONFIG||{};
const remote=new Map();
let w=innerWidth,h=innerHeight,dpr=1,lastFrame=performance.now(),lastMove=0;
let scene='outside',active=false,online=false,ws=null,db=null,session=null;
let selectedRoom='002',room='002',slot=0,myId='local',ownProfile=starter(),serverRooms=[];
let me={x:0,y:0,face:1,walking:false,text:'',until:0};
let joyX=0,joyY=0,joyId=null,sound=false,soundCtx=null,lastStep=0,ambientAt=0;
let nearestPlot=-1,plotActionTimeout=null,gameHour=8,weather='sun';
const keys=new Set();
const demoKey='my_little_neighborhood_v5_demo';
const onlineReady=Boolean(cfg.apiUrl&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const localNotice='โหมดทดลองเล่นคนเดียว • เซฟในเบราว์เซอร์นี้เท่านั้น';
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);resize();
function notice(msg){const t=el('toast');t.textContent=String(msg).slice(0,160);t.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>{t.hidden=true},3500)}
function lobbyError(t){el('lobbyError').textContent=t||''}
function mine(n){return Math.round(Number(n)||0)}
function hud(){el('money').textContent=`💵 ${mine(ownProfile.money)} บาท`;el('level').textContent=`⭐ Lv.${ownProfile.level}`;const count=online?1+remote.size:1;el('onlineCount').textContent=`👥 ${count}/${MAX_PLAYERS}`;el('hudRoom').textContent=`ชุมชน ${room}`;el('netState').textContent=online?'● ออนไลน์':'● ทดลอง'}
function renderRooms(){const list=el('serverList');list.replaceChildren();for(const id of ROOM_IDS){const r=serverRooms.find(x=>x.id===id);const btn=document.createElement('button');btn.type='button';btn.className='server'+(selectedRoom===id?' selected':'');btn.setAttribute('aria-pressed',selectedRoom===id?'true':'false');
 const icon=document.createElement('span');icon.className='sicon';icon.textContent='🏘️';
 const body=document.createElement('span');body.className='sbody';const title=document.createElement('strong');title.textContent='ชุมชน '+id;const small=document.createElement('small');small.textContent=onlineReady?(r?`มีพื้นที่ว่าง ${MAX_PLAYERS-r.count} แปลง`:'กำลังตรวจสอบสถานะ...'):'ทดลองเล่นในเครื่องเท่านั้น';body.append(title,small);
 const count=document.createElement('span');count.className='count';count.textContent=r?`${r.count}/${r.capacity}`:'—/8';btn.disabled=Boolean(r?.count>=MAX_PLAYERS);btn.append(icon,body,count);btn.onclick=()=>{selectedRoom=id;renderRooms()};list.append(btn)} }
async function refreshRooms(){if(!onlineReady){serverRooms=[];renderRooms();return}try{const base=cfg.apiUrl.replace(/\/$/,'');const res=await fetch(base+'/api/rooms',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!res.ok)throw new Error('เซิร์ฟเวอร์ไม่ตอบสนอง');const json=await res.json();serverRooms=Array.isArray(json.rooms)?json.rooms:[];lobbyError('');}catch{serverRooms=[];lobbyError('ยังติดต่อเซิร์ฟเวอร์ออนไลน์ไม่ได้ แต่โหมดทดลองยังใช้งานได้')}renderRooms()}
el('refreshRooms').onclick=refreshRooms;
async function clientDb(){if(!onlineReady)throw new Error('ยังไม่ตั้งค่า config.js');if(db)return db;const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});return db}
async function authUser(mode){const auth=(await clientDb()).auth;const email=el('email').value.trim(),password=el('password').value;
 let result;if(mode==='login')result=await auth.signInWithPassword({email,password});else if(mode==='signup')result=await auth.signUp({email,password});else result=await auth.signInAnonymously();
 if(result.error)throw result.error;
 if(!result.data.session){lobbyError('สมัครบัญชีแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');return false}
 session=result.data.session;lobbyError('');notice('เข้าสู่ระบบสำเร็จ');return true}
for(const [button,mode] of [['loginAccount','login'],['signupAccount','signup'],['guestAccount','guest']])el(button).onclick=async()=>{try{el(button).disabled=true;await authUser(mode)}catch(e){lobbyError('เข้าสู่ระบบไม่ได้: '+e.message)}finally{el(button).disabled=false}};
async function joinOnline(){
 if(!onlineReady){lobbyError('ยังไม่ตั้งค่า Supabase และที่อยู่เซิร์ฟเวอร์ใน config.js จึงเข้าออนไลน์จริงไม่ได้');return}
 const button=el('joinOnline');button.disabled=true;button.textContent='⏳ กำลังโหลดบ้านเดิม...';lobbyError('');
 try{
   const client=await clientDb();const user=await client.auth.getSession();session=user.data.session;
   if(!session){lobbyError('กรุณาเข้าสู่ระบบหรือสมัครบัญชีในหัวข้อ 🔐 ก่อนเข้าชุมชนออนไลน์');return}
   const raw=cfg.apiUrl.replace(/\/$/,'');const addr=raw.replace(/^http:/,'ws:').replace(/^https:/,'wss:')+'/';
   await new Promise((resolve,reject)=>{
     const socket=new WebSocket(addr);ws=socket;let done=false;
     const timer=setTimeout(()=>{if(!done){done=true;socket.close();reject(new Error('เชื่อมต่อช้าเกินไป ตรวจสอบเซิร์ฟเวอร์'))}},12000);
     const fail=err=>{if(done)return;done=true;clearTimeout(timer);socket.close();reject(err instanceof Error?err:new Error(String(err)))};
     socket.onopen=()=>socket.send(JSON.stringify({type:'auth',token:session.access_token,room:selectedRoom,name:el('nickname').value}));
     socket.onmessage=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return}
       if(msg.type==='joined'){if(done)return;done=true;clearTimeout(timer);online=true;room=msg.room;slot=msg.slot;myId=msg.id;ownProfile=sanitizeState(msg.profile);remote.clear();for(const p of msg.players||[])remote.set(p.id,p);onJoined();resolve()}
       else if(msg.type==='error'){fail(new Error(msg.message||'ไม่สามารถเข้าห้องได้'))}
       else onNetwork(msg)
     };
     socket.onerror=()=>fail(new Error('เชื่อมต่อออนไลน์ไม่สำเร็จ'));
     socket.onclose=()=>{if(!done){fail(new Error('การเชื่อมต่อถูกตัด'));return}if(active&&online){notice('อินเทอร์เน็ตหลุด กำลังกลับหน้ารายการห้อง');setTimeout(()=>leaveGame(),1100)}};
   });
 }catch(e){lobbyError(e.message||String(e));online=false}finally{button.disabled=false;button.textContent='🌍 เข้าชุมชนออนไลน์'}
}
el('joinOnline').onclick=joinOnline;
function demoData(){try{const d=JSON.parse(localStorage.getItem(demoKey)||'null');if(d&&d.profile)return sanitizeState(d.profile)}catch{}return starter(el('nickname').value)}
function demoSave(){if(!online)try{localStorage.setItem(demoKey,JSON.stringify({profile:ownProfile,savedAt:Date.now()}))}catch{}}
el('playDemo').onclick=()=>{online=false;ws?.close();ws=null;room=selectedRoom;myId='demo';slot=0;ownProfile=demoData();ownProfile.displayName=(ownProfile.displayName==='ผู้เล่น'?el('nickname').value.trim().slice(0,18)||'ผู้เล่น':ownProfile.displayName);demoSave();remote.clear();onJoined();notice(localNotice)};
function onJoined(){const l=lots[slot];scene='outside';me={x:l.x+247,y:slot<4?l.y+l.h-45:l.y+50,face:1,walking:false,text:'',until:0};active=true;el('lobby').hidden=true;for(const id of ['hud','gameHelp','joystick','gameActions','chatForm'])el(id).hidden=false;hud();if(!online)demoSave()}
function onNetwork(m){if(!active&&m.type!=='rooms')return;
 if(m.type==='rooms'){serverRooms=m.rooms;renderRooms()}
 else if(m.type==='player'){remote.set(m.player.id,m.player);hud()}
 else if(m.type==='left'){remote.delete(m.id);hud()}
 else if(m.type==='moved'){const p=remote.get(m.id);if(p)Object.assign(p,{x:m.x,y:m.y,scene:m.scene})}
 else if(m.type==='said'){const p=remote.get(m.id);if(p)Object.assign(p,{text:m.text,until:m.until})}
 else if(m.type==='profile'){ownProfile=sanitizeState(m.profile);hud();notice(m.notice||'บันทึกข้อมูลแล้ว')}
 else if(m.type==='homeUpdate'){const p=remote.get(m.id);if(p)p.home=m.home}
 else if(m.type==='notice'){notice(m.message)}
 else if(m.type==='kicked'){notice(m.message);leaveGame()}
 else if(m.type==='error'){notice(m.message)}
}
function send(m){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m))}
function action(a){if(online){send({type:'action',action:a});return}const result=applyAction(ownProfile,a);notice(result.message);if(result.ok){demoSave();hud();drawOpenDialog()}}
function leaveGame(){active=false;online=false;ws?.close();ws=null;remote.clear();el('lobby').hidden=false;for(const id of ['hud','gameHelp','joystick','gameActions','chatForm'])el(id).hidden=true;dialogClose();joyReset();refreshRooms()}
el('menuBtn').onclick=()=>showDialog('เมนูเกม',d=>{addButton(d,'↩️ กลับหน้าเลือกเซิร์ฟเวอร์',()=>leaveGame());addText(d,online?'บ้านและเงินบันทึกไว้ในฐานข้อมูลบนเซิร์ฟเวอร์แล้ว':'ข้อมูลทดลองบันทึกในเบราว์เซอร์เครื่องนี้')});
function addText(parent,t,cls='muted'){const p=document.createElement('p');p.textContent=t;p.className=cls;parent.append(p);return p}
function addButton(parent,text,fn,disabled=false){const b=document.createElement('button');b.className='dialog-action';b.textContent=text;b.disabled=disabled;b.onclick=()=>{fn()};parent.append(b);return b}
function showDialog(title,draw){el('dialogTitle').textContent=title;el('dialogContent').replaceChildren();draw(el('dialogContent'));if(!el('dialog').open)el('dialog').showModal()}
function dialogClose(){el('dialog').close?.()}
el('dialogClose').onclick=dialogClose;el('dialog').addEventListener('click',e=>{if(e.target===el('dialog'))dialogClose()});
let dialogType=null,dialogPlot=-1;
function drawOpenDialog(){if(!el('dialog').open)return;if(dialogType==='inventory')inventory();else if(dialogType==='plot')openPlot(dialogPlot);else if(dialogType==='house')homeDialog();else if(dialogType==='shop')shopDialog()}
function inventory(){dialogType='inventory';showDialog('🎒 กระเป๋าของฉัน',d=>{
 addText(d,`เงิน ${ownProfile.money} บาท · เลเวล ${ownProfile.level} · EXP ${ownProfile.xp}/${ownProfile.level*30}`);
 const keys=[['hoe','⛏️ จอบเก่า'],['watering_can','💦 บัวรดน้ำ'],['tomato_seed','🌱 เมล็ดมะเขือเทศ'],['tomato','🍅 มะเขือเทศ']];
 const grid=document.createElement('div');grid.className='dialog-grid';for(const [key,label] of keys){const r=document.createElement('div');r.className='dialog-row';r.textContent=`${label} × ${ownProfile.inventory[key]||0}`;grid.append(r)}d.append(grid);
 addButton(d,'🪑 ซื้อเฟอร์นิเจอร์เข้าบ้าน',()=>homeDialog());
 });
}
function openPlot(i){if(i<0||i>=10)return;dialogType='plot';dialogPlot=i;const p=ownProfile.home.plots[i];const ripe=p.crop&&p.watered&&Date.now()-p.plantedAt>=GROW_MS;
 showDialog(`🌱 แปลงสวนที่ ${i+1}`,d=>{
 addText(d,p.crop?`ปลูกมะเขือเทศแล้ว${p.watered?' • รดน้ำแล้ว':' • ต้องรดน้ำ'}`:'แปลงว่าง พร้อมปลูกพืช');
 if(p.crop&&p.watered&&!ripe)addText(d,`รอเก็บเกี่ยวประมาณ ${Math.max(0,Math.ceil((GROW_MS-(Date.now()-p.plantedAt))/1000))} วินาที`);
 if(!p.crop)addButton(d,`ปลูกเมล็ดมะเขือเทศ (มี ${ownProfile.inventory.tomato_seed})`,()=>action({type:'plant',plot:i}),ownProfile.inventory.tomato_seed<1);
 else if(!p.watered)addButton(d,'💦 รดน้ำ',()=>action({type:'water',plot:i}));
 else addButton(d,'🍅 เก็บเกี่ยว +3 ผล / +10 EXP',()=>action({type:'harvest',plot:i}),!ripe);
 });
}
function homeDialog(){dialogType='house';showDialog('🏡 บ้านของฉัน',d=>{addText(d,'บ้านเริ่มต้นว่างเปล่า คุณค่อย ๆ ซื้อเฟอร์นิเจอร์ได้');addText(d,'ของในบ้าน: '+(ownProfile.home.furniture.join(', ')||'ยังไม่มี'));
 addButton(d,'🛏️ ซื้อเตียง 45 บาท',()=>action({type:'buy',item:'bed'}),ownProfile.money<45);
 addButton(d,'🪑 ซื้อเก้าอี้ 25 บาท',()=>action({type:'buy',item:'chair'}),ownProfile.money<25)
 });}
function shopDialog(){dialogType='shop';showDialog('🏪 ตลาดชุมชน (ตู้บริการอัตโนมัติ)',d=>{
 addText(d,'ไม่มี NPC ขายของในช่วงเริ่มต้น ผู้เล่นซื้อขายได้ที่ตู้บริการ');
 addButton(d,'🌱 ซื้อเมล็ดมะเขือเทศ 5 บาท',()=>action({type:'seed'}),ownProfile.money<5);
 addButton(d,`🍅 ขายมะเขือเทศทั้งหมด × ${ownProfile.inventory.tomato||0} (7 บาท/ผล)`,()=>action({type:'sell'}),!ownProfile.inventory.tomato);
 });}
el('bagBtn').onclick=inventory;
function localLot(){return lots[slot]}
function plotRect(l,i){return {x:l.x+269+(i%2)*94,y:l.y+53+Math.floor(i/2)*65,w:78,h:53}}
function houseRect(l){return {x:l.x+35,y:l.y+55,w:192,h:165}}
function doorPos(l){return {x:l.x+131,y:l.y+237}}
function nearestInteract(){if(scene==='inside')return {type:'exit'};const l=localLot();const door=doorPos(l);
 if(Math.hypot(me.x-door.x,me.y-door.y)<110)return {type:'door'};
 let best=-1,dist=105;for(let i=0;i<10;i++){const r=plotRect(l,i);const d=Math.hypot(me.x-r.x-r.w/2,me.y-r.y-r.h/2);if(d<dist){dist=d;best=i}}
 if(best>=0)return {type:'plot',plot:best};
 if(Math.hypot(me.x-WORLD.w/2,me.y-640)<130)return {type:'shop'};
 return {type:'none'}
}
function interact(){const act=nearestInteract();if(act.type==='exit'){scene='outside';const p=doorPos(localLot());me.x=p.x;me.y=p.y+45;notice('ออกจากบ้านแล้ว')}
 else if(act.type==='door'){scene='inside';me.x=325;me.y=300;notice('เข้าบ้านของคุณแล้ว')}
 else if(act.type==='plot')openPlot(act.plot);
 else if(act.type==='shop')shopDialog();
 else notice('เดินเข้าใกล้เตียงบ้าน แปลงสวน หรือร้านกลางชุมชน แล้วกด E')
}
el('interactBtn').onclick=interact;
el('soundBtn').onclick=async()=>{sound=!sound;el('soundBtn').textContent=sound?'🔊 เสียง':'🔇 เสียง';if(sound){try{soundCtx??=new (window.AudioContext||window.webkitAudioContext)();await soundCtx.resume();notice('เปิดเสียงลม นก และฝีเท้าแล้ว')}catch{notice('เบราว์เซอร์นี้ไม่รองรับเสียงประกอบ')}}};
function blip(freq=440,duration=.09,vol=.015,type='sine'){if(!sound||!soundCtx)return;const a=soundCtx.createOscillator(),g=soundCtx.createGain();a.type=type;a.frequency.setValueAtTime(freq,soundCtx.currentTime);g.gain.setValueAtTime(vol,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,soundCtx.currentTime+duration);a.connect(g).connect(soundCtx.destination);a.start();a.stop(soundCtx.currentTime+duration)}
function playAmbient(t){if(!sound||!soundCtx||t-ambientAt<1900)return;ambientAt=t;const f=600+Math.sin(t/9000)*130;blip(f,.2,.006,'sine');setTimeout(()=>blip(f*1.15,.13,.003,'sine'),130)}
el('chatForm').onsubmit=e=>{e.preventDefault();const input=el('chatInput'),t=input.value.trim().slice(0,120);if(!t)return;me.text=t;me.until=Date.now()+5000;if(online)send({type:'say',text:t});input.value='';input.blur();notice('💬 '+t)};
addEventListener('keydown',e=>{
 const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)){keys.add(e.key.toLowerCase());if(active)e.preventDefault()}
 if(!active||e.repeat||el('dialog').open)return;
 if(e.key.toLowerCase()==='e'){interact();e.preventDefault()}
 if(e.key.toLowerCase()==='i'){inventory();e.preventDefault()}
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{keys.clear();joyReset()});
const joy=el('joystick'),stick=el('stick');
function joyMove(e){const r=joy.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,m=Math.max(1,r.width/2-30),d=Math.hypot(x,y),n=Math.min(d,m),a=Math.atan2(y,x);joyX=Math.cos(a)*n/m;joyY=Math.sin(a)*n/m;stick.style.transform=`translate(${joyX*m}px,${joyY*m}px)`}
function joyReset(){joyId=null;joyX=joyY=0;stick.style.transform='translate(0,0)'}
joy.addEventListener('pointerdown',e=>{if(joyId!==null)return;joyId=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyMove(e)});for(const kind of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(kind,e=>{if(joyId===e.pointerId)joyReset()});
function round(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function line(x,y,x2,y2,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function text(t,x,y,size=13,col='#fff',align='center'){ctx.textAlign=align;ctx.font=`600 ${size}px system-ui`;ctx.fillStyle=col;ctx.fillText(t,x,y)}
function road(){round(0,0,WORLD.w,WORLD.h,0,'#77a65c');for(let x=0;x<WORLD.w;x+=110)for(let y=0;y<WORLD.h;y+=110){circle(x+((y/110)%2)*33,y,3,'#689a52')}
 round(0,560,WORLD.w,176,0,'#4e6564');round(0,575,WORLD.w,146,0,'#657578');for(let x=10;x<WORLD.w;x+=130)round(x,646,72,6,3,'#f7e6ae');
 line(0,559,WORLD.w,559,'#d7c2a3',10);line(0,735,WORLD.w,735,'#d7c2a3',10);
 round(WORLD.w/2-64,588,128,111,10,'#3e5549');text('🏪',WORLD.w/2,625,26);text('ตลาด',WORLD.w/2,656,15);
 for(let x=54;x<WORLD.w;x+=235){circle(x,566,19,'#597d4c');circle(x-7,552,12,'#7fa85a');circle(x,737,16,'#6d8e51')}
}
function fence(l){const x=l.x,y=l.y,right=x+l.w,bottom=y+l.h,gx=x+225,gw=42,top=l.slot>=4;
 const color='#b9a37c';
 line(x,y,x+l.w,y,color,7);line(x,y,x,bottom,color,7);line(right,y,right,bottom,color,7);if(top){line(x,y,gx,y,color,7);line(gx+gw,y,right,y,color,7);line(x,bottom,right,bottom,color,7)}
 else{line(x,bottom,gx,bottom,color,7);line(gx+gw,bottom,right,bottom,color,7)}
 for(let yy=y;yy<=bottom;yy+=31){round(x-4,yy,9,10,2,'#e2ca91');round(right-4,yy,9,10,2,'#e2ca91')}
}
function drawHouse(l,p,now){const h=houseRect(l);round(h.x+4,h.y+10,h.w,h.h,10,'#3c3d33');round(h.x,h.y,h.w,h.h,12,'#a88460');
 // Wooden roof with gentle animated highlight.
 round(h.x+5,h.y+5,h.w-10,95,9,'#c48155');for(let i=0;i<7;i++)line(h.x+11,h.y+14+i*13,h.x+h.w-11,h.y+14+i*13,'#dba06f',2);
 round(h.x+19,h.y+113,42,31,5,'#c8e8ce');round(h.x+129,h.y+113,42,31,5,'#c8e8ce');round(h.x+96,h.y+141,40,24,5,'#5c463e');
 text('🏠',h.x+h.w/2,h.y+89,31);
 const door=doorPos(l);round(door.x-13,door.y-12,26,18,5,'#a17d5a');
 text('🚪',door.x,door.y+8,19);text(p.name||'ผู้เล่น',l.x+l.w/2,l.y+31,15,'#f2fbec');
}
function drawPlot(l,i,plot,now){const r=plotRect(l,i);round(r.x,r.y,r.w,r.h,8,'#60482f');for(let j=0;j<3;j++)line(r.x+9,r.y+12+j*15,r.x+r.w-9,r.y+12+j*15,'#82613d',3);
 if(plot?.crop){const grow=plot.watered?Math.min(1,(Date.now()-plot.plantedAt)/GROW_MS):.17;const yy=r.y+r.h/2;const size=12+grow*6;
 for(const ox of [-20,0,20]){line(r.x+r.w/2+ox,yy+12,r.x+r.w/2+ox,yy-7,'#6cad45',4);circle(r.x+r.w/2+ox-5,yy-10,size/2,'#4c994f');if(grow>.92)circle(r.x+r.w/2+ox+7,yy-7,6,'#ee624a')}
 }else text('+',r.x+r.w/2,r.y+r.h/2+6,20,'#d0b888');
 text(String(i+1),r.x+10,r.y+15,10,'#dccfb6')}
function drawEmpty(l){round(l.x,l.y,l.w,l.h,13,'#80a862');round(l.x+20,l.y+20,l.w-40,l.h-40,10,'#81ac67');text('🏡',l.x+l.w/2,l.y+170,42);text('แปลงบ้านว่าง',l.x+l.w/2,l.y+215,17,'#345338');text('รอผู้เล่นเข้าชุมชน',l.x+l.w/2,l.y+242,12,'#46604a');fence(l)}
function worldDraw(now){road();const lotsUsed=new Map([[slot,{name:ownProfile.displayName,home:ownProfile.home}]]);for(const p of remote.values())if(p?.slot>=0&&p?.slot<8)lotsUsed.set(p.slot,{name:p.name,home:p.home});
 for(const l of lots){const u=lotsUsed.get(l.slot);if(!u){drawEmpty(l);continue}round(l.x,l.y,l.w,l.h,12,'#8faf6a');for(let i=0;i<10;i++)drawPlot(l,i,u.home?.plots?.[i],now);drawHouse(l,u,now);fence(l)}
 for(const p of remote.values())if(p.scene==='outside')avatar(p,now,false);avatar({...me,name:ownProfile.displayName},now,true)
}
function indoors(now){round(0,0,650,430,0,'#d6b88e');for(let y=36;y<430;y+=48)line(15,y,635,y,'#c29a76',1);round(0,0,650,43,0,'#836b61');round(0,0,21,430,0,'#927566');round(630,0,20,430,0,'#927566');round(300,408,55,22,3,'#634f45');text('🚪',325,415,21);
 text('บ้านของ '+ownProfile.displayName,325,90,22,'#4b443a');if(ownProfile.home.furniture.length===0)text('ห้องยังว่างเปล่า — ซื้อของตกแต่งได้',325,170,16,'#7a6650');
 ownProfile.home.furniture.forEach((item,i)=>{const x=96+(i%3)*166,y=190+Math.floor(i/3)*94;if(item==='bed'){round(x,y,108,66,8,'#806352');round(x+8,y+7,90,55,6,'#e4f2ee');round(x+11,y+9,35,48,6,'#c9dfd4');text('🛏️',x+53,y+48,32)}else{round(x,y,72,65,8,'#b27e55');round(x+7,y+8,58,48,4,'#e0ad75');text('🪑',x+36,y+42,28)}});
 avatar({...me,name:ownProfile.displayName},now,true)
}
function avatar(p,now,local){const x=p.x,y=p.y;circle(x,y+14,15,'#3d513848');const moving=local?me.walking:false;const phase=moving?Math.sin(now/95)*4:0;
 round(x-11,y+2,10,16+phase,4,'#314d65');round(x+1,y+2,10,16-phase,4,'#314d65');round(x-15,y-10,30,25,9,local?'#6ec2b5':'#e8a469');circle(x,y-16,12,'#f4c4a0');circle(x-4,y-18,1.8,'#263b38');circle(x+4,y-18,1.8,'#263b38');line(x-3,y-11,x+3,y-11,'#a55e59',1.7);
 const name=String(p.name||'ผู้เล่น').slice(0,18);round(x-58,y-58,116,20,8,local?'#eefbea':'#fbeed7');text(name,x,y-43,11,'#254c34');
 if(p.text&&p.until>Date.now()){const txt=String(p.text).slice(0,40);round(x-118,y-96,236,31,10,'#fff');text(txt,x,y-76,12,'#245044')}
}
function background(now){ctx.fillStyle='#6b985e';ctx.fillRect(0,0,w,h);const camera=scene==='outside'?{x:me.x,y:me.y,zoom:Math.min(1.0,Math.max(.7,w/830))}:{x:325,y:215,zoom:Math.min(w/670,h/450,1.5)};
 ctx.save();ctx.translate(w/2,h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
 if(scene==='outside')worldDraw(now);else indoors(now);ctx.restore();
 const minute=(now/1000)%720,night=minute>540||minute<120;
 if(night){ctx.fillStyle='rgba(13,24,54,.25)';ctx.fillRect(0,0,w,h)}
 if(scene==='outside'){const ev=['🌤️ อากาศแจ่มใส','🌧️ ฝนพรำ','🌻 ผลผลิตอุดมสมบูรณ์','🎊 กิจกรรมชุมชน','🍃 ลมเย็นสบาย'][Math.floor(now/84000)%5];round(13,76,230,30,11,'#1e4c3ddc');text(ev,128,97,13,'#efffe9')}
}
function canMove(x,y){if(scene==='inside')return x>22&&y>55&&x<628&&y<399;
 if(x<22||y<22||x>WORLD.w-22||y>WORLD.h-22)return false;
 const l=localLot(),house=houseRect(l);
 if(x>house.x-14&&x<house.x+house.w+14&&y>house.y-15&&y<house.y+house.h+10)return false;
 // Fences are collision walls, except for a 42px centered gate toward the road.
 for(const q of lots){const gx=q.x+225,gRight=gx+42,top=q.slot>=4;
   const insideX=x>=q.x-11&&x<=q.x+q.w+11;
   if(!insideX)continue;
   if(Math.abs(y-q.y)<11||Math.abs(y-(q.y+q.h))<11){const gateOnTop=top&&Math.abs(y-q.y)<11,gateOnBottom=!top&&Math.abs(y-(q.y+q.h))<11;if(!((gateOnTop||gateOnBottom)&&x>gx+14&&x<gRight-14))return false}
   if((Math.abs(x-q.x)<11||Math.abs(x-(q.x+q.w))<11)&&y>q.y-11&&y<q.y+q.h+11)return false;
 }
 return true}
function tick(now){const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
 if(active){
  let dx=joyX+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let dy=joyY+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
  const m=Math.hypot(dx,dy);me.walking=m>.07&&!el('dialog').open;
  if(me.walking){dx/=m;dy/=m;const speed=174;
    if(canMove(me.x+dx*speed*dt,me.y))me.x+=dx*speed*dt;
    if(canMove(me.x,me.y+dy*speed*dt))me.y+=dy*speed*dt;
    me.face=dx>=0?1:-1;
    if(now-lastStep>210){lastStep=now;blip(160+(now%3)*24,.05,.008,'triangle')}
  }
  if(online&&now-lastMove>125){lastMove=now;send({type:'move',x:Math.round(me.x),y:Math.round(me.y),scene})}
  playAmbient(now);
  background(now)
 }else{
   ctx.fillStyle='#14332b';ctx.fillRect(0,0,w,h);
   for(let i=0;i<20;i++){circle(((i*431+now/250*(i%3+1))%w),((i*193+now/800)%h),2,'#b5e6ab33')}
 }
 requestAnimationFrame(tick)
}
requestAnimationFrame(tick);
// Tap gardens or door. Mouse/touch on canvas is mapped into world coordinates.
c.addEventListener('pointerup',e=>{if(!active||el('dialog').open)return;const zoom=scene==='outside'?Math.min(1,Math.max(.7,w/830)):Math.min(w/670,h/450,1.5),bx=scene==='outside'?me.x:325,by=scene==='outside'?me.y:215;
 const x=(e.clientX-w/2)/zoom+bx,y=(e.clientY-h/2)/zoom+by;
 if(scene==='inside'){if(Math.hypot(x-325,y-413)<75)interact();return}
 const l=localLot();for(let i=0;i<10;i++){const r=plotRect(l,i);if(x>r.x&&y>r.y&&x<r.x+r.w&&y<r.y+r.h){if(Math.hypot(me.x-x,me.y-y)<115)openPlot(i);else notice('เดินเข้าใกล้แปลงสวนก่อนครับ');return}}
 const door=doorPos(l);if(Math.hypot(x-door.x,y-door.y)<40)interact();
});
if(!onlineReady)el('connectionHint').textContent='ยังไม่ใส่ค่าเซิร์ฟเวอร์ • เล่นเดโมได้ทันที และเซฟลงเครื่อง';
else el('connectionHint').textContent='ออนไลน์ต้องเข้าสู่ระบบด้านล่างก่อนเข้าชุมชน ข้อมูลจะบันทึกบน Supabase';
try{el('nickname').value=localStorage.getItem('v5_nickname')||'ผู้เล่น'}catch{}
el('nickname').addEventListener('input',()=>{try{localStorage.setItem('v5_nickname',el('nickname').value)}catch{}});
refreshRooms();setInterval(()=>{if(!active)refreshRooms()},12000);

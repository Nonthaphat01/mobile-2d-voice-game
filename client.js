import {estateBounds,estateFenceBlocks,estateFenceSegments,estateGardenFields,estatePlotRect,estatePlotIndex,estateWorld,estateFromWire,estateToWire,mapEstateLot} from './shared/estate-layout.js?v=estate-guide-1';
import {roomVoice} from './game-voice.js?v=estate-1';
import {CROPS,cropStock,seedKey,roomSize,houseExpansionLevel,gardenExpansionLevel,plotCount,EXPANSION_PRICES,MAX_GARDENERS,workersOf} from './shared/estate.js?v=house-reset-1';
import {MAX_PLAYERS,ROOM_IDS,starter,sanitizeState,sanitizeFurniture,applyAction,lots as baseLots,WORLD,GROW_MS,HOME_GRID as BASE_GRID,homeGrid,FURNITURE_TYPES,furnitureFootprint,isValidFurniturePlacement} from './shared/rules.js?v=profile-save-1';
import {drawClassicActor,resetAvatarMotion,buildAppearanceEditor,hasChosenAppearance,getChosenAppearance,useSavedAppearance} from './v4-avatar-bridge.js?v=town-1';
import {grassTexture,roadTexture,soilTexture,woodTexture,roofTexture} from './v4-textures.js';
import {MOVE_INTERVAL_MS,updateRemoteMotion,sampleRemoteMotion} from './shared/remote-motion.js?v=v5-smooth-1';
import {drawFurniture, furnitureRect} from './home-furniture.js?v=v5-neighbors-1';
import {GARDENER_PLANS,GARDENER_HEARTBEAT,MARKET_HOUR_MS,gardenerPosition,gardenerPost,gardenBoxPosition,gradeOf,marketPrice} from './shared/farming.js?v=estate-guide-1';

import {drawCommunityMap} from './community-map.js?v=town-1';

const lots=baseLots.map(mapEstateLot);
import {furniturePose} from './shared/furniture.js?v=v5-neighbors-1';
import {groupListings} from './shared/social.js?v=v5-neighbors-1';
import {renderClassicAvatar} from './v4-character.js?v=town-1';
import {installSocialUI} from './social-ui.js?v=effects-2';
import {weatherAt, drawWeather, sway} from './weather.js?v=v5-farm-1';
import {fatigueOpacity,hungerOffset,LOW_NEED,NEEDS_STEP_MS} from './shared/needs.js?v=v5-hud-1';
import {walkFootprints,drawFootprints} from './shared/footprints.js?v=effects-1';
import {VEHICLES,HOME_FINISHES,sanitizeArchitecture,partitionKey,partitionLine,partitionBlocks} from './shared/town.js?v=town-1';

const el=id=>document.getElementById(id);
const c=el('game'),ctx=c.getContext('2d');
const cfg=window.GAME_CONFIG||{};
const marketConfigured=cfg.onlineMarket===true||Boolean(cfg.sheetsMarketUrl);
const remote=new Map();
const footprints=walkFootprints();
const footprintPlace=()=>scene==='outside'?'outside':visiting?.id||myId;
const gardenerVisuals=new Map();
let visiting=null, houseEnteredAt=0, HOME_GRID=BASE_GRID;
const interior=()=>roomSize(visiting?.expansion??houseExpansionLevel(ownProfile.home));
const interiorGrid=()=>homeGrid(visiting?.expansion??houseExpansionLevel(ownProfile.home));
const interiorArchitecture=()=>buildDraft?.architecture??visiting?.architecture??ownProfile.home.architecture;
const isNight=()=>{const minute=Math.floor(Date.now()/1000)%720;return minute>540||minute<120};
const produceEntries=inventory=>Object.keys(CROPS).flatMap(crop=>Object.entries(cropStock(inventory,crop).tomatoGrades).map(([key,count])=>[crop,key,count]));
let w=innerWidth,h=innerHeight,dpr=1,lastFrame=performance.now(),lastMove=0;
let sentMovement;
let scene='outside',active=false,online=false,fbGame=null,session=null;
let selectedRoom='002',room='002',slot=0,myId='local',ownProfile=starter(),serverRooms=[];
let me={x:0,y:0,face:1,walking:false,text:'',until:0};
let joyX=0,joyY=0,joyId=null,sound=false,soundCtx=null,lastStep=0,ambientAt=0;
let plotReadyTimer,renderedCamera;
let gardenerPending=false, gardenerRetryAt=0, gardenerResume=false, receiptSeen=0;
let pendingGardenAction=null;
let marketEpoch=-1, weather=weatherAt(Date.now());
let nextNeedsAt=0, needsPending=false, tiredSince=null, hungrySince=null, unread=0;
const reducedEffects=matchMedia('(prefers-reduced-motion: reduce)');
const keys=new Set();
const demoKey='my_little_neighborhood_v5_demo';
const onlineReady=Boolean(cfg.firebase?.apiKey&&cfg.firebase?.databaseURL&&cfg.firebase?.projectId);
const localNotice='โหมดทดลองเล่นคนเดียว • เซฟในเบราว์เซอร์นี้เท่านั้น';
let buildCamera;
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);buildCamera=null}
addEventListener('resize',resize);resize();
function appendChat(author,message,system=false){
 if(!message)return;
 const log=el('chatLog');
 const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<18;
 const row=document.createElement('p'), name=document.createElement('strong');
 row.className=system?'system':'player-message';
 name.textContent=String(author).slice(0,18)+': ';
 row.append(name,String(message).slice(0,160));
 log.append(row);
 if(log.childElementCount>70)log.firstElementChild.remove();
 if(atBottom)log.scrollTop=log.scrollHeight;
 if(el('chatFeed').hidden){
   unread++;
   el('chatBadge').hidden=false;
   el('chatBadge').textContent=unread>99?'99+':String(unread);
 }
}
function notice(msg,chatOnly=false){
 const message=String(msg||'').slice(0,160);
 if(active)appendChat('ระบบ',message,true);
 if(chatOnly)return;
 if(buildDraft){el('buildStatus').textContent=message;return}
 if(el('dialog').open){el('dialogStatus').textContent=message;return}
}
function setChatOpen(open){
 el('chatFeed').hidden=!open;
 el('chatToggle').setAttribute('aria-expanded',String(open));
 if(open){
   unread=0;
   el('chatBadge').hidden=true;
   el('chatLog').scrollTop=el('chatLog').scrollHeight;
 }
}
el('chatToggle').onclick=()=>setChatOpen(el('chatFeed').hidden);
function updateNeedsHud(){
 for(const [key,value] of Object.entries(ownProfile.needs)){
   const meter=el(key), output=el(key+'Value');
   meter.value=value;
   output.value=String(Math.round(value));
   output.classList.toggle('low',value<LOW_NEED);
 }
}
function lobbyError(message=''){
 const status=el('lobbyError');
 status.textContent=message;
 status.hidden=!message;
}
function mine(n){return Math.round(Number(n)||0)}
function hud(){el('money').textContent=`💵 ${mine(ownProfile.money)} บาท`;el('level').textContent=`⭐ Lv.${ownProfile.level}`;const count=online?1+remote.size:1;el('onlineCount').textContent=`👥 ${count}/${MAX_PLAYERS}`;el('hudRoom').textContent=`ชุมชน ${room}`;el('netState').textContent=online?'● ออนไลน์':'● ทดลอง';updateNeedsHud()}

let accountMode='login', accountBusy=false, joining=false;
let firebasePromise, roomsRequest, roomsGeneration=0;
const joinLabel=()=> 'เข้าชุมชน '+selectedRoom;

function authMessage(error){
 const messages={
   'auth/invalid-credential':'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
   'auth/user-not-found':'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
   'auth/wrong-password':'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
   'auth/invalid-email':'กรุณาตรวจสอบอีเมล',
   'auth/email-already-in-use':'อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ',
   'auth/weak-password':'ใช้รหัสผ่านอย่างน้อย 6 ตัวอักษร',
   'auth/password-does-not-meet-requirements':'รหัสผ่านไม่ผ่านเงื่อนไข กรุณาลองรหัสผ่านที่ยาวและซับซ้อนขึ้น',
   'auth/network-request-failed':'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง',
   'auth/too-many-requests':'ลองหลายครั้งเกินไป กรุณารอสักครู่',
   'auth/user-disabled':'บัญชีนี้ถูกระงับ',
   'auth/operation-not-allowed':'ยังไม่ได้เปิดวิธีเข้าสู่ระบบนี้',
   'auth/admin-restricted-operation':'ยังไม่ได้เปิดวิธีเข้าสู่ระบบนี้'
 };
 return messages[error?.code] || 'เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง';
}

function updateEntryControls(){
 for(const id of ['loginMode','signupMode','email','password','accountSubmit','guestAccount','logoutAccount']){
   el(id).disabled=accountBusy||joining;
 }
 el('confirmPassword').disabled=accountMode!=='signup'||accountBusy;
 el('playDemo').disabled=accountBusy||joining;
 el('refreshRooms').disabled=Boolean(roomsRequest)||joining||accountBusy;
 const selected=serverRooms.find(r=>r.id===selectedRoom);
 el('joinOnline').disabled=!session||accountBusy||joining||Boolean(selected&&selected.count>=selected.capacity);
 el('joinOnline').textContent=joining?'กำลังเข้าชุมชน…':joinLabel();
 for(const button of el('serverList').querySelectorAll('button')){
   const room=serverRooms.find(r=>r.id===button.dataset.room);
   button.disabled=joining||accountBusy||Boolean(room&&room.count>=room.capacity);
 }
}

function setAccountMode(mode){
 accountMode=mode;
 const signup=mode==='signup';
 el('loginMode').setAttribute('aria-pressed',String(!signup));
 el('signupMode').setAttribute('aria-pressed',String(signup));
 el('accountTitle').textContent=signup?'สมัครสมาชิก':'เข้าสู่ระบบ';
 el('accountIntro').textContent=signup?'ใช้อีเมลเป็นไอดี และตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร':'ใช้อีเมลเป็นไอดีเพื่อเข้าเล่นต่อจากเซฟเดิม';
 el('accountSubmit').textContent=signup?'สร้างบัญชี':'เข้าสู่ระบบ';
 el('password').autocomplete=signup?'new-password':'current-password';
 el('password').minLength=signup?6:0;
 el('password').value=el('confirmPassword').value='';
 el('confirmField').hidden=!signup;
 el('confirmPassword').required=signup;
 lobbyError();
 updateEntryControls();
}

function renderRooms(){
 const list=el('serverList');
 const focused=list.contains(document.activeElement)?document.activeElement.dataset.room:null;
 const selected=serverRooms.find(r=>r.id===selectedRoom);
 const available=serverRooms.find(r=>r.count<r.capacity);
 if(selected&&selected.count>=selected.capacity&&available)selectedRoom=available.id;
 list.replaceChildren();
 for(const id of ROOM_IDS){
   const room=serverRooms.find(r=>r.id===id);
   const button=document.createElement('button');
   button.type='button';
   button.dataset.room=id;
   button.className='server'+(selectedRoom===id?' selected':'');
   button.setAttribute('aria-pressed',String(selectedRoom===id));
   const icon=document.createElement('span');
   icon.className='sicon';icon.textContent=['🏡','🏠','🏘️'][ROOM_IDS.indexOf(id)];icon.setAttribute('aria-hidden','true');
   const body=document.createElement('span');body.className='sbody';
   const title=document.createElement('strong');title.textContent='ชุมชน '+id;
   const hint=document.createElement('small');
   hint.textContent=!room?'รอตรวจจำนวนผู้เล่น':room.count>=room.capacity?'เซิร์ฟเวอร์เต็ม':'ว่าง '+(room.capacity-room.count)+' ที่';
   body.append(title,hint);
   const capacity=document.createElement('span');capacity.className='entry-capacity';
   const count=document.createElement('span');count.className='count';
   count.textContent=room?room.count+'/'+room.capacity:'—/'+MAX_PLAYERS;
   const slots=document.createElement('span');slots.className='entry-room-slots';slots.setAttribute('aria-hidden','true');
   for(let i=0;i<(room?.capacity??MAX_PLAYERS);i++){
     const tile=document.createElement('i');
     if(i<(room?.count??0))tile.className='occupied';
     slots.append(tile);
   }
   capacity.append(count,slots);
   button.append(icon,body,capacity);
   button.onclick=()=>{selectedRoom=id;lobbyError();renderRooms()};
   list.append(button);
 }
 updateEntryControls();
 if(focused)list.querySelector('button[data-room="'+focused+'"]:not(:disabled)')?.focus();
}

function showEntry(user, focus=false){
 session=user;
 roomsGeneration++;
 roomsRequest=null;
 serverRooms=[];
 lobbyError();
 el('roomsStatus').textContent='';
 el('accountScreen').hidden=Boolean(user);
 el('serverScreen').hidden=!user;
 el('accountIdentity').textContent=user?(user.isAnonymous?'บัญชีชั่วคราว':user.email||'บัญชีสมาชิก'):'';
 renderRooms();
 if(user){
   if(focus)el('serverTitle').focus();
   if(!active)refreshRooms();
 }else if(focus)el('email').focus();
}

async function firebaseClient(){
 if(!onlineReady)throw Error('Firebase is not configured');
 firebasePromise??=(async()=>{
   const {FirebaseGame}=await import('./firebase-game.js?v=effects-1');
   const adapter=new FirebaseGame(cfg.firebase,onNetwork,cfg.onlineMarket===true,cfg.sheetsMarketUrl);
   await adapter.ready();
   return adapter;
 })().catch(error=>{firebasePromise=null;throw error});
 fbGame=await firebasePromise;
 return fbGame;
}

function refreshRooms(){
 if(!session||active||joining||roomsRequest)return roomsRequest;
 const generation=roomsGeneration;
 const update=async()=>{
   try{
     const rooms=await fbGame.rooms();
     if(generation!==roomsGeneration)return;
     serverRooms=rooms;
     el('roomsStatus').textContent=rooms.length&&rooms.every(r=>r.count>=r.capacity)?'ทุกชุมชนเต็ม กรุณาลองใหม่อีกครั้ง':'';
   }catch{
     if(generation!==roomsGeneration)return;
     el('roomsStatus').textContent='ตรวจจำนวนผู้เล่นไม่ได้ กดรีเฟรชเพื่อลองอีกครั้ง';
   }finally{
     if(generation===roomsGeneration){roomsRequest=null;renderRooms()}
   }
 };
 if(!serverRooms.length)el('roomsStatus').textContent='กำลังตรวจจำนวนผู้เล่น…';
 roomsRequest=update();
 updateEntryControls();
 return roomsRequest;
}

async function authUser(mode){
 if(accountBusy||active)return;
 const email=el('email').value.trim(), password=el('password').value;
 if(mode==='signup'&&password!==el('confirmPassword').value){
   lobbyError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
   el('confirmPassword').focus();
   return;
 }
 accountBusy=true;
 lobbyError();
 updateEntryControls();
 el('accountSubmit').textContent=mode==='guest'?'กำลังเชื่อมต่อ…':'กำลังตรวจสอบบัญชี…';
 try{
   const adapter=await firebaseClient();
   const user=await adapter.login(mode,email,password);
   el('password').value=el('confirmPassword').value='';
   showEntry(user,true);
 }catch(error){
   lobbyError(onlineReady?authMessage(error):'ระบบบัญชีออนไลน์ยังไม่พร้อม คุณสามารถทดลองเล่นคนเดียวได้');
 }finally{
   accountBusy=false;
   el('accountSubmit').textContent=accountMode==='signup'?'สร้างบัญชี':'เข้าสู่ระบบ';
   updateEntryControls();
 }
}

el('loginMode').onclick=()=>setAccountMode('login');
el('signupMode').onclick=()=>setAccountMode('signup');
el('accountForm').onsubmit=e=>{e.preventDefault();authUser(accountMode)};
el('guestAccount').onclick=()=>authUser('guest');
el('refreshRooms').onclick=refreshRooms;
el('logoutAccount').onclick=async()=>{
 if(accountBusy||joining)return;
 accountBusy=true;
 lobbyError();
 updateEntryControls();
 try{
   await fbGame.logout();
   el('accountForm').reset();
   setAccountMode('login');
   showEntry(null,true);
 }catch(error){lobbyError(authMessage(error))}
 finally{accountBusy=false;updateEntryControls();if(!session)el('email').focus()}
};

async function joinOnline(){
 if(!session||joining||accountBusy||active)return;
 joining=true;
 lobbyError();
 updateEntryControls();
 try{
   const adapter=await firebaseClient();
   if(!adapter.currentUser()){
     showEntry(null,true);
     lobbyError('กรุณาเข้าสู่ระบบอีกครั้ง');
     return;
   }
   remote.clear();
   const joined=await adapter.join(selectedRoom,el('nickname').value.trim().slice(0,18)||'ผู้เล่น');
   online=true;room=joined.room;slot=joined.slot;myId=joined.id;ownProfile=sanitizeState(joined.profile);
   if(hasChosenAppearance())ownProfile.appearance=getChosenAppearance();else useSavedAppearance(ownProfile.appearance);
   onJoined();
   if(hasChosenAppearance())send({type:'appearance',appearance:ownProfile.appearance});
   notice('โหลดเซฟออนไลน์แล้ว');
 }catch(error){online=false;lobbyError('เข้าชุมชนไม่สำเร็จ: '+(error.message||String(error)))}
 finally{joining=false;updateEntryControls();if(!active)refreshRooms()}
}
el('joinOnline').onclick=joinOnline;
function demoData(){try{const d=JSON.parse(localStorage.getItem(demoKey)||'null');if(d&&d.profile)return sanitizeState(d.profile)}catch{}return starter(el('nickname').value)}
function demoSave(profile=ownProfile){
 if(online)return false;
 try{localStorage.setItem(demoKey,JSON.stringify({profile,savedAt:Date.now()}));return true}
 catch{return false}
}
function applyAvatarAppearance(look){
  const appearance=getChosenAppearance();
  if(active){
    ownProfile.appearance=appearance;
    resetAvatarMotion();
    if(online)send({type:'appearance',appearance});else demoSave();
  }
  notice(active?'🎨 ใช้โมเดล V4 และบันทึกตัวละครแล้ว':'🎨 เลือกรูปลักษณ์ตัวละครแล้ว');
}
el('playDemo').onclick=()=>{if(accountBusy||joining||active)return;online=false;fbGame?.leave();room=selectedRoom;myId='demo';slot=0;ownProfile=demoData();if(hasChosenAppearance())ownProfile.appearance=getChosenAppearance();else useSavedAppearance(ownProfile.appearance);ownProfile.displayName=(ownProfile.displayName==='ผู้เล่น'?el('nickname').value.trim().slice(0,18)||'ผู้เล่น':ownProfile.displayName);demoSave();remote.clear();onJoined();notice(localNotice)};
function onJoined(){
 el('microphone').hidden=!online;
 const l=lots[slot];
 scene='outside';renderedCamera=null;sentMovement=null;resetAvatarMotion();
 footprints.reset();
 visiting=null;gardenerVisuals.clear();
 me={x:l.x+247,y:slot<4?l.y+l.h-45:l.y+50,face:Math.PI/2,walking:false,text:'',until:0,pose:'stand'};
 setRiding(false);
 active=true;nextNeedsAt=Date.now()+NEEDS_STEP_MS;needsPending=false;tiredSince=hungrySince=null;
 gardenerPending=false;gardenerRetryAt=0;gardenerResume=true;receiptSeen=0;selectedTarget=null;pendingGardenAction=null;
 el('lobby').hidden=true;
 for(const id of ['hud','joystick','chatPanel','bagBtn','socialButtons','mapPanel'])el(id).hidden=false;
 if(online)socialUI.connect(fbGame.social,myId);
 el('chatLog').replaceChildren();
 el('chatInput').value='';
 setChatOpen(true);
 hud();if(!online)demoSave();
 showGardenerReceipt();
}
function trackRemote(player,now){
 if(!Number.isFinite(player.x)||!Number.isFinite(player.y))return;
 const previous=remote.get(player.id);
 if(active&&player.text&&player.until>Date.now()&&(player.until!==previous?.until||player.text!==previous?.text))
   appendChat(player.name||'เพื่อนบ้าน',player.text);
 if(player.scene==='outside')player={...player,...estateFromWire(player.x,player.y)};
 const motion=updateRemoteMotion(previous?.motion,player,now);
 const hungrySince=player.hungry===true?(previous?.hungrySince??now):null;
 remote.set(player.id,{...player,motion,hungrySince});
}
function onNetwork(m){if(!active&&!['rooms','players','social'].includes(m.type))return;
 if(m.type==='social'&&active&&online){socialUI.connect(fbGame.social,myId);return}
 if(m.type==='rooms'){serverRooms=m.rooms;renderRooms()}
 else if(m.type==='players'){
   const players=m.players||[],ids=new Set(players.map(p=>p.id)),now=performance.now();
   for(const id of remote.keys())if(!ids.has(id))remote.delete(id);
   for(const p of players)trackRemote(p,now);
   if(active&&online)voice.sync(players);
   if(visiting&&!remote.has(visiting.id)){interact({type:'exit'});notice('เจ้าของบ้านออกจากชุมชนแล้ว')}
   if(visiting){
     const host=remote.get(visiting.id),level=houseExpansionLevel(host.home);
     visiting.expansion=level;
     visiting.furniture=sanitizeFurniture(host.home?.furniture,level);
     visiting.architecture=sanitizeArchitecture(host.home?.architecture,homeGrid(level));
   }
   hud()
   socialUI.refresh();
 }
 else if(m.type==='disconnected'){leaveGame('Firebase ขาดการเชื่อมต่อ กรุณาเข้าห้องใหม่')}
 else if(m.type==='player'){trackRemote(m.player,performance.now());hud()}
 else if(m.type==='left'){remote.delete(m.id);hud()}
 else if(m.type==='moved'){const p=remote.get(m.id);if(p)trackRemote({...p,x:m.x,y:m.y,scene:m.scene},performance.now())}
 else if(m.type==='said'){
   const p=remote.get(m.id);
   if(p&&(p.text!==m.text||p.until!==m.until)){
     Object.assign(p,{text:m.text,until:m.until});
     appendChat(p.name||'เพื่อนบ้าน',m.text);
   }
 }
 else if(m.type==='profile'){
   const previous=ownProfile;
   ownProfile=sanitizeState(m.profile);useSavedAppearance(ownProfile.appearance);hud();
   const gardenDialogOpen=el('dialog').open&&['garden','box','plot','shop'].includes(dialogType);
   const gardenerChangedDialog={
     inventory:()=>true,
     garden:()=>true,
     box:()=>JSON.stringify(previous.home.gardenBox)!==JSON.stringify(ownProfile.home.gardenBox),
     plot:()=>JSON.stringify(previous.home.plots[dialogPlot])!==JSON.stringify(ownProfile.home.plots[dialogPlot])
   }[dialogType];
   if(!m.background||m.background==='gardenerStep'&&el('dialog').open&&gardenerChangedDialog?.()){
     const status=el('dialogStatus').textContent;
     drawOpenDialog();
     if(m.background&&gardenDialogOpen)el('dialogStatus').textContent=status;
   }
   if(m.notice)notice(m.notice,Boolean(m.background&&gardenDialogOpen));
   showGardenerReceipt();
 }
 else if(m.type==='homeUpdate'){const p=remote.get(m.id);if(p)p.home=m.home}
 else if(m.type==='notice'){notice(m.message,m.chatOnly)}
 else if(m.type==='kicked'){leaveGame(m.message)}
 else if(m.type==='error'){notice(m.message)}
}
function send(m){if(online&&fbGame)return Promise.resolve(fbGame.send(m)).catch(e=>notice('ส่งข้อมูลไม่สำเร็จ: '+e.message))}
function action(a){if(['plant','water','harvest'].includes(a?.type)){
  const motion={kind:a.type,started:performance.now(),duration:950};me.action=motion;
  setTimeout(()=>{if(me.action===motion)me.action=null},960);
 }
 if(online)return send({type:'action',action:a});
 const next=sanitizeState(ownProfile);
 const result=applyAction(next,a);
 if(result.ok){
   if(!demoSave(next)){notice('บันทึกในเบราว์เซอร์ไม่สำเร็จ');return {ok:false}}
   ownProfile=next;hud();
   if(a.type!=='needsTick'&&(!['gardenerStep','gardenerResume'].includes(a.type)||['inventory','garden'].includes(dialogType)))drawOpenDialog();
   showGardenerReceipt();
 }
 if(result.message)notice(result.message)
 return result;
}
async function leaveGame(message=''){
 if(!active)return;
 pendingGardenAction=null;
 closeBuild(false);
 voice.close();
 socialUI.disconnect();
 accountBusy=true;
 active=false;
 online=false;
 const leaving=fbGame?.leave();
 remote.clear();
 resetAvatarMotion();
 el('lobby').hidden=false;
 for(const id of ['hud','joystick','chatPanel','nearbyAction','bagBtn','socialButtons','mapPanel'])el(id).hidden=true;
 dialogClose();
 keys.clear();
 joyReset();
 lobbyError(message);
 updateEntryControls();
 try{await leaving}
 finally{
   accountBusy=false;
   updateEntryControls();
   if(session){el('serverTitle').focus();refreshRooms()}
   else el('playDemo').focus();
 }
}
el('menuBtn').onclick=()=>{
 dialogType=null;
 showDialog('ตั้งค่าเกม',d=>{
   const soundButton=addButton(d,sound?'🔊 เสียง: เปิด':'🔇 เสียง: ปิด',async()=>{
     await toggleSound();
     soundButton.textContent=sound?'🔊 เสียง: เปิด':'🔇 เสียง: ปิด';
     soundButton.setAttribute('aria-pressed',String(sound));
   });
   soundButton.setAttribute('aria-pressed',String(sound));
   addButton(d,'🎨 แต่งตัวละคร',()=>showDialog('แต่งตัวละคร',panel=>buildAppearanceEditor(panel,applyAvatarAppearance)));
   addButton(d,session?'กลับหน้าเลือกเซิร์ฟเวอร์':'กลับหน้าเข้าเกม',leaveGame);
   addText(d,'เดินด้วย WASD หรือลูกศร · แตะไอคอนใกล้ตัวหรือกด E · กด / เพื่อพิมพ์แชท');
   addText(d,'นั่งเก้าอี้เพิ่มความสุข นอนเตียงเพิ่มพลังงาน และกินมะเขือเทศจากกระเป๋าเพิ่มความอิ่ม');
 });
};
el('bagBtn').onclick=inventory;
function addText(parent,t,cls='muted'){const p=document.createElement('p');p.textContent=t;p.className=cls;parent.append(p);return p}
function addButton(parent,text,fn,disabled=false){
 const b=document.createElement('button');b.type='button';b.className='dialog-action';b.textContent=text;b.disabled=disabled;
 b.onclick=async()=>{b.disabled=true;try{await fn()}finally{b.disabled=false}};
 parent.append(b);return b
}
function showDialog(title,draw){
 clearTimeout(plotReadyTimer);
 el('dialogTitle').textContent=title;el('dialogStatus').textContent='';
 el('dialogContent').replaceChildren();draw(el('dialogContent'));if(!el('dialog').open)el('dialog').showModal()
}
function dialogClose(){el('dialog').close?.()}
el('dialogClose').onclick=dialogClose;el('dialog').addEventListener('click',e=>{if(e.target===el('dialog'))dialogClose()});
el('dialog').addEventListener('close',()=>clearTimeout(plotReadyTimer));
let dialogType=null,dialogPlot=-1,buildDraft=null,buildSelection=null;
function drawOpenDialog(){if(!el('dialog').open)return;if(dialogType==='inventory')inventory();else if(dialogType==='plot')openPlot(dialogPlot);else if(dialogType==='house')homeDialog();else if(dialogType==='shop')shopDialog();else if(dialogType==='garden')gardenDialog();else if(dialogType==='box')gardenBoxDialog()}
function avatarIcon(appearance,fallback='👤',label='ผู้เล่น'){
 const icon=document.createElement('span');icon.className='player-avatar';icon.setAttribute('aria-hidden','true');
 if(!appearance){icon.textContent=fallback;return icon}
 const mini=document.createElement('canvas');mini.width=64;mini.height=64;
 const painter=mini.getContext('2d');
 painter.translate(-14,16);painter.scale(1.45,1.45);
 renderClassicAvatar(painter,{x:32,y:39,scene:'preview',face:Math.PI/2,name:label,pose:'stand',appearance},0);
 icon.append(mini);return icon;
}
const socialUI=installSocialUI({
 el,showDialog,addButton,addText,avatarIcon,notice,
 currentPlayers:()=>[...remote.values()].map(p=>({...p,room})),open:()=>{dialogType='social'},isOnline:()=>online
});

function furnitureLabel(type){const item=FURNITURE_TYPES[type];return item?item.emoji+' '+item.label:type}
function cloneFurniture(list){return JSON.parse(JSON.stringify(Array.isArray(list)?list:[]))}
function furnitureInventory(profile=ownProfile){return Object.fromEntries(Object.keys(FURNITURE_TYPES).map(type=>[type,Number(profile.inventory?.furniture?.[type])||0]))}
function itemCell(grid,label,icon,count,type){
 const tile=document.createElement('div');
 tile.className='inventory-cell';
 if(count){
   tile.title=label+' × '+count;tile.setAttribute('aria-label',tile.title);tile.setAttribute('role','img');
   if(type){
     const def=FURNITURE_TYPES[type], mini=document.createElement('canvas');
     mini.width=96;mini.height=80;
     const painter=mini.getContext('2d'), scale=66/Math.max(def.width*48,def.height*48);
     painter.translate(48-def.width*24*scale,45-def.height*24*scale);
     painter.scale(scale,scale);painter.translate(-HOME_GRID.x,-HOME_GRID.y);
     drawFurniture(painter,{type,col:0,row:0,rotation:0});tile.append(mini);
   }else tile.append(icon);
   const qty=document.createElement('small');qty.textContent=count;tile.append(qty);
 }else tile.setAttribute('aria-hidden','true');
 grid.append(tile);
}
function inventoryGrid(parent){
 const grid=document.createElement('div');grid.className='inventory-cells';parent.append(grid);return grid;
}
function finishInventoryGrid(grid){while(grid.childElementCount<Math.max(18,Math.ceil(grid.childElementCount/6)*6))itemCell(grid,'','',0)}
function inventory(){dialogType='inventory';showDialog('🎒 กระเป๋าของฉัน',d=>{
 addText(d,'เงิน '+ownProfile.money+' บาท · เลเวล '+ownProfile.level+' · EXP '+ownProfile.xp+'/'+ownProfile.level*30);
 const grid=inventoryGrid(d);
 for(const [key,icon,label] of [['hoe','⛏️','จอบ'],['watering_can','💦','บัวรดน้ำ']])itemCell(grid,label,icon,ownProfile.inventory[key]);
 for(const [crop,def] of Object.entries(CROPS))itemCell(grid,'เมล็ด'+def.name,'🌱',ownProfile.inventory[seedKey(crop)]);
 for(const [crop,key,count] of produceEntries(ownProfile.inventory))itemCell(grid,CROPS[crop].name+' เกรด '+gradeOf(key).name,CROPS[crop].icon,count);
 for(const [type,def] of Object.entries(FURNITURE_TYPES))if(ownProfile.inventory.furniture[type])itemCell(grid,def.label,def.emoji,ownProfile.inventory.furniture[type],type);
 finishInventoryGrid(grid);
 if(ownProfile.inventory.tomato)addButton(d,'🍅 กินมะเขือเทศ 1 ผล',()=>action({type:'eat'}));
 addButton(d,'🏡 ดูบ้านและร้านเฟอร์นิเจอร์',()=>homeDialog());
})}
const buildPanel = el('buildMode');
const buildFloor = el('buildFloor');
const buildTiles = [];
const stockButtons = new Map();
const buildTool=el('buildTool'),buildEdge=el('buildEdge'),buildFinish=el('buildFinish');
let hoverTile, savingBuild = false;
let focusedTile = 0;

function populateBuildGrid(){
 HOME_GRID=homeGrid(houseExpansionLevel(ownProfile.home));
 buildFloor.replaceChildren();buildTiles.length=0;focusedTile=0;
for (let row = 0; row < HOME_GRID.rows; row++) {
  for (let col = 0; col < HOME_GRID.cols; col++) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'build-tile';
    tile.tabIndex = -1;
    const index = buildTiles.length;
    tile.onfocus = () => {
      buildTiles[focusedTile].tabIndex = -1;
      focusedTile = index;
      tile.tabIndex = 0;
      hoverTile = {col, row};
    };
    tile.onpointerenter = () => { hoverTile = {col, row}; };
    tile.onclick = () => buildTileClick(col, row);
    buildTiles.push(tile);
    buildFloor.append(tile);
  }
}
buildFloor.style.gridTemplateColumns = 'repeat(' + HOME_GRID.cols + ', minmax(0,1fr))';
buildFloor.style.gridTemplateRows = 'repeat(' + HOME_GRID.rows + ', minmax(0,1fr))';
}

buildFloor.onpointerleave = () => { hoverTile = null; };
buildFloor.onkeydown = e => {
  const steps = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -HOME_GRID.cols, ArrowDown: HOME_GRID.cols};
  if (!Object.hasOwn(steps, e.key)) return;
  e.preventDefault();
  const next = focusedTile + steps[e.key];
  if (e.key === 'ArrowLeft' && focusedTile % HOME_GRID.cols === 0) return;
  if (e.key === 'ArrowRight' && focusedTile % HOME_GRID.cols === HOME_GRID.cols - 1) return;
  buildTiles[next]?.focus();
};
for (const type of Object.keys(FURNITURE_TYPES)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.onclick = () => {
    buildTool.value='furniture';
    buildSelection = {kind: 'new', type, rotation: 0};
    updateBuildControls();
  };
  stockButtons.set(type, button);
  el('buildStock').append(button);
}
el('buildRotate').onclick = rotateSelected;
el('buildStore').onclick = removeSelected;
el('buildCancel').onclick = cancelBuild;
el('buildSave').onclick = saveBuild;
buildTool.onchange=()=>{buildSelection=null;updateBuildControls()};
new ResizeObserver(() => { buildCamera = null; }).observe(el('buildDock'));

function buildHome() {
  if(visiting){notice('ออกจากบ้านเพื่อนก่อนเข้าโหมดสร้างบ้าน');return}
  if (!active || buildDraft) return;
  populateBuildGrid();
  buildTool.value='furniture';
  buildDraft = {furniture: cloneFurniture(ownProfile.home.furniture), inventory: furnitureInventory(),
    architecture:sanitizeArchitecture(ownProfile.home.architecture,HOME_GRID)};
  dialogClose();
  dialogType = null;
  keys.clear();
  joyReset();
  buildPanel.hidden = false;
  document.body.classList.add('building');
  updateBuildControls();
  el('buildCancel').focus();
}
function closeBuild(restoreFocus = true) {
  if (!buildDraft) return;
  buildDraft = buildSelection = buildCamera = hoverTile = null;
  savingBuild = false;
  buildPanel.hidden = true;
  document.body.classList.remove('building');
  keys.clear();
  if (restoreFocus) el('bagBtn').focus({preventScroll: true});
}
function selectedFurniture() {
  if (buildSelection?.kind !== 'existing') return null;
  return buildDraft.furniture.find(item => item.id === buildSelection.id) || null;
}
function furnitureAt(col, row) {
  return buildDraft.furniture.find(item => {
    const {w, h} = furnitureFootprint(item);
    return col >= item.col && col < item.col + w && row >= item.row && row < item.row + h;
  });
}
function placementAt(col, row) {
  const current = selectedFurniture();
  if (current) return {...current, col, row};
  if (buildSelection?.kind !== 'new') return null;
  const {type, rotation} = buildSelection;
  return {id: '', type, rotation, col, row};
}
function buildTileClick(col, row) {
  if (savingBuild) return;
  if (buildTool.value!=='furniture'){editArchitecture(col,row);return}
  const item = furnitureAt(col, row);
  if (item && buildSelection?.kind !== 'new') {
    buildSelection = {kind: 'existing', id: item.id};
    updateBuildControls();
    return;
  }
  const candidate = placementAt(col, row);
  if (!candidate) {
    notice('เลือกของจากกระเป๋า หรือแตะเฟอร์นิเจอร์ที่วางแล้ว');
    return;
  }
  if (!isValidFurniturePlacement(candidate, buildDraft.furniture, candidate.id,houseExpansionLevel(ownProfile.home))) {
    notice('วางตรงนี้ไม่ได้ เพราะทับของเดิมหรือเลยขอบพื้น');
    return;
  }
  const index = buildDraft.furniture.findIndex(p => p.id === candidate.id);
  if (index >= 0) {
    buildDraft.furniture[index] = candidate;
  } else {
    if (buildDraft.inventory[candidate.type] < 1) return;
    candidate.id = 'f-' + crypto.randomUUID();
    buildDraft.furniture.push(candidate);
    buildDraft.inventory[candidate.type]--;
    buildSelection = {kind: 'existing', id: candidate.id};
  }
  updateBuildControls();
}
function editArchitecture(col,row){
  const kind=buildTool.value,finish=Number(buildFinish.value);
  const layout=buildDraft.architecture;
  if(kind==='tile'||kind==='eraseTile'){
    layout.tiles=layout.tiles.filter(tile=>tile.col!==col||tile.row!==row);
    if(kind==='tile')layout.tiles.push({col,row,finish});
    return;
  }
  let edge=buildEdge.value;
  if(edge==='north'&&row>0){row--;edge='south'}
  if(edge==='west'&&col>0){col--;edge='east'}
  const part={col,row,edge,kind,finish,open:false};
  const key=partitionKey(part);
  if(kind!=='eraseWall'&&!sanitizeArchitecture({walls:[part]},HOME_GRID).walls.length){
    notice(kind==='window'?'วางหน้าต่างที่ขอบนอกของห้อง':'วางประตูกั้นห้องที่ขอบระหว่างช่อง');
    return;
  }
  layout.walls=layout.walls.filter(wall=>partitionKey(wall)!==key);
  if(kind!=='eraseWall')layout.walls.push(part);
}
function rotateSelected() {
  const current = selectedFurniture();
  if (!current) {
    if (buildSelection?.kind === 'new') {
      buildSelection.rotation = (buildSelection.rotation + 90) % 360;
      updateBuildControls();
    }
    return;
  }
  const candidate = {...current, rotation: (current.rotation + 90) % 360};
  if (!isValidFurniturePlacement(candidate, buildDraft.furniture, current.id,houseExpansionLevel(ownProfile.home))) {
    notice('หมุนตรงนี้ไม่ได้ ลองย้ายไปช่องที่มีพื้นที่ว่าง');
    return;
  }
  buildDraft.furniture[buildDraft.furniture.indexOf(current)] = candidate;
  updateBuildControls();
}
function removeSelected() {
  const current = selectedFurniture();
  if (!current) return;
  buildDraft.furniture.splice(buildDraft.furniture.indexOf(current), 1);
  buildDraft.inventory[current.type]++;
  buildSelection = null;
  updateBuildControls();
}
async function saveBuild() {
  if (!buildDraft || savingBuild) return;
  const draft = buildDraft;
  const payload = {type: 'saveHome', furniture: draft.furniture, inventoryFurniture: draft.inventory, architecture:draft.architecture};
  savingBuild = true;
  updateBuildControls();
  let result;
  if (online) {
    result = await send({type: 'action', action: payload});
  } else {
    const nextProfile = sanitizeState(ownProfile);
    result = applyAction(nextProfile, payload);
    if (result.ok && demoSave(nextProfile)) ownProfile = nextProfile;
    else if (result.ok) result = {ok: false, message: 'บันทึกในเบราว์เซอร์ไม่สำเร็จ ลองอีกครั้ง'};
  }
  if (buildDraft !== draft) return;
  if (!result?.ok) {
    savingBuild = false;
    updateBuildControls();
    notice(result?.message || 'บันทึกการจัดบ้านไม่สำเร็จ ลองอีกครั้ง');
    el('buildSave').focus();
    return;
  }
  closeBuild();
  hud();
  notice(result.message);
}
function cancelBuild() {
  if (!buildDraft || savingBuild) return;
  closeBuild();
  notice('ยกเลิกการจัดบ้านแล้ว');
}
function updateBuildControls() {
  const selected = selectedFurniture() || buildSelection;
  const furnitureMode=buildTool.value==='furniture';
  el('buildStock').hidden=!furnitureMode;
  el('buildEdgeLabel').hidden=furnitureMode||['tile','eraseTile'].includes(buildTool.value);
  el('buildFinishLabel').hidden=furnitureMode||['eraseTile','eraseWall'].includes(buildTool.value);
  for(const input of [buildTool,buildEdge,buildFinish])input.disabled=savingBuild;
  buildCamera=null;
  for (const [type, button] of stockButtons) {
    button.hidden=buildDraft.inventory[type]===0;
    button.textContent = FURNITURE_TYPES[type].label + ' × ' + buildDraft.inventory[type];
    button.disabled = savingBuild || buildDraft.inventory[type] === 0;
    button.setAttribute('aria-pressed', String(buildSelection?.kind === 'new' && buildSelection.type === type));
  }
  el('buildRotate').disabled = savingBuild || !selected;
  el('buildStore').disabled = savingBuild || !selectedFurniture();
  el('buildSave').disabled = el('buildCancel').disabled = savingBuild;
  buildFloor.inert = savingBuild;
  for (const [i, tile] of buildTiles.entries()) {
    const col = i % HOME_GRID.cols, row = Math.floor(i / HOME_GRID.cols);
    const item = furnitureAt(col, row);
    const label = 'ช่อง ' + (col + 1) + ',' + (row + 1);
    tile.setAttribute('aria-label', item ? label + ' ' + FURNITURE_TYPES[item.type].label : label + ' ว่าง');
  }
  buildTiles[focusedTile].tabIndex = 0;
  notice(savingBuild ? 'กำลังบันทึก…' : !furnitureMode?'เลือกสีหรือขอบ แล้วแตะช่องบนพื้น': selected
    ? FURNITURE_TYPES[selected.type].label + ' · ' + selected.rotation + '° · แตะช่องว่างเพื่อจัดวาง'
    : 'เลือกของจากกระเป๋า หรือแตะเฟอร์นิเจอร์บนพื้นห้อง');
}
function roomBuildCamera() {
  if (buildCamera) return buildCamera;
  const top = el('buildTitle').getBoundingClientRect().bottom + 4;
  const bottom = el('buildDock').getBoundingClientRect().top - 6;
  const centerY = (top + bottom) / 2;
  const room=interior();
  const zoom=Math.min((w-12)/room.w,Math.max(1,bottom-top)/room.h,1.6);
  buildCamera = {x:room.w/2,y:room.h/2,zoom,centerY};
  Object.assign(buildFloor.style, {
    left: (w / 2 + (HOME_GRID.x - buildCamera.x) * zoom) + 'px',
    top: (centerY + (HOME_GRID.y - buildCamera.y) * zoom) + 'px',
    width: HOME_GRID.cols * HOME_GRID.tile * zoom + 'px',
    height: HOME_GRID.rows * HOME_GRID.tile * zoom + 'px'
  });
  return buildCamera;
}

async function runGardenAction(request){
 if(pendingGardenAction)return;
 const pending={dialog:dialogType,plot:dialogPlot};
 pendingGardenAction=pending;
 drawOpenDialog();
 el('dialogStatus').textContent='กำลังบันทึก…';
 let result;
 try{result=await action(request)}
 finally{
   if(pendingGardenAction===pending){
     pendingGardenAction=null;
     const sameDialog=el('dialog').open&&dialogType===pending.dialog&&(dialogType!=='plot'||dialogPlot===pending.plot);
     if(sameDialog){
       const status=result?.message||el('dialogStatus').textContent;
       drawOpenDialog();
       el('dialogStatus').textContent=status;
     }
   }
 }
}

function openPlot(i){if(i<0||i>=ownProfile.home.plots.length)return;dialogType='plot';dialogPlot=i;const p=ownProfile.home.plots[i],def=CROPS[p.crop];const remaining=p.plantedAt+(def?.grow||0)-Date.now();
 showDialog('🌱 แปลงสวนที่ '+(i+1),d=>{
 addText(d,def?def.icon+' '+def.name+(p.watered?' · รดน้ำแล้ว':' · ต้องรดน้ำ'):'แปลงว่าง');
 if(!p.crop)for(const [crop,type] of Object.entries(CROPS)){
   const count=ownProfile.inventory[seedKey(crop)];
   addButton(d,type.icon+' ปลูก'+type.name+' · มี '+count,()=>runGardenAction({type:'plant',plot:i,crop}),!count||Boolean(pendingGardenAction));
 }
 else if(!p.watered)addButton(d,'💦 รดน้ำ',()=>runGardenAction({type:'water',plot:i}),Boolean(pendingGardenAction));
 else {
   const harvest=addButton(d,def.icon+' เก็บเกี่ยว +3 ผล / +10 EXP',()=>runGardenAction({type:'harvest',plot:i}),remaining>0||Boolean(pendingGardenAction));
   if(remaining>0){
     const wait=addText(d,`รอเก็บเกี่ยวประมาณ ${Math.ceil(remaining/1000)} วินาที`);
     plotReadyTimer=setTimeout(()=>{harvest.disabled=Boolean(pendingGardenAction);wait.remove()},remaining);
   }
 }
 });
}

function homeDialog(){dialogType='house';showDialog('🏡 บ้านของฉัน',d=>{
 const placed=ownProfile.home.furniture;const stock=furnitureInventory();addText(d,'วางแล้ว '+placed.length+' ชิ้น · ในกระเป๋า '+Object.values(stock).reduce((total,n)=>total+n,0)+' ชิ้น');
 addButton(d,'🏗️ เข้าโหมดสร้างบ้าน / จัดวาง',buildHome);
 const list=document.createElement('div');list.className='catalog-list furniture-cards';d.append(list);
 const filter=document.createElement('input');filter.type='search';filter.placeholder='ค้นหาเฟอร์นิเจอร์';filter.setAttribute('aria-label','ค้นหาเฟอร์นิเจอร์');d.insertBefore(filter,list);
 filter.value=furnitureSearch;
 const render=()=>{
   list.replaceChildren();
   for(const [type,def] of Object.entries(FURNITURE_TYPES))if(def.label.includes(furnitureSearch)){
     const button=addButton(list,'',()=>action({type:'buy',item:type}),ownProfile.money<def.price);
     const icon=document.createElement('span');icon.textContent=def.emoji;
     button.append(icon,document.createTextNode(def.label),document.createElement('br'),document.createTextNode(def.price+' บาท'));
   }
   if(!list.childElementCount)addText(list,'ไม่พบเฟอร์นิเจอร์');
 };
 filter.oninput=()=>{furnitureSearch=filter.value.trim();render()};
 render();
})}
let furnitureSearch='';
function gradeLabel(parent,key){
 const grade=gradeOf(key);
 const label=document.createElement('span');
 label.className='produce-grade '+grade.name.toLowerCase();
 label.style.color=grade.color;
 label.textContent='เกรด '+grade.name+' · '+Number(key)/100+'×';
 parent.append(label);
}
function appendProduce(parent, atMarket=false){
 const list=document.createElement('div');
 list.className='produce-list';
 for(const [crop,key,count] of produceEntries(ownProfile.inventory)){
   const row=document.createElement('div');
   row.className='produce-row';
   row.append(CROPS[crop].icon+' '+CROPS[crop].name+' ');gradeLabel(row,key);
   row.append('× '+count);
   if(atMarket){
     const total=marketPrice(key,Date.now(),crop)*count;
     addButton(row,'ขาย '+total.toLocaleString('th-TH')+' บาท',()=>runGardenAction({type:'sell',grade:key,crop}),Boolean(pendingGardenAction));
   }
   list.append(row);
 }
 if(list.childElementCount)parent.append(list);
}
function gardenDialog(){
 dialogType='garden';
 showDialog('จุดจ้างคนสวน',d=>{
   const workers=workersOf(ownProfile.home);
   addText(d,'คนสวน '+workers.length+'/'+MAX_GARDENERS+' คน');
   workers.forEach((worker,i)=>{addText(d,'').dataset.worker=i});
   updateGardenerTime(Date.now());
   for(const [plan,{label,cost}] of Object.entries(GARDENER_PLANS))
     addButton(d,label+' · '+cost.toLocaleString('th-TH')+' บาท',()=>runGardenAction({type:'hireGardener',slot,plan}),Boolean(pendingGardenAction)||workers.length>=MAX_GARDENERS||ownProfile.money<cost);
 });
}
function gardenBoxDialog(){
 dialogType='box';
 showDialog('📦 กล่องผลผลิตข้างสวน',d=>{
   const entries=produceEntries(ownProfile.home.gardenBox), grid=inventoryGrid(d);
   for(const [crop,key,count] of entries)itemCell(grid,CROPS[crop].name+' เกรด '+gradeOf(key).name,CROPS[crop].icon,count);
   if(!entries.length)addText(d,'กล่องยังว่าง');
   finishInventoryGrid(grid);
   addButton(d,'รับผลผลิตเข้ากระเป๋า',()=>runGardenAction({type:'collectGardenBox'}),Boolean(pendingGardenAction)||!entries.length);
 });
}
function updateGardenerTime(now){
 const workers=workersOf(ownProfile.home);
 for(const line of el('dialogContent').querySelectorAll('[data-worker]')){
   const n=Number(line.dataset.worker), worker=workers[n];if(!worker)continue;
   const sec=Math.max(0,Math.ceil((worker.contractUntil-now)/1000));
   const value='คนที่ '+(n+1)+' · '+Math.floor(sec/3600)+' ชม. '+Math.floor(sec/60)%60+' นาที '+sec%60+' วิ';
   if(line.textContent!==value)line.textContent=value;
 }
}
function showGardenerReceipt(chatOnly=el('dialog').open&&['garden','box','plot'].includes(dialogType)){
 const receipt=ownProfile.home.gardenerReceipt;
 if(!receipt||receipt.at===receiptSeen)return;
 receiptSeen=receipt.at;
 const key='v5_gardener_receipt_'+myId;
 try{
   if(Number(localStorage.getItem(key))>=receipt.at)return;
   localStorage.setItem(key,String(receipt.at));
 }catch{}
 if(receipt.stored||!receipt.gross){
   notice('คนสวนเก็บผลผลิตช่วงออฟไลน์ '+receipt.stored+' ผล'+(receipt.ended?' · หมดเวลาจ้างแล้ว':''),chatOnly);
   return;
 }
 const baht=n=>n.toLocaleString('th-TH')+' บาท';
 notice('คนสวนช่วงออฟไลน์: ยอดขาย '+baht(receipt.gross)+' · หัก '+baht(receipt.gross-receipt.paid)+' · ได้สุทธิ '+baht(receipt.paid)+(receipt.ended?' · หมดเวลาจ้างแล้ว':''),chatOnly);
}
function shopDialog(){
 dialogType='shop';
 showDialog('🏪 ตลาดกลางชุมชน',d=>{
   for(const [crop,def] of Object.entries(CROPS)){
     const row=document.createElement('div');row.className='bulk-row';
     row.append(def.icon+' '+def.name);
     for(const quantity of [1,10,100]){
       const price=def.seed*quantity;
       addButton(row,quantity+' · '+price+' บาท',()=>runGardenAction({type:'seed',crop,quantity}),ownProfile.money<price||Boolean(pendingGardenAction));
     }
     d.append(row);
   }
   appendProduce(d,true);
   addButton(d,'ร้านค้าออนไลน์ · ซื้อขายกับผู้เล่น',onlineMarket);
 });
}
let marketBusy=false, selectedSeller=null;
async function onlineMarket(){
 dialogType='onlineMarket';
 showDialog('ร้านค้าออนไลน์',d=>{
   addButton(d,'กลับตลาดกลาง',shopDialog);
   if(!marketConfigured)addText(d,'ร้านระหว่างผู้เล่นจะเปิดเมื่อเซิร์ฟเวอร์ตลาดพร้อม');
   else if(!online)addText(d,'เข้าชุมชนออนไลน์เพื่อซื้อและลงขายกับผู้เล่นอื่น');
   else addText(d,'กำลังโหลดรายการขาย…');
 });
 if(!online||!marketConfigured)return;
 const panel=el('dialogContent').lastElementChild;
 const response=await fbGame.requestMarket({type:'browse'});
 if(dialogType!=='onlineMarket'||!el('dialog').open||!panel.isConnected)return;
 panel.remove();
 const d=el('dialogContent');
 if(!response.listings){addText(d,response.message||'โหลดรายการขายไม่สำเร็จ');addButton(d,'ลองใหม่',onlineMarket);return}
 if(response.profile){ownProfile=sanitizeState(response.profile);hud()}
 addText(d,'ลงขายตามราคาตลาด ณ เวลาลงขาย · ประกาศอยู่ 24 ชม. · เก็บของคืนได้เมื่อหมดอายุ');
 const entries=produceEntries(ownProfile.inventory);
 if(entries.length){
   const form=document.createElement('form');
   form.className='market-listing-form';
   const grade=document.createElement('select');
   grade.setAttribute('aria-label','เลือกเกรดผลผลิต');
   for(const [crop,key,count] of entries){
     const option=new Option(CROPS[crop].icon+' '+CROPS[crop].name+' '+gradeOf(key).name+' · มี '+count,crop+':'+key);
     grade.append(option);
   }
   const qty=document.createElement('input');
   Object.assign(qty,{type:'number',min:'1',step:'1',value:'1',required:true});
   qty.setAttribute('aria-label','จำนวนผลที่ลงขาย');
   const submit=document.createElement('button');
   submit.className='dialog-action';submit.type='submit';submit.textContent='ลงขาย';
   const selected=()=>grade.value.split(':');
   const setMax=()=>{const [crop,key]=selected();qty.max=String(Math.min(999,cropStock(ownProfile.inventory,crop).tomatoGrades[key]||0));};
   grade.onchange=setMax;setMax();
   form.append(grade,qty,submit);
   form.onsubmit=async e=>{
     e.preventDefault();
     submit.disabled=true;
     try{const [crop,key]=selected();await marketRequest({type:'list',id:crypto.randomUUID(),crop,key:Number(key),quantity:Number(qty.value)})}
     finally{submit.disabled=false}
   };
   d.append(form);
 }
 const list=document.createElement('div');list.className='social-list';d.append(list);
 const sellers=groupListings(response.listings);
 const render=()=>{
   list.replaceChildren();
   const seller=sellers.find(p=>p.id===selectedSeller);
   if(seller){
     addButton(list,'‹ กลับรายชื่อผู้ขาย',()=>{selectedSeller=null;render()});
     addText(list,seller.name);
     for(const row of seller.items){
       const entry=document.createElement('div');entry.className='dialog-row';
       const product=CROPS[row.crop]||CROPS.tomato;
       entry.append(product.icon+' '+product.name+' ');
       gradeLabel(entry,row.key);
       addText(entry,row.quantity+' ชิ้น · '+row.unitPrice+' บาท/ชิ้น'+(row.expired?' · หมดอายุ':''));
       if(row.own)addButton(entry,'เก็บของคืน',()=>marketRequest({type:'cancel',id:row.id}));
       else for(const quantity of [1,10,100])addButton(entry,'ซื้อ '+quantity+' · '+(quantity*row.unitPrice)+' บาท',()=>marketRequest({type:'buy',id:row.id,quantity}),row.expired||row.quantity<quantity);
       list.append(entry);
     }
     return;
   }
   for(const person of sellers){
     const button=document.createElement('button');button.type='button';button.className='player-card';
     const appearance=person.own?ownProfile.appearance:socialUI.player(person.id)?.appearance;
     button.append(avatarIcon(appearance,'🏪',person.name),document.createTextNode(person.name+' · '+person.items.length+' รายการ'));
     button.onclick=()=>{selectedSeller=person.id;render()};list.append(button);
   }
   if(!sellers.length)addText(list,'ยังไม่มีประกาศขาย');
 };
 render();
 addButton(d,'รีเฟรชรายการ',onlineMarket);
}
async function marketRequest(request){
 if(marketBusy)return;
 marketBusy=true;
 try{
   const result=await fbGame.requestMarket(request);
   if(!active||!online)return;
   if(result.profile){ownProfile=sanitizeState(result.profile);hud()}
   if(result.ok&&dialogType==='onlineMarket'&&el('dialog').open)await onlineMarket();
   notice(result.message);
 }finally{marketBusy=false}
}
function localLot(){return lots[slot]}
const estateSign=l=>({x:l.x+195,y:l.y+253});
function estateDialog(){
 dialogType='estate';
 showDialog('ขยายพื้นที่',d=>{
   for(const [title,type,getLevel] of [
     ['พื้นที่ในบ้าน','expandHouse',houseExpansionLevel],
     ['สวนและรั้ว','expandGarden',gardenExpansionLevel]
   ]){
     const section=document.createElement('section');
     const heading=document.createElement('h3');
     heading.textContent=title;section.append(heading);
     const level=getLevel(ownProfile.home),price=EXPANSION_PRICES[level];
     const size=homeGrid(level);
     addText(section,'ระดับ '+level+'/'+EXPANSION_PRICES.length+' · '+
       (type==='expandGarden'?plotCount(level)+' แปลง':size.cols+' × '+size.rows+' ช่องวางเฟอร์นิเจอร์'));
     if(price)addButton(section,'ขยาย'+title+' '+price.toLocaleString('th-TH')+' บาท',async()=>{
       const player=me;
       const result=await action({type,level});
       if(result?.ok&&me===player&&el('dialog').open&&dialogType==='estate'){
         estateDialog();
         notice(result.message);
       }
     },ownProfile.money<price);
     else addText(section,'ขยายครบแล้ว');
     d.append(section);
   }
 });
}
const market={type:'shop',name:'ตลาดกลาง',short:'ตลาด',icon:'🏪',color:'#e9c66d',x:WORLD.w/2-72,y:583,w:144,h:98};
const salon={type:'salon',name:'ร้านแต่งตัว',short:'แต่งตัว',icon:'✂️',color:'#cf93b0',x:market.x-174,y:583,w:144,h:98};
const vehicleShop={type:'vehicles',name:'ร้านรถ',short:'ร้านรถ',icon:'🚗',color:'#8cbcdf',x:market.x+174,y:583,w:144,h:98};
const townShops=[salon,market,vehicleShop];
function travelTo(destination){
 if(!active||buildDraft||el('dialog').open)return;
 scene='outside';visiting=null;me.pose='stand';me.onBed=false;me.walking=false;me.action=null;
 Object.assign(me,destination);keys.clear();joyReset();selectedTarget=null;sentMovement=null;resetAvatarMotion();
 if(online)publishMovement(performance.now());
}
el('travelHome').onclick=()=>{const door=doorPos(localLot());travelTo({x:door.x,y:door.y+45})};
el('travelMarket').onclick=()=>travelTo({x:market.x+market.w/2,y:market.y+market.h+31});
el('hireShortcut').onclick=()=>{if(active&&!buildDraft&&!el('dialog').open)gardenDialog()};
function setRiding(status){
 me.riding=status;sentMovement=null;
 el('rideShortcut').setAttribute('aria-pressed',String(status));
 el('rideShortcut').textContent=status?'ลงรถ':'ขึ้นรถ';
}
el('rideShortcut').onclick=()=>{
 if(!active||buildDraft||el('dialog').open)return;
 if(scene!=='outside'){notice('ออกมาข้างนอกก่อนขึ้นรถ');return}
 setRiding(!me.riding);
};
function salonDialog(){
 dialogType='salon';
 showDialog(salon.name,d=>{
   const host=document.createElement('div');d.append(host);
   buildAppearanceEditor(host,async appearance=>{
     const result=await action({type:'appearance',appearance});
     if(result?.ok)resetAvatarMotion();
   },{initial:ownProfile.appearance,storePreview:false});
   addButton(d,'ดาวน์โหลดรูปลักษณ์ (.json)',()=>{
     const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,appearance:ownProfile.appearance},null,2)],{type:'application/json'}));
     const link=document.createElement('a');
     link.href=url;link.download='neighborhood-appearance.json';link.click();
     setTimeout(()=>URL.revokeObjectURL(url),1000);
   });
 });
}
function vehiclesDialog(){
 dialogType='vehicles';
 showDialog(vehicleShop.name,d=>{
   for(const [id,vehicle] of Object.entries(VEHICLES)){
     const {owned,equipped}=ownProfile.garage;
     const inGarage=owned.includes(id);
     const label=vehicle.icon+' '+vehicle.name+(equipped===id?' · เลือกอยู่':inGarage?' · เลือกใช้':' · '+vehicle.price.toLocaleString('th-TH')+' บาท');
     addButton(d,label,async()=>{
       const result=await action({type:inGarage?'equipVehicle':'buyVehicle',vehicle:id});
       if(result?.ok&&el('dialog').open&&dialogType==='vehicles')vehiclesDialog();
     },equipped===id||(!inGarage&&ownProfile.money<vehicle.price));
   }
 });
}
const plotReach=75;
let lastMapFrame=-Infinity;
function refreshCommunityMap(now){
 if(now-lastMapFrame<90)return;
 lastMapFrame=now;
 const canvas=el('communityMap');
 const owners=new Set([slot]),levels=new Map([[slot,gardenExpansionLevel(ownProfile.home)]]);
 const others=[];
 for(const p of remote.values()){
   owners.add(p.slot);levels.set(p.slot,gardenExpansionLevel(p.home));
   if(p.scene==='outside')others.push(sampleRemoteMotion(p.motion,now));
 }
 const house=lots[visiting?.slot??slot];
 const player=scene==='outside'?me:{x:house.x+131,y:house.y+189};
 drawCommunityMap(canvas,{lots,levels,owners,ownSlot:slot,player,shops:townShops,others});
}

function distanceToRect(x,y,r){return Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h))}
function plotInReach(r){return distanceToRect(me.x,me.y,r)<=plotReach}
function houseRect(l){return {x:l.x+35,y:l.y+55,w:192,h:165}}
function doorPos(l){return {x:l.x+131,y:l.y+237}}
function nearbyTargets(){
 const targets=[];
 const point=(type,x,y,reach)=>({type,x,y,distance:Math.hypot(me.x-x,me.y-y),reach});
 const area=(type,r,extra={})=>({...extra,type,x:r.x+r.w/2,y:r.y+r.h/2,distance:distanceToRect(me.x,me.y,r),reach:plotReach});
 if(scene==='inside'){
   if(me.pose==='sit'||me.pose==='sleep')return [{type:'stand',x:me.x,y:me.y,distance:0}];
   const r=interior();targets.push(point('exit',r.w/2,r.h-21,70));
   for(const door of interiorArchitecture().walls.filter(part=>part.kind==='door')){
     const [ax,ay,bx,by]=partitionLine(door,interiorGrid());
     targets.push({...point('interiorDoor',(ax+bx)/2,(ay+by)/2,56),door});
   }
   for(const item of (visiting?.furniture||ownProfile.home.furniture)){
     const pose=furniturePose(item);
     if(pose)targets.push(area(pose,furnitureRect(item),{rotation:item.rotation}));
   }
 }else{
   const lot=localLot(),door=doorPos(lot);
   const box=gardenBoxPosition(lot);
   const sign=estateSign(lot);targets.push(point('estate',sign.x,sign.y,45));
   targets.push(point('door',door.x,door.y,85),point('box',box.x,box.y,47),...townShops.map(shop=>area(shop.type,shop)));
   for(const p of remote.values()){
     if(!Number.isInteger(p.slot)||!lots[p.slot])continue;
     const entry=doorPos(lots[p.slot]);
     targets.push({...point('visit',entry.x,entry.y,75),owner:p.id});
   }
   for(let plot=0;plot<ownProfile.home.plots.length;plot++)targets.push(area('plot',estatePlotRect(lot,plot),{plot}));
 }
 return targets.filter(target=>target.distance<=target.reach).sort((a,b)=>a.distance-b.distance);
}
const interactionKey=target=>[target.type,target.plot??target.owner??(target.door?partitionKey(target.door):target.type==='sit'||target.type==='sleep'?target.x+','+target.y:'')].join(':');
let selectedTarget=null,nearbySignature='';
const selectedInteract=()=>{const targets=nearbyTargets();return targets.find(target=>interactionKey(target)===selectedTarget)||targets[0]};
function interactionLabel(target){
 if(target.type==='plot'){
   const p=ownProfile.home.plots[target.plot];
   if(!p.crop)return ['🌱','ปลูก · แปลง '+(target.plot+1)];
   if(!p.watered)return ['💧','รดน้ำ · แปลง '+(target.plot+1)];
   const crop=CROPS[p.crop];
   return crop&&Date.now()-p.plantedAt>=crop.grow?[crop.icon,'เก็บเกี่ยว · แปลง '+(target.plot+1)]:['🌿','ดูแปลง '+(target.plot+1)];
 }
 if(target.type==='interiorDoor')return ['🚪',target.door.open?'ปิดประตู':'เปิดประตู'];
 const shop=townShops.find(shop=>shop.type===target.type);
 if(shop)return [shop.icon,shop.name];
 return {estate:['🪧','ขยายบ้านและสวน'],stand:['↥','ลุกขึ้น'],exit:['🚪','ออกจากบ้าน'],door:['🏠','เข้าบ้าน'],gardener:['🌾','จ้างคนสวน'],box:['📦','กล่องผลผลิต'],visit:['🏠','เยี่ยมบ้าน'],
   sleep:['🛏️','นอน'],sit:['🪑','นั่ง']}[target.type];
}
function updateNearby(){
 const panel=el('nearbyAction');
 const targets=buildDraft||el('dialog').open?[]:nearbyTargets();
 const target=targets.find(candidate=>interactionKey(candidate)===selectedTarget)||targets[0];
 panel.hidden=!target;
 if(!target){selectedTarget=null;return}
 const key=interactionKey(target);
 const signature=JSON.stringify([key,targets.map(candidate=>[interactionKey(candidate),interactionLabel(candidate)])]);
 if(nearbySignature!==signature){
   nearbySignature=signature;
   const tabs=el('nearbyTabs');tabs.replaceChildren();
   if(targets.length>1)for(const candidate of targets){
     const tab=document.createElement('button');
     const id=interactionKey(candidate);
     tab.type='button';tab.textContent=interactionLabel(candidate).join(' ');
     tab.setAttribute('aria-pressed',String(id===key));
     tab.onclick=()=>{selectedTarget=id;updateNearby();el('nearbyUse').focus()};
     tabs.append(tab);
   }
 }
 const [icon,label]=interactionLabel(target);
 if(el('nearbyIcon').textContent!==icon)el('nearbyIcon').textContent=icon;
 if(el('nearbyLabel').textContent!==label)el('nearbyLabel').textContent=label;
}
function interact(act=selectedInteract()){
 if(!act)return;
 if(act.type==='stand'){me.pose='stand';me.onBed=false;notice('ลุกขึ้นยืนแล้ว');return}
 else if(act.type==='sit'||act.type==='sleep'){me.pose=act.type;me.onBed=act.type==='sleep';me.restAngle=(act.rotation||0)*Math.PI/180;me.face=Math.PI/2+me.restAngle;me.x=act.x;me.y=act.y;me.walking=false;notice(act.type==='sleep'?'🛏️ นอนพักผ่อนแล้ว':'🪑 นั่งพักผ่อนแล้ว');return}
 if(act.type==='exit'){
   me.pose='stand';me.onBed=false;scene='outside';
   const p=doorPos(lots[visiting?.slot]||localLot());me.x=p.x;me.y=p.y+45;
   visiting=null;notice('ออกจากบ้านแล้ว');
 }
 else if(act.type==='door'||act.type==='visit'){
   const host=act.type==='visit'?remote.get(act.owner):null;
   if(act.type==='visit'&&(!host||!lots[host.slot]))return;
   const level=houseExpansionLevel(host?.home);
   visiting=host?{id:host.id,slot:host.slot,name:host.name,expansion:level,furniture:sanitizeFurniture(host.home?.furniture,level),architecture:sanitizeArchitecture(host.home?.architecture,homeGrid(level))}:null;
   setRiding(false);
   scene='inside';houseEnteredAt=performance.now();me.x=interior().w/2;me.y=interior().h-73;me.pose='stand';
   notice(visiting?'เข้าบ้านของ '+visiting.name:'เข้าบ้านของคุณแล้ว');
 }
 else if(act.type==='plot')openPlot(act.plot);
 else if(act.type==='shop')shopDialog();
 else if(act.type==='salon')salonDialog();
 else if(act.type==='vehicles')vehiclesDialog();
 else if(act.type==='interiorDoor'){
   if(visiting){notice('เจ้าของบ้านเป็นคนเปิดปิดประตู');return}
   if(act.door.open&&partitionBlocks({...act.door,open:false},interiorGrid(),me.x,me.y,13)){
     notice('ถอยออกจากประตูก่อนปิด');return;
   }
   action({type:'toggleInteriorDoor',key:partitionKey(act.door),open:!act.door.open});
 }
 else if(act.type==='box')gardenBoxDialog();
 else if(act.type==='estate')estateDialog();
}
el('nearbyUse').onclick=()=>{if(active&&!buildDraft&&!el('dialog').open)interact()};
async function toggleSound(){
 if(sound){sound=false;notice('ปิดเสียงแล้ว');return}
 try{
   soundCtx??=new (window.AudioContext||window.webkitAudioContext)();
   await soundCtx.resume();
   sound=true;notice('เปิดเสียงแล้ว');
 }catch{notice('เบราว์เซอร์นี้ไม่รองรับเสียงประกอบ')}
}
function blip(freq=440,duration=.09,vol=.015,type='sine'){if(!sound||!soundCtx)return;const a=soundCtx.createOscillator(),g=soundCtx.createGain();a.type=type;a.frequency.setValueAtTime(freq,soundCtx.currentTime);g.gain.setValueAtTime(vol,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,soundCtx.currentTime+duration);a.connect(g).connect(soundCtx.destination);a.start();a.stop(soundCtx.currentTime+duration)}
// Reuse the genuine V4 footstep samples from legacy/assets/audio.
const v4StepSamples=new Map();
function playV4Footstep(){
  if(!sound)return;
  const ground=scene==='inside'?'wood':me.y>=575&&me.y<=721?'stone':'grass';
  let clip=v4StepSamples.get(ground);
  if(!clip){
    clip=document.createElement('audio');
    clip.src='legacy/assets/audio/step-'+ground+'.wav';
    clip.preload='auto';
    v4StepSamples.set(ground,clip);
  }
  try{clip.pause();clip.currentTime=0;clip.volume=.3;clip.play().catch(()=>blip(160,.06,.008,'triangle'))}
  catch{blip(160,.06,.008,'triangle')}
}
function playAmbient(t){if(!sound||!soundCtx||t-ambientAt<1900)return;ambientAt=t;const f=600+Math.sin(t/9000)*130;blip(f,.2,.006,'sine');setTimeout(()=>blip(f*1.15,.13,.003,'sine'),130)}
el('chatInput').onfocus=()=>{keys.clear();joyReset()};
let lastChatSent=-Infinity;
function chatMessage(message){
 if(!active||!message)return;
 const now=performance.now();
 if(online&&now-lastChatSent<950){notice('รอสักครู่ก่อนส่งข้อความถัดไป');return}
 lastChatSent=now;
 me.text=message;me.until=Date.now()+5000;
 if(online)send({type:'say',text:message});
 appendChat(ownProfile.displayName,message);
 return true;
}
el('chatForm').onsubmit=e=>{e.preventDefault();const input=el('chatInput');if(chatMessage(input.value.trim().slice(0,120))){input.value='';input.blur()}};

const voice=roomVoice({
 identity:()=>myId,
 publish:fields=>{if(online)send({type:'voice',fields})},
 status:on=>{el('microphone').setAttribute('aria-pressed',String(on));el('microphone').textContent=on?'🎙️':'🎤'},
 talking:on=>{if(me)me.voiceTalking=on}
});
el('microphone').onclick=async()=>{
 const button=el('microphone');button.disabled=true;
 try{await voice.toggle(()=>[...remote.values()])}
 catch{notice('เปิดไมค์ไม่ได้ กรุณาตรวจสอบสิทธิ์ไมโครโฟน')}
 finally{button.disabled=false}
};
el('emojis').onclick=()=>{el('emojiChoices').hidden=!el('emojiChoices').hidden};
for(const emoji of ['😀','😂','❤️','👍','👋','🎉','😴','🌱']){
 const button=document.createElement('button');
 button.type='button';button.textContent=emoji;
 button.onclick=()=>{if(chatMessage(emoji))el('emojiChoices').hidden=true};
 el('emojiChoices').append(button);
}
addEventListener('pagehide',()=>voice.close());
addEventListener('keydown',e=>{
 if(buildDraft){if(e.key==='Escape'){e.preventDefault();cancelBuild()}return}
 const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)){keys.add(e.key.toLowerCase());if(active)e.preventDefault()}
 if(!active||e.repeat||el('dialog').open)return;
 if(e.key==='/'){e.preventDefault();setChatOpen(true);el('chatInput').focus()}
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
function road(now,view){
 const {left,right,top,bottom}=estateWorld;
 round(left,top,right-left,bottom-top,0,'#77a65c');
 grassTexture(ctx,left,top,right-left,bottom-top,.8);
 const startX=Math.max(left,view.left-40),endX=Math.min(right,view.right+40);
 const startY=Math.max(top,view.top-40),endY=Math.min(bottom,view.bottom+40);
 for(let x=Math.ceil(startX/110)*110;x<=endX;x+=110)
   for(let y=Math.ceil(startY/110)*110;y<=endY;y+=110)circle(x+Math.abs(y/110%2)*33,y,3,'#689a52');
 if(endY<535||startY>763)return;
 round(left,560,right-left,176,0,'#4e6564');round(left,575,right-left,146,0,'#657578');
 roadTexture(ctx,left,575,right-left,146,.9);
 for(let x=Math.floor(startX/130)*130+10;x<=endX;x+=130)round(x,646,72,6,3,'#f7e6ae');
 line(left,559,right,559,'#d7c2a3',10);line(left,735,right,735,'#d7c2a3',10);
 for(const shop of townShops){
   const centre=shop.x+shop.w/2;
   round(shop.x+3,shop.y+7,shop.w,shop.h,10,'#26363880');
   round(shop.x,shop.y,shop.w,shop.h,10,'#283e39');
   round(shop.x,shop.y,shop.w,20,8,shop.color);
   text(shop.icon,centre,shop.y+52,32);
   text(shop.name,centre,shop.y+78,17,'#fff6db');
 }
 for(let x=Math.floor(startX/235)*235+54;x<=endX;x+=235){
   const bend=sway(now,x,weather);circle(x+bend,566,19,'#597d4c');circle(x-7+bend*1.6,552,12,'#7fa85a');circle(x+bend,737,16,'#6d8e51');
 }
}
function fence(l,level){
 for(const [x,y,right,bottom] of estateFenceSegments(l,level)){
   line(x,y,right,bottom,'#b9a37c',7);
   if(x===right)for(let yy=Math.min(y,bottom);yy<=Math.max(y,bottom);yy+=31){
     round(x-4,yy,9,10,2,'#e2ca91');
   }
 }
}
function drawHouse(l,p,now){const h=houseRect(l);round(h.x+4,h.y+10,h.w,h.h,10,'#3c3d33');round(h.x,h.y,h.w,h.h,12,'#a88460');
 // Wooden roof with gentle animated highlight.
 round(h.x+5,h.y+5,h.w-10,95,9,'#c48155');roofTexture(ctx,h.x+7,h.y+7,h.w-14,91,.9);for(let i=0;i<7;i++)line(h.x+11,h.y+14+i*13,h.x+h.w-11,h.y+14+i*13,'#dba06f',2);
 round(h.x+19,h.y+113,42,31,5,'#c8e8ce');round(h.x+129,h.y+113,42,31,5,'#c8e8ce');round(h.x+96,h.y+141,40,24,5,'#5c463e');
 text('🏠',h.x+h.w/2,h.y+89,31);
 const door=doorPos(l);round(door.x-13,door.y-12,26,18,5,'#a17d5a');
 text('🚪',door.x,door.y+8,19);text(p.name||'ผู้เล่น',l.x+l.w/2,l.y+31,15,'#f2fbec');
}
function drawPlot(r,i,plot,now){
 round(r.x,r.y,r.w,r.h,8,'#60482f');
   soilTexture(ctx,r.x+2,r.y+2,r.w-4,r.h-4,.9);
   for(const row of [.22,.50,.78])line(r.x+5,r.y+r.h*row,r.x+r.w-5,r.y+r.h*row,'#82613d',2);
 if(plot?.crop){
   const grow=plot.watered?Math.min(1,(Date.now()-plot.plantedAt)/(CROPS[plot.crop]?.grow||GROW_MS)):.17;
   const x=r.x+r.w/2,y=r.y+r.h*.64;
   const radius=Math.min(r.w*.17,r.h*.23)*(0.65+grow*.35);
   circle(x+sway(now,x,weather),y,radius,'#6cad45');
   if(grow>.92)text(CROPS[plot.crop]?.icon||'🍅',x,y+4,Math.min(14,r.h*.32));
 }
 text(String(i+1),r.x+10,r.y+13,10,'#dccfb6');
}
function drawEmpty(l){round(l.x,l.y,l.w,l.h,13,'#80a862');round(l.x+20,l.y+20,l.w-40,l.h-40,10,'#81ac67');text('🏡',l.x+l.w/2,l.y+170,42);text('แปลงบ้านว่าง',l.x+l.w/2,l.y+215,17,'#345338');text('รอผู้เล่นเข้าชุมชน',l.x+l.w/2,l.y+242,12,'#46604a');fence(l)}
function worldDraw(now,camera,preview=false){
 const halfW=w/(2*camera.zoom),halfH=h/(2*camera.zoom);
 const view={left:camera.x-halfW,right:camera.x+halfW,top:camera.y-halfH,bottom:camera.y+halfH};
 const visible=r=>r.x+r.w>=view.left-30&&r.x<=view.right+30&&r.y+r.h>=view.top-30&&r.y<=view.bottom+30;
 road(now,view);
 const lotsUsed=new Map([[slot,{name:ownProfile.displayName,home:ownProfile.home}]]);
 for(const p of remote.values())if(p?.slot>=0&&p?.slot<8)lotsUsed.set(p.slot,{name:p.name,home:p.home});
 for(const l of lots){
   const u=lotsUsed.get(l.slot),level=gardenExpansionLevel(u?.home),bounds=estateBounds(l,level);
   if(!visible(bounds))continue;
   if(!u){drawEmpty(l);continue}
   const backY=l.slot<4?bounds.y:bounds.y+bounds.h;
   const stepY=bounds.gateY+(l.slot<4?-24:24);
   round(l.x,Math.min(backY,bounds.gateY),l.w,bounds.h,0,'#8faf6a');
   round(bounds.x,Math.min(backY,stepY),bounds.w,Math.abs(backY-stepY),0,'#8faf6a');
   for(const field of estateGardenFields(l,level)){
     if(!visible(field))continue;
     round(field.x-9,field.y-8,field.w+18,field.h+16,9,'#7f9659');
     round(field.centre-15,field.y-8,30,field.h+16,5,'#c2b58b');
     line(field.centre-10,field.y,field.centre-10,field.y+field.h,'#d2c69f',2);
   }
   for(let i=0;i<plotCount(level);i++){
     const r=estatePlotRect(l,i);
     if(visible(r))drawPlot(r,i,u.home?.plots?.[i],now);
   }
   drawHouse(l,u,now);fence(l,level);
 }
 if(preview)return;
 drawFootprints(ctx,footprints.visible(now,'outside'),now);
 drawGardenerPost(now);
 const sign=estateSign(localLot());text('🪧',sign.x,sign.y,22);text('ขยายที่ดิน',sign.x,sign.y+18,11,'#fff4ce');
 const box=gardenBoxPosition(localLot());
 round(box.x-15,box.y-12,30,23,3,'#644431');
 round(box.x-15,box.y-15,30,12,3,'#c58e5c');
 round(box.x-3,box.y-5,6,7,2,'#f1cd7d');
 const boxCount=produceEntries(ownProfile.home.gardenBox).reduce((sum,[,,count])=>sum+count,0);
 if(boxCount)text(String(boxCount),box.x,box.y+24,12,'#fff5bf');
 for(const [index, player] of lotsUsed){
   for(const [n,worker] of workersOf(player.home).entries()){
   const visualId=index*MAX_GARDENERS+n;
   if(!worker||worker.slot!==index||worker.contractUntil&&Date.now()>=worker.contractUntil)continue;
   const p=gardenerPosition(lots[index],worker,Date.now());
   if(p){
     p.x+=n*9;p.y+=n*6;
     const old=gardenerVisuals.get(visualId);
     const delta=old?Math.max(0,now-old.now):0;
     const keep=old&&delta<700&&Math.hypot(old.x-p.x,old.y-p.y)<220;
     const blend=1-Math.exp(-delta/140);
     const x=keep?old.x+(p.x-old.x)*blend:p.x,y=keep?old.y+(p.y-old.y)*blend:p.y;
     gardenerVisuals.set(visualId,{x,y,now});
     avatar({...p,x,y,id:'gardener-'+visualId,name:'คนสวน',scene:'outside',pose:'stand',positionInterpolated:true,appearance:{gender:2,skin:2,hair:2,style:0,outfit:3,accessory:1}},now,false);
   }
 }
 }
 for(const p of remote.values()){
   if(p.scene==='outside')avatar({...p,...sampleRemoteMotion(p.motion,now),positionInterpolated:true},now,false);
 }
 avatar({...me,name:ownProfile.displayName},now,true)
}
function drawGardenerPost(now){
 const {x,y}=gardenerPost(localLot());
 const pulse=reducedEffects.matches?0:Math.sin(now/430)*3;
 ctx.beginPath();
 ctx.ellipse(x,y,27+pulse,15+pulse/2,0,0,Math.PI*2);
 ctx.fillStyle='#80e3b24d';ctx.fill();
 ctx.strokeStyle='#d0f9a9';ctx.lineWidth=2;ctx.stroke();
 text('🌾',x,y+6,22);
 text('จ้างคนสวน',x,y+31,12,'#fff2b6');
}
function drawBuildGrid() {
 const {x, y, tile, cols, rows} = HOME_GRID;
 const selectedId=selectedFurniture()?.id;
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const item=furnitureAt(col,row);
   const selected=item && item.id===selectedId;
   const tx=x+col*tile+1, ty=y+row*tile+1;
   round(tx,ty,tile-2,tile-2,4,selected?'#e8e18ba8':item?'#60463664':'#329f6a25');
   ctx.strokeStyle=selected?'#ffeaa4':item?'#9b7757':'#b2ffd1';
   ctx.lineWidth=1.25;
   ctx.stroke();
 }
}
function drawBuildPreview() {
 if (!hoverTile || savingBuild) return;
 const {col,row}=hoverTile;
 if(buildTool.value!=='furniture'){
   if(['tile','eraseTile'].includes(buildTool.value)){
     round(HOME_GRID.x+col*HOME_GRID.tile,HOME_GRID.y+row*HOME_GRID.tile,HOME_GRID.tile,HOME_GRID.tile,3,'#fff7bc60');
   }else{
     line(...partitionLine({col,row,edge:buildEdge.value},HOME_GRID),'#fff4ac',5);
   }
   return;
 }
 const item=furnitureAt(col,row);
 if(item && buildSelection?.kind!=='new')return;
 const candidate=placementAt(col,row);
 if(!candidate)return;
 const valid=isValidFurniturePlacement(candidate,buildDraft.furniture,candidate.id,houseExpansionLevel(ownProfile.home));
 const r=furnitureRect(candidate);
 ctx.save();
 ctx.beginPath();
 ctx.rect(HOME_GRID.x,HOME_GRID.y,HOME_GRID.cols*HOME_GRID.tile,HOME_GRID.rows*HOME_GRID.tile);
 ctx.clip();
 round(r.x+1,r.y+1,r.w-2,r.h-2,5,valid?'#bdffc884':'#ef7153b0');
 ctx.strokeStyle=valid?'#ebffd4':'#ffdad1';
 ctx.lineWidth=2;
 ctx.stroke();
 if(valid){
   ctx.globalAlpha=.65;
   drawFurniture(ctx,candidate);
 }
 ctx.restore();
}
function drawArchitecture(layout,grid,night,layer){
 if(layer==='floor'){
   for(const tile of layout.tiles){
     const x=grid.x+tile.col*grid.tile,y=grid.y+tile.row*grid.tile;
     round(x+1,y+1,grid.tile-2,grid.tile-2,2,HOME_FINISHES.floors[tile.finish]);
     line(x+4,y+4,x+grid.tile-4,y+4,'#ffffff42',1);
   }
   return;
 }
 for(const part of layout.walls){
   const [ax,ay,bx,by]=partitionLine(part,grid),cx=(ax+bx)/2,cy=(ay+by)/2;
   if(part.kind==='window'){
     const dx=part.edge==='west'?120:part.edge==='east'?-120:0;
     const dy=part.edge==='north'?120:part.edge==='south'?-120:0;
     if(layer==='light'&&!night){
       const glow=ctx.createLinearGradient(cx,cy,cx+dx,cy+dy);
       glow.addColorStop(0,'#fff2b78c');glow.addColorStop(1,'#fff2b700');
       ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);
       ctx.lineTo(bx+dx+Math.sign(bx-ax)*23,by+dy+Math.sign(by-ay)*23);
       ctx.lineTo(ax+dx-Math.sign(bx-ax)*23,ay+dy-Math.sign(by-ay)*23);
       ctx.closePath();ctx.fillStyle=glow;ctx.fill();
     }
     if(layer==='wall'){
       line(ax,ay,bx,by,HOME_FINISHES.walls[part.finish],12);
       line(ax+(bx-ax)*.12,ay+(by-ay)*.12,bx-(bx-ax)*.12,by-(by-ay)*.12,night?'#0e172a':'#bce6e8',8);
       circle(cx,cy,2,night?'#3e536d':'#effafb');
     }
     continue;
   }
   if(layer!=='wall')continue;
   if(part.kind==='door'&&part.open){
     line(ax,ay,ax+(by-ay)*.7,ay-(bx-ax)*.7,HOME_FINISHES.walls[part.finish],9);
     circle(bx,by,3,'#f9d992');
   }else{
     line(ax,ay,bx,by,'#3e3029',14);
     line(ax,ay,bx,by,HOME_FINISHES.walls[part.finish],10);
     if(part.kind==='door')circle(cx+(bx-ax)*.29,cy+(by-ay)*.29,3,'#f9d992');
   }
 }
}
function indoors(now){const room=interior(),mid=room.w/2;
 round(0,0,room.w,room.h,0,'#d6b88e');woodTexture(ctx,0,0,room.w,room.h,.87);
 for(let y=36;y<room.h;y+=48)line(15,y,room.w-15,y,'#c29a76',1);
 round(0,0,room.w,43,0,'#836b61');round(0,0,21,room.h,0,'#927566');
 round(room.w-20,0,20,room.h,0,'#927566');round(mid-25,room.h-22,55,22,3,'#634f45');text('🚪',mid,room.h-15,21);
 const furniture=buildDraft?.furniture || visiting?.furniture || ownProfile.home.furniture;
 const architecture=interiorArchitecture(),grid=interiorGrid(),night=isNight();
 drawArchitecture(architecture,grid,night,'floor');
 drawArchitecture(architecture,grid,night,'light');
 if(!buildDraft)drawFootprints(ctx,footprints.visible(now,footprintPlace()),now);
 text('บ้านของ '+(visiting?.name||ownProfile.displayName),325,90,22,'#4b443a');
 if(buildDraft)drawBuildGrid();
 else if(!furniture.length&&!architecture.walls.length&&!architecture.tiles.length)text('ห้องยังว่างเปล่า — ซื้อของตกแต่งได้',325,170,16,'#7a6650');
 for(const item of [...furniture].sort((a,b) => (a.row+furnitureFootprint(a).h)-(b.row+furnitureFootprint(b).h)))drawFurniture(ctx,item);
 drawArchitecture(architecture,grid,night,'wall');
 if(buildDraft){drawBuildPreview();return}
 for(const p of nearbyPeople())if(scene==='inside')avatar({...p,...sampleRemoteMotion(p.motion,now),positionInterpolated:true},now,false);
 avatar({...me,name:ownProfile.displayName},now,true)
}
function avatar(p,now,local){
  const onset=local?hungrySince:p.hungrySince;
  const jitter=onset!=null&&!reducedEffects.matches&&p.pose!=='sleep'
    ?hungerOffset(now-onset,local?ownProfile.needs.fullness:0):0;
  ctx.save();
  ctx.translate(jitter,0);
  const actor={...p,scene:local?scene:p.scene,face:local?me.face:p.face,
    onBed:p.pose==='sleep',unhappy:local?ownProfile.needs.happiness<LOW_NEED:p.unhappy===true};
  const {x,y}=drawClassicActor(ctx,actor,now,local,ownProfile.displayName,ownProfile.appearance);
  ctx.restore();
  const vehicleId=local?(me.riding?ownProfile.garage.equipped:null):p.vehicle;
  const vehicle=Object.hasOwn(VEHICLES,vehicleId)?VEHICLES[vehicleId]:null;
  if(vehicle&&actor.scene==='outside')text(vehicle.icon,x,y+13,32);
  const name=String(local?ownProfile.displayName:(p.name||'ผู้เล่น')).slice(0,18);
  round(x-62,y-65,124,20,9,local?'#fff2cf':'#effff5');text(name,x,y-50,11,'#30454b');
  if(p.text&&p.until>Date.now()){const msg=String(p.text).slice(0,40);round(x-119,y-107,238,31,11,'#fff8e9');text(msg,x,y-86,12,'#304849')}
}
function background(now){ctx.fillStyle=buildDraft?'#27423b':'#6b985e';ctx.fillRect(0,0,w,h);
 const zoomProgress=reducedEffects.matches?1:Math.min(1,Math.max(0,(now-houseEnteredAt)/340));
 const room=interior();
 const camera=buildDraft?roomBuildCamera():scene==='outside'?{x:me.x,y:me.y,zoom:Math.min(1.0,Math.max(.7,w/830))}:{x:room.w/2,y:room.h/2,zoom:Math.min(w/(room.w+20),h/(room.h+20),1.5)*(.85+.15*zoomProgress)};
 if(scene==='inside'&&!buildDraft){
   const door=doorPos(lots[visiting?.slot]||localLot());
   ctx.save();
   ctx.translate(w/2-door.x,h/2-door.y);
   worldDraw(now,{...door,zoom:1},true);
   ctx.restore();
   ctx.fillStyle='#08111cba';ctx.fillRect(0,0,w,h);
 }
 renderedCamera={...camera,scene,w,h};
 ctx.save();ctx.translate(w/2,camera.centerY??h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
 if(scene==='outside'&&!buildDraft)worldDraw(now,camera);else indoors(now);ctx.restore();
 if(buildDraft)return;
 if(isNight()){ctx.fillStyle='rgba(13,24,54,.25)';ctx.fillRect(0,0,w,h)}
 if(scene==='outside')drawWeather(ctx,w,h,now,weather);
 if(tiredSince!==null&&!reducedEffects.matches){
   const opacity=fatigueOpacity(now-tiredSince,ownProfile.needs.energy);
   if(opacity>0){ctx.fillStyle='rgba(0,0,0,'+opacity+')';ctx.fillRect(0,0,w,h)}
 }
}
function nearbyPeople(){
 const homeId=visiting?.id||myId;
 return [...remote.values()].filter(p=>p.scene===scene&&(scene!=='inside'||(p.house||p.uid||p.id)===homeId));
}
function tickNeeds(clock,now){
 const {energy,fullness}=ownProfile.needs;
 tiredSince=energy<LOW_NEED?(tiredSince??now):null;
 hungrySince=fullness<LOW_NEED?(hungrySince??now):null;
 if(needsPending||pendingGardenAction||clock<nextNeedsAt||document.hidden||buildDraft)return;
 nextNeedsAt=clock+NEEDS_STEP_MS;
 const player=me;
 needsPending=true;
 const nearPlayer=nearbyPeople().some(p=>Math.hypot(p.x-me.x,p.y-me.y)<=100);
 Promise.resolve(action({type:'needsTick',pose:me.pose,nearPlayer})).finally(()=>{
   if(me===player)needsPending=false;
 });
}
function tickGardener(now){
 const worker=ownProfile.home.gardener;
 if(!worker||gardenerPending||pendingGardenAction||document.hidden||now<gardenerRetryAt)return;
 const due=Math.min(...workersOf(ownProfile.home).map(w=>Math.min(w.nextAt,w.contractUntil||now,w.lastSeenAt+GARDENER_HEARTBEAT)));
 if(!gardenerResume&&now<due)return;
 gardenerPending=true;
 gardenerRetryAt=now+1500;
 const player=me,resume=gardenerResume;
 gardenerResume=false;
 Promise.resolve(action({type:resume?'gardenerResume':'gardenerStep',slot})).then(result=>{
   if(me===player&&resume&&!result?.ok)gardenerResume=true;
 }).finally(()=>{if(me===player)gardenerPending=false});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)gardenerResume=true});
function canMove(x,y){if(scene==='inside'){
 const r=interior(),grid=interiorGrid();
 return x>22&&y>55&&x<r.w-22&&y<r.h-31&&!interiorArchitecture().walls.some(part=>partitionBlocks(part,grid,x,y));
 }
 if(x<estateWorld.left+22||y<estateWorld.top+22||x>estateWorld.right-22||y>estateWorld.bottom-22)return false;
 for(const l of lots){
   const house=houseRect(l);
   if(x>house.x-14&&x<house.x+house.w+14&&y>house.y-15&&y<house.y+house.h+10)return false;
 }
 if(townShops.some(shop=>distanceToRect(x,y,shop)<9))return false;
 const expansions=new Map([[slot,gardenExpansionLevel(ownProfile.home)]]);
 for(const player of remote.values())expansions.set(player.slot,gardenExpansionLevel(player.home));
 for(const lot of lots)if(estateFenceBlocks(lot,x,y,expansions.get(lot.slot)))return false;
 return true}
function tick(now){const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
 if(active){
  const clock=Date.now();
  weather=weatherAt(clock);
  tickGardener(clock);
  updateGardenerTime(clock);
  tickNeeds(clock,now);
  const period=Math.floor(clock/MARKET_HOUR_MS);
  if(marketEpoch!==period){
    marketEpoch=period;
    if(dialogType==='shop'&&el('dialog').open)shopDialog();
  }
  let dx=joyX+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  let dy=joyY+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
  const m=Math.hypot(dx,dy);me.walking=m>.07&&!buildDraft&&!el('dialog').open;
   if(me.walking&&me.pose!=='stand'){me.pose='stand';me.onBed=false}
  if(me.walking){dx/=m;dy/=m;
    const speed=me.riding&&scene==='outside'?VEHICLES[ownProfile.garage.equipped].speed:174;
    const step=speed*dt,count=scene==='inside'?Math.max(1,Math.ceil(step/7)):1;
    for(let i=0;i<count;i++){
      if(canMove(me.x+dx*step/count,me.y))me.x+=dx*step/count;
      if(canMove(me.x,me.y+dy*step/count))me.y+=dy*step/count;
    }
    me.face=Math.atan2(dy,dx);
    if(!me.riding&&now-lastStep>210){lastStep=now;playV4Footstep()}
  }
  if(online)publishMovement(now);
  const place=footprintPlace();
  footprints.sample(myId,me,now,{place,walking:me.walking&&!me.riding,weather});
  for(const player of nearbyPeople()){
    const sample=sampleRemoteMotion(player.motion,now);
    footprints.sample(player.id,sample,now,{place,walking:sample.walking&&!player.vehicle&&player.pose==='stand',weather});
  }
  playAmbient(now);
  background(now);
  refreshCommunityMap(now);
  updateNearby();
 }else{
   ctx.fillStyle='#14332b';ctx.fillRect(0,0,w,h);
   for(let i=0;i<20;i++){circle(((i*431+now/250*(i%3+1))%w),((i*193+now/800)%h),2,'#b5e6ab33')}
 }
 requestAnimationFrame(tick)
}
requestAnimationFrame(tick);
function publishMovement(now){
 const pose=me.pose||'stand';
 const mapX=Math.round(me.x),mapY=Math.round(me.y);
 const {x,y}=scene==='outside'?estateToWire(mapX,mapY):{x:mapX,y:mapY};
 const house=scene==='inside'?(visiting?.id||myId):null;
 const vehicle=scene==='outside'&&me.riding?ownProfile.garage.equipped:null;
 const changedSceneOrPose=scene!==sentMovement?.scene||pose!==sentMovement?.pose||house!==sentMovement?.house||vehicle!==sentMovement?.vehicle;
 if(!changedSceneOrPose&&(now-lastMove<MOVE_INTERVAL_MS||(x===sentMovement.x&&y===sentMovement.y)))return;
 const movement={type:'move',x,y,scene,pose,house,vehicle,restAngle:pose==='stand'?null:me.restAngle};
 lastMove=now;sentMovement=movement;
 send(movement);
}
c.addEventListener('pointerup',e=>{
 const camera=renderedCamera;
 if(!active||buildDraft||el('dialog').open||!camera||camera.scene!==scene||camera.w!==w||camera.h!==h)return;
 const bounds=c.getBoundingClientRect();
 const x=((e.clientX-bounds.left)*w/bounds.width-w/2)/camera.zoom+camera.x;
 const y=((e.clientY-bounds.top)*h/bounds.height-h/2)/camera.zoom+camera.y;
 if(scene==='inside'){
   const target=nearbyTargets().find(act=>Math.hypot(x-act.x,y-act.y)<38);
   if(target&&Math.hypot(x-target.x,y-target.y)<38)interact(target);
   return;
 }
 const l=localLot();
 const target=nearbyTargets().find(act=>['visit','box','estate'].includes(act.type)&&Math.hypot(x-act.x,y-act.y)<34);
 if(target&&['visit','box','estate'].includes(target.type)&&Math.hypot(x-target.x,y-target.y)<34){interact(target);return}
 const plot=estatePlotIndex(l,x,y,gardenExpansionLevel(ownProfile.home));
 if(plot>=0){
   if(plotInReach(estatePlotRect(l,plot)))openPlot(plot);
   else notice('เดินเข้าใกล้แปลงสวนก่อนครับ');
   return;
 }
 const shop=townShops.find(shop=>distanceToRect(x,y,shop)===0);
 if(shop){
   if(distanceToRect(me.x,me.y,shop)<=plotReach)interact(shop);else notice('เดินเข้าใกล้'+shop.name+'ก่อนครับ');
   return
 }
 const door=doorPos(l);
 if(Math.hypot(x-door.x,y-door.y)<40){
   if(Math.hypot(me.x-door.x,me.y-door.y)<110)interact({type:'door'});else notice('เดินเข้าใกล้ประตูบ้านก่อนครับ');
 }
});
try{el('nickname').value=localStorage.getItem('v5_nickname')||'ผู้เล่น'}catch{}
el('nickname').addEventListener('input',()=>{try{localStorage.setItem('v5_nickname',el('nickname').value)}catch{}});
buildAppearanceEditor(el('avatarFields'),applyAvatarAppearance,{lobby:true});
setAccountMode('login');
if(onlineReady){
 firebaseClient().then(adapter=>{
   if(!accountBusy&&adapter.currentUser())showEntry(adapter.currentUser());
 }).catch(()=>{});
}
setInterval(()=>{if(session&&!active)refreshRooms()},12000);

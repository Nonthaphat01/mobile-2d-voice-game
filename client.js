import {MAX_PLAYERS,ROOM_IDS,PLOT_COUNT,starter,sanitizeState,applyAction,lots,WORLD,GROW_MS,HOME_GRID,FURNITURE_TYPES,furnitureFootprint,isValidFurniturePlacement} from './shared/rules.js?v=v5-build-mode-1';
import {drawClassicActor,resetAvatarMotion,buildAppearanceEditor,hasChosenAppearance,getChosenAppearance,useSavedAppearance} from './v4-avatar-bridge.js?v=v5-smooth-1';
import {grassTexture,roadTexture,soilTexture,woodTexture,roofTexture} from './v4-textures.js';
import {MOVE_INTERVAL_MS,updateRemoteMotion,sampleRemoteMotion} from './shared/remote-motion.js?v=v5-smooth-1';
import {drawFurniture, furnitureRect} from './home-furniture.js?v=v5-build-room-2';

const el=id=>document.getElementById(id);
const c=el('game'),ctx=c.getContext('2d');
const cfg=window.GAME_CONFIG||{};
const remote=new Map();
let w=innerWidth,h=innerHeight,dpr=1,lastFrame=performance.now(),lastMove=0;
let sentMovement;
let scene='outside',active=false,online=false,fbGame=null,session=null;
let selectedRoom='002',room='002',slot=0,myId='local',ownProfile=starter(),serverRooms=[];
let me={x:0,y:0,face:1,walking:false,text:'',until:0};
let joyX=0,joyY=0,joyId=null,sound=false,soundCtx=null,lastStep=0,ambientAt=0;
let plotReadyTimer,renderedCamera;
const keys=new Set();
const demoKey='my_little_neighborhood_v5_demo';
const onlineReady=Boolean(cfg.firebase?.apiKey&&cfg.firebase?.databaseURL&&cfg.firebase?.projectId);
const localNotice='โหมดทดลองเล่นคนเดียว • เซฟในเบราว์เซอร์นี้เท่านั้น';
let buildCamera;
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);buildCamera=null}
addEventListener('resize',resize);resize();
function notice(msg){
 const message=String(msg).slice(0,160);
 if(buildDraft){el('buildStatus').textContent=message;return}
 if(el('dialog').open){el('dialogStatus').textContent=message;return}
 const t=el('toast');t.textContent=message;t.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>{t.hidden=true},3500)
}
function lobbyError(t){el('lobbyError').textContent=t||''}
function mine(n){return Math.round(Number(n)||0)}
function hud(){el('money').textContent=`💵 ${mine(ownProfile.money)} บาท`;el('level').textContent=`⭐ Lv.${ownProfile.level}`;const count=online?1+remote.size:1;el('onlineCount').textContent=`👥 ${count}/${MAX_PLAYERS}`;el('hudRoom').textContent=`ชุมชน ${room}`;el('netState').textContent=online?'● ออนไลน์':'● ทดลอง'}
function renderRooms(){const list=el('serverList');list.replaceChildren();for(const id of ROOM_IDS){const r=serverRooms.find(x=>x.id===id);const btn=document.createElement('button');btn.type='button';btn.className='server'+(selectedRoom===id?' selected':'');btn.setAttribute('aria-pressed',selectedRoom===id?'true':'false');
 const icon=document.createElement('span');icon.className='sicon';icon.textContent='🏘️';
 const body=document.createElement('span');body.className='sbody';const title=document.createElement('strong');title.textContent='ชุมชน '+id;const small=document.createElement('small');small.textContent=onlineReady?(r?`มีพื้นที่ว่าง ${MAX_PLAYERS-r.count} แปลง`:'กำลังตรวจสอบสถานะ...'):'ทดลองเล่นในเครื่องเท่านั้น';body.append(title,small);
 const count=document.createElement('span');count.className='count';count.textContent=r?`${r.count}/${r.capacity}`:'—/8';btn.disabled=Boolean(r?.count>=MAX_PLAYERS);btn.append(icon,body,count);btn.onclick=()=>{selectedRoom=id;renderRooms()};list.append(btn)} }
async function firebaseClient(){
 if(!onlineReady)throw Error('ยังขาด Firebase Web API key ใน config.js');
 if(!fbGame){const {FirebaseGame}=await import('./firebase-game.js?v=v5-build-room-2');fbGame=new FirebaseGame(cfg.firebase,onNetwork)}
 await fbGame.ready();return fbGame;
}
async function refreshRooms(){
 if(!onlineReady){serverRooms=[];renderRooms();return}
 try{
   const f=await firebaseClient();
   if(!f.currentUser()){serverRooms=[];lobbyError('เข้าสู่ระบบ Firebase เพื่อดูจำนวนผู้เล่นออนไลน์จริง');}
   else {serverRooms=await f.rooms();lobbyError('')}
 }catch(e){serverRooms=[];lobbyError('ตรวจสอบห้องไม่สำเร็จ: '+e.message)}
 renderRooms();
}
el('refreshRooms').onclick=refreshRooms;
async function authUser(mode){
 const f=await firebaseClient(),email=el('email').value.trim(),password=el('password').value;
 if(mode!=='guest'&&(!email||password.length<6))throw Error('กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัว');
 const user=await f.login(mode,email,password);session=user;lobbyError('');notice(mode==='guest'?'เข้าสู่ระบบชั่วคราวแล้ว':'เข้าสู่ระบบ Firebase สำเร็จ');await refreshRooms();return true;
}
for(const [button,mode] of [['loginAccount','login'],['signupAccount','signup'],['guestAccount','guest']])el(button).onclick=async()=>{
 try{el(button).disabled=true;await authUser(mode)}catch(e){lobbyError('เข้าสู่ระบบไม่ได้: '+e.message)}finally{el(button).disabled=false}
};
async function joinOnline(){
 if(!onlineReady){lobbyError('กรุณาใส่ Firebase Web API key ใน config.js แล้วเปิด Authentication และตั้ง Rules');return}
 const button=el('joinOnline');button.disabled=true;button.textContent='⏳ กำลังโหลดบ้านเดิม...';lobbyError('');
 try{
   const f=await firebaseClient();if(!f.currentUser()){lobbyError('กรุณาเข้าสู่ระบบด้วย Firebase ก่อน');return}
   remote.clear();
   const joined=await f.join(selectedRoom,el('nickname').value.trim().slice(0,18)||'ผู้เล่น');
   online=true;room=joined.room;slot=joined.slot;myId=joined.id;ownProfile=sanitizeState(joined.profile);
   if(hasChosenAppearance())ownProfile.appearance=getChosenAppearance();else useSavedAppearance(ownProfile.appearance);
   onJoined();
   if(hasChosenAppearance())send({type:'appearance',appearance:ownProfile.appearance});
   notice('🏡 โหลดบ้านและโมเดล V4 จาก Firebase แล้ว');
 }catch(e){online=false;lobbyError('เข้าชุมชนไม่สำเร็จ: '+(e.message||String(e)))}
 finally{button.disabled=false;button.textContent='🌍 เข้าชุมชนออนไลน์'}
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
el('playDemo').onclick=()=>{online=false;fbGame?.leave();room=selectedRoom;myId='demo';slot=0;ownProfile=demoData();if(hasChosenAppearance())ownProfile.appearance=getChosenAppearance();else useSavedAppearance(ownProfile.appearance);ownProfile.displayName=(ownProfile.displayName==='ผู้เล่น'?el('nickname').value.trim().slice(0,18)||'ผู้เล่น':ownProfile.displayName);demoSave();remote.clear();onJoined();notice(localNotice)};
function onJoined(){const l=lots[slot];scene='outside';renderedCamera=null;sentMovement=null;resetAvatarMotion();me={x:l.x+247,y:slot<4?l.y+l.h-45:l.y+50,face:Math.PI/2,walking:false,text:'',until:0,pose:'stand'};active=true;el('lobby').hidden=true;for(const id of ['hud','gameHelp','joystick','gameActions','chatForm'])el(id).hidden=false;hud();if(!online)demoSave()}
function trackRemote(player,now){
 if(!Number.isFinite(player.x)||!Number.isFinite(player.y))return;
 const motion=updateRemoteMotion(remote.get(player.id)?.motion,player,now);
 remote.set(player.id,{...player,motion});
}
function onNetwork(m){if(!active&&!['rooms','players'].includes(m.type))return;
 if(m.type==='rooms'){serverRooms=m.rooms;renderRooms()}
 else if(m.type==='players'){
   const players=m.players||[],ids=new Set(players.map(p=>p.id)),now=performance.now();
   for(const id of remote.keys())if(!ids.has(id))remote.delete(id);
   for(const p of players)trackRemote(p,now);
   hud()
 }
 else if(m.type==='disconnected'){notice('Firebase ขาดการเชื่อมต่อ กรุณาเข้าห้องใหม่');leaveGame()}
 else if(m.type==='player'){trackRemote(m.player,performance.now());hud()}
 else if(m.type==='left'){remote.delete(m.id);hud()}
 else if(m.type==='moved'){const p=remote.get(m.id);if(p)trackRemote({...p,x:m.x,y:m.y,scene:m.scene},performance.now())}
 else if(m.type==='said'){const p=remote.get(m.id);if(p)Object.assign(p,{text:m.text,until:m.until})}
 else if(m.type==='profile'){ownProfile=sanitizeState(m.profile);useSavedAppearance(ownProfile.appearance);hud();drawOpenDialog();notice(m.notice||'บันทึกข้อมูลแล้ว')}
 else if(m.type==='homeUpdate'){const p=remote.get(m.id);if(p)p.home=m.home}
 else if(m.type==='notice'){notice(m.message)}
 else if(m.type==='kicked'){notice(m.message);leaveGame()}
 else if(m.type==='error'){notice(m.message)}
}
function send(m){if(online&&fbGame)return Promise.resolve(fbGame.send(m)).catch(e=>notice('ส่งข้อมูลไม่สำเร็จ: '+e.message))}
function action(a){if(['plant','water','harvest'].includes(a?.type)){
  const motion={kind:a.type,started:performance.now(),duration:950};me.action=motion;
  setTimeout(()=>{if(me.action===motion)me.action=null},960);
 }
 if(online)return send({type:'action',action:a});
 const result=applyAction(ownProfile,a);
 if(result.ok){demoSave();hud();drawOpenDialog()}
 notice(result.message)
}
function leaveGame(){closeBuild(false);active=false;online=false;fbGame?.leave();remote.clear();resetAvatarMotion();el('lobby').hidden=false;for(const id of ['hud','gameHelp','joystick','gameActions','chatForm'])el(id).hidden=true;dialogClose();joyReset();refreshRooms()}
el('menuBtn').onclick=()=>{dialogType=null;showDialog('เมนูเกม',d=>{addButton(d,'🎨 แต่งตัวละคร V4',()=>showDialog('🎨 แต่งตัวละคร',panel=>buildAppearanceEditor(panel,applyAvatarAppearance)));addButton(d,'↩️ กลับหน้าเลือกเซิร์ฟเวอร์',()=>leaveGame());addText(d,online?'บ้านและเงินบันทึกไว้ใน Firebase Realtime Database แล้ว':'ข้อมูลทดลองบันทึกในเบราว์เซอร์เครื่องนี้')})};
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
function drawOpenDialog(){if(!el('dialog').open)return;if(dialogType==='inventory')inventory();else if(dialogType==='plot')openPlot(dialogPlot);else if(dialogType==='house')homeDialog();else if(dialogType==='shop')shopDialog()}

function furnitureLabel(type){const item=FURNITURE_TYPES[type];return item?item.emoji+' '+item.label:type}
function cloneFurniture(list){return JSON.parse(JSON.stringify(Array.isArray(list)?list:[]))}
function furnitureInventory(profile=ownProfile){return Object.fromEntries(Object.keys(FURNITURE_TYPES).map(type=>[type,Number(profile.inventory?.furniture?.[type])||0]))}
function inventory(){dialogType='inventory';showDialog('🎒 กระเป๋าของฉัน',d=>{
 addText(d,'เงิน '+ownProfile.money+' บาท · เลเวล '+ownProfile.level+' · EXP '+ownProfile.xp+'/'+ownProfile.level*30);
 const keys=[['hoe','⛏️ จอบเก่า'],['watering_can','💦 บัวรดน้ำ'],['tomato_seed','🌱 เมล็ดมะเขือเทศ'],['tomato','🍅 มะเขือเทศ']];
 const grid=document.createElement('div');grid.className='dialog-grid';for(const [key,label] of keys){const r=document.createElement('div');r.className='dialog-row';r.textContent=label+' × '+(ownProfile.inventory[key]||0);grid.append(r)}
 for(const type of Object.keys(FURNITURE_TYPES)){const r=document.createElement('div');r.className='dialog-row';r.textContent=furnitureLabel(type)+' ในคลัง × '+(ownProfile.inventory.furniture?.[type]||0);grid.append(r)}
 d.append(grid);addButton(d,'🏡 ดูบ้านและร้านเฟอร์นิเจอร์',()=>homeDialog());
})}
const buildPanel = el('buildMode');
const buildFloor = el('buildFloor');
const buildTiles = [];
const stockButtons = new Map();
let hoverTile, savingBuild = false;
let focusedTile = 0;

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
new ResizeObserver(() => { buildCamera = null; }).observe(el('buildDock'));

function buildHome() {
  if (!active || buildDraft) return;
  buildDraft = {furniture: cloneFurniture(ownProfile.home.furniture), inventory: furnitureInventory()};
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
  if (!isValidFurniturePlacement(candidate, buildDraft.furniture, candidate.id)) {
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
  if (!isValidFurniturePlacement(candidate, buildDraft.furniture, current.id)) {
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
  const payload = {type: 'saveHome', furniture: draft.furniture, inventoryFurniture: draft.inventory};
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
  for (const [type, button] of stockButtons) {
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
  notice(savingBuild ? 'กำลังบันทึก…' : selected
    ? FURNITURE_TYPES[selected.type].label + ' · ' + selected.rotation + '° · แตะช่องว่างเพื่อจัดวาง'
    : 'เลือกของจากกระเป๋า หรือแตะเฟอร์นิเจอร์บนพื้นห้อง');
}
function roomBuildCamera() {
  if (buildCamera) return buildCamera;
  const top = el('buildTitle').getBoundingClientRect().bottom + 4;
  const bottom = el('buildDock').getBoundingClientRect().top - 6;
  const centerY = (top + bottom) / 2;
  const zoom = Math.min((w - 12) / 650, Math.max(1, bottom - top) / 430, 1.6);
  buildCamera = {x: 325, y: 215, zoom, centerY};
  Object.assign(buildFloor.style, {
    left: (w / 2 + (HOME_GRID.x - 325) * zoom) + 'px',
    top: (centerY + (HOME_GRID.y - 215) * zoom) + 'px',
    width: HOME_GRID.cols * HOME_GRID.tile * zoom + 'px',
    height: HOME_GRID.rows * HOME_GRID.tile * zoom + 'px'
  });
  return buildCamera;
}

function openPlot(i){if(i<0||i>=PLOT_COUNT)return;dialogType='plot';dialogPlot=i;const p=ownProfile.home.plots[i];const remaining=p.plantedAt+GROW_MS-Date.now();
 showDialog(`🌱 แปลงสวนที่ ${i+1}`,d=>{
 addText(d,p.crop?`ปลูกมะเขือเทศแล้ว${p.watered?' • รดน้ำแล้ว':' • ต้องรดน้ำ'}`:'แปลงว่าง พร้อมปลูกพืช');
 if(!p.crop)addButton(d,`ปลูกเมล็ดมะเขือเทศ (มี ${ownProfile.inventory.tomato_seed})`,()=>action({type:'plant',plot:i}),ownProfile.inventory.tomato_seed<1);
 else if(!p.watered)addButton(d,'💦 รดน้ำ',()=>action({type:'water',plot:i}));
 else {
   const harvest=addButton(d,'🍅 เก็บเกี่ยว +3 ผล / +10 EXP',()=>action({type:'harvest',plot:i}),remaining>0);
   if(remaining>0){
     const wait=addText(d,`รอเก็บเกี่ยวประมาณ ${Math.ceil(remaining/1000)} วินาที`);
     plotReadyTimer=setTimeout(()=>{harvest.disabled=false;wait.remove()},remaining);
   }
 }
 });
}

function homeDialog(){dialogType='house';showDialog('🏡 บ้านของฉัน',d=>{
 const placed=ownProfile.home.furniture||[];const stock=furnitureInventory();addText(d,'ของที่วางแล้ว: '+(placed.map(item=>furnitureLabel(item.type)).join(', ')||'ยังไม่มี'));addText(d,'ของในคลัง: เตียง '+stock.bed+' · เก้าอี้ '+stock.chair);
 addButton(d,'🏗️ เข้าโหมดสร้างบ้าน / จัดวาง',buildHome);
 addButton(d,'🛏️ ซื้อเตียง 45 บาท',()=>action({type:'buy',item:'bed'}),ownProfile.money<45);
 addButton(d,'🪑 ซื้อเก้าอี้ 25 บาท',()=>action({type:'buy',item:'chair'}),ownProfile.money<25)
})}
function shopDialog(){dialogType='shop';showDialog('🏪 ตลาดชุมชน (ตู้บริการอัตโนมัติ)',d=>{
 addText(d,'ไม่มี NPC ขายของในช่วงเริ่มต้น ผู้เล่นซื้อขายได้ที่ตู้บริการ');
 addButton(d,'🌱 ซื้อเมล็ดมะเขือเทศ 5 บาท',()=>action({type:'seed'}),ownProfile.money<5);
 addButton(d,`🍅 ขายมะเขือเทศทั้งหมด × ${ownProfile.inventory.tomato||0} (7 บาท/ผล)`,()=>action({type:'sell'}),!ownProfile.inventory.tomato);
 });}
el('bagBtn').onclick=inventory;
function localLot(){return lots[slot]}
function plotRect(l,i){return {x:l.x+269+(i%2)*94,y:l.y+53+Math.floor(i/2)*65,w:78,h:53}}
const market={x:WORLD.w/2-64,y:588,w:128,h:111};
const plotReach=75;
function distanceToRect(x,y,r){return Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h))}
function plotInReach(r){return distanceToRect(me.x,me.y,r)<=plotReach}
function houseRect(l){return {x:l.x+35,y:l.y+55,w:192,h:165}}
function doorPos(l){return {x:l.x+131,y:l.y+237}}
function nearestInteract(){if(scene==='inside'){
  if(me.pose==='sit'||me.pose==='sleep')return {type:'stand'};
  let nearest=null,distance=90;
  ownProfile.home.furniture.forEach(item=>{
    const r=furnitureRect(item);const tx=r.x+r.w/2,ty=r.y+r.h/2;const gap=Math.hypot(me.x-tx,me.y-ty);
    if(gap<distance){distance=gap;nearest={type:item.type==='bed'?'sleep':'sit',x:tx,y:ty}}
  });
  return nearest||{type:'exit'}
 }const l=localLot();const door=doorPos(l);
 if(Math.hypot(me.x-door.x,me.y-door.y)<110)return {type:'door'};
 let best=-1,dist=Infinity;for(let i=0;i<PLOT_COUNT;i++){const r=plotRect(l,i);const d=Math.hypot(me.x-r.x-r.w/2,me.y-r.y-r.h/2);if(plotInReach(r)&&d<dist){dist=d;best=i}}
 if(best>=0)return {type:'plot',plot:best};
 if(distanceToRect(me.x,me.y,market)<=plotReach)return {type:'shop'};
 return {type:'none'}
}
function interact(act=nearestInteract()){if(act.type==='stand'){me.pose='stand';me.onBed=false;notice('ลุกขึ้นยืนแล้ว');return}
 else if(act.type==='sit'||act.type==='sleep'){me.pose=act.type;me.onBed=act.type==='sleep';me.x=act.x;me.y=act.y;me.walking=false;notice(act.type==='sleep'?'🛏️ นอนพักผ่อนแล้ว':'🪑 นั่งพักผ่อนแล้ว');return}
 if(act.type==='exit'){me.pose='stand';me.onBed=false;scene='outside';const p=doorPos(localLot());me.x=p.x;me.y=p.y+45;notice('ออกจากบ้านแล้ว')}
 else if(act.type==='door'){scene='inside';me.x=325;me.y=300;notice('เข้าบ้านของคุณแล้ว')}
 else if(act.type==='plot')openPlot(act.plot);
 else if(act.type==='shop')shopDialog();
 else notice('เดินเข้าใกล้เตียงบ้าน แปลงสวน หรือร้านกลางชุมชน แล้วกด E')
}
el('interactBtn').onclick=()=>interact();
el('soundBtn').onclick=async()=>{sound=!sound;el('soundBtn').textContent=sound?'🔊 เสียง':'🔇 เสียง';if(sound){try{soundCtx??=new (window.AudioContext||window.webkitAudioContext)();await soundCtx.resume();notice('เปิดเสียงลม นก และฝีเท้าแล้ว')}catch{notice('เบราว์เซอร์นี้ไม่รองรับเสียงประกอบ')}}};
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
el('chatForm').onsubmit=e=>{e.preventDefault();const input=el('chatInput'),t=input.value.trim().slice(0,120);if(!t)return;me.text=t;me.until=Date.now()+5000;if(online)send({type:'say',text:t});input.value='';input.blur();notice('💬 '+t)};
addEventListener('keydown',e=>{
 if(buildDraft){if(e.key==='Escape'){e.preventDefault();cancelBuild()}return}
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
function road(){round(0,0,WORLD.w,WORLD.h,0,'#77a65c');grassTexture(ctx,0,0,WORLD.w,WORLD.h,.8);for(let x=0;x<WORLD.w;x+=110)for(let y=0;y<WORLD.h;y+=110){circle(x+((y/110)%2)*33,y,3,'#689a52')}
 round(0,560,WORLD.w,176,0,'#4e6564');round(0,575,WORLD.w,146,0,'#657578');roadTexture(ctx,0,575,WORLD.w,146,.9);for(let x=10;x<WORLD.w;x+=130)round(x,646,72,6,3,'#f7e6ae');
 line(0,559,WORLD.w,559,'#d7c2a3',10);line(0,735,WORLD.w,735,'#d7c2a3',10);
 round(market.x,market.y,market.w,market.h,10,'#3e5549');text('🏪',WORLD.w/2,625,26);text('ตลาด',WORLD.w/2,656,15);
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
 round(h.x+5,h.y+5,h.w-10,95,9,'#c48155');roofTexture(ctx,h.x+7,h.y+7,h.w-14,91,.9);for(let i=0;i<7;i++)line(h.x+11,h.y+14+i*13,h.x+h.w-11,h.y+14+i*13,'#dba06f',2);
 round(h.x+19,h.y+113,42,31,5,'#c8e8ce');round(h.x+129,h.y+113,42,31,5,'#c8e8ce');round(h.x+96,h.y+141,40,24,5,'#5c463e');
 text('🏠',h.x+h.w/2,h.y+89,31);
 const door=doorPos(l);round(door.x-13,door.y-12,26,18,5,'#a17d5a');
 text('🚪',door.x,door.y+8,19);text(p.name||'ผู้เล่น',l.x+l.w/2,l.y+31,15,'#f2fbec');
}
function drawPlot(l,i,plot,now){const r=plotRect(l,i);round(r.x,r.y,r.w,r.h,8,'#60482f');soilTexture(ctx,r.x+2,r.y+2,r.w-4,r.h-4,.9);for(let j=0;j<3;j++)line(r.x+9,r.y+12+j*15,r.x+r.w-9,r.y+12+j*15,'#82613d',3);
 if(plot?.crop){const grow=plot.watered?Math.min(1,(Date.now()-plot.plantedAt)/GROW_MS):.17;const yy=r.y+r.h/2;const size=12+grow*6;
 for(const ox of [-20,0,20]){line(r.x+r.w/2+ox,yy+12,r.x+r.w/2+ox,yy-7,'#6cad45',4);circle(r.x+r.w/2+ox-5,yy-10,size/2,'#4c994f');if(grow>.92)circle(r.x+r.w/2+ox+7,yy-7,6,'#ee624a')}
 }else text('+',r.x+r.w/2,r.y+r.h/2+6,20,'#d0b888');
 text(String(i+1),r.x+10,r.y+15,10,'#dccfb6')}
function drawEmpty(l){round(l.x,l.y,l.w,l.h,13,'#80a862');round(l.x+20,l.y+20,l.w-40,l.h-40,10,'#81ac67');text('🏡',l.x+l.w/2,l.y+170,42);text('แปลงบ้านว่าง',l.x+l.w/2,l.y+215,17,'#345338');text('รอผู้เล่นเข้าชุมชน',l.x+l.w/2,l.y+242,12,'#46604a');fence(l)}
function worldDraw(now){road();const lotsUsed=new Map([[slot,{name:ownProfile.displayName,home:ownProfile.home}]]);for(const p of remote.values())if(p?.slot>=0&&p?.slot<8)lotsUsed.set(p.slot,{name:p.name,home:p.home});
 for(const l of lots){const u=lotsUsed.get(l.slot);if(!u){drawEmpty(l);continue}round(l.x,l.y,l.w,l.h,12,'#8faf6a');for(let i=0;i<PLOT_COUNT;i++)drawPlot(l,i,u.home?.plots?.[i],now);drawHouse(l,u,now);fence(l)}
 for(const p of remote.values()){
   if(p.scene==='outside')avatar({...p,...sampleRemoteMotion(p.motion,now),positionInterpolated:true},now,false);
 }
 avatar({...me,name:ownProfile.displayName},now,true)
}

function drawBuildGrid() {
 const {x, y, tile, cols, rows} = HOME_GRID;
 const selectedId=selectedFurniture()?.id;
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const item=furnitureAt(col,row);
   const selected=item && item.id===selectedId;
   const tx=x+col*tile+1, ty=y+row*tile+1;
   round(tx,ty,tile-2,tile-2,4,selected?'#e8e18ba8':item?'#60463664':'#329f6aa3');
   ctx.strokeStyle=selected?'#ffeaa4':item?'#9b7757':'#b2ffd1';
   ctx.lineWidth=1.25;
   ctx.stroke();
 }
}
function drawBuildPreview() {
 if (!hoverTile || savingBuild) return;
 const {col,row}=hoverTile;
 const item=furnitureAt(col,row);
 if(item && buildSelection?.kind!=='new')return;
 const candidate=placementAt(col,row);
 if(!candidate)return;
 const valid=isValidFurniturePlacement(candidate,buildDraft.furniture,candidate.id);
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
function indoors(now){round(0,0,650,430,0,'#d6b88e');woodTexture(ctx,0,0,650,430,.87);for(let y=36;y<430;y+=48)line(15,y,635,y,'#c29a76',1);round(0,0,650,43,0,'#836b61');round(0,0,21,430,0,'#927566');round(630,0,20,430,0,'#927566');round(300,408,55,22,3,'#634f45');text('🚪',325,415,21);
 const furniture=buildDraft?.furniture || ownProfile.home.furniture;
 text('บ้านของ '+ownProfile.displayName,325,90,22,'#4b443a');
 if(buildDraft)drawBuildGrid();
 else if(!furniture.length)text('ห้องยังว่างเปล่า — ซื้อของตกแต่งได้',325,170,16,'#7a6650');
 for(const item of [...furniture].sort((a,b) => (a.row+furnitureFootprint(a).h)-(b.row+furnitureFootprint(b).h)))drawFurniture(ctx,item);
 if(buildDraft){drawBuildPreview();return}
 avatar({...me,name:ownProfile.displayName},now,true)
}
function avatar(p,now,local){
  const {x,y}=drawClassicActor(ctx,{...p,scene:local?scene:p.scene,face:local?me.face:p.face},now,local,ownProfile.displayName,ownProfile.appearance);
  const name=String(local?ownProfile.displayName:(p.name||'ผู้เล่น')).slice(0,18);
  round(x-62,y-65,124,20,9,local?'#fff2cf':'#effff5');text(name,x,y-50,11,'#30454b');
  if(p.text&&p.until>Date.now()){const msg=String(p.text).slice(0,40);round(x-119,y-107,238,31,11,'#fff8e9');text(msg,x,y-86,12,'#304849')}
}
function background(now){ctx.fillStyle=buildDraft?'#27423b':'#6b985e';ctx.fillRect(0,0,w,h);const camera=buildDraft?roomBuildCamera():scene==='outside'?{x:me.x,y:me.y,zoom:Math.min(1.0,Math.max(.7,w/830))}:{x:325,y:215,zoom:Math.min(w/670,h/450,1.5)};
 renderedCamera={...camera,scene,w,h};
 ctx.save();ctx.translate(w/2,camera.centerY??h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
 if(scene==='outside'&&!buildDraft)worldDraw(now);else indoors(now);ctx.restore();
 if(buildDraft)return;
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
  const m=Math.hypot(dx,dy);me.walking=m>.07&&!buildDraft&&!el('dialog').open;
   if(me.walking&&me.pose!=='stand'){me.pose='stand';me.onBed=false}
  if(me.walking){dx/=m;dy/=m;const speed=174;
    if(canMove(me.x+dx*speed*dt,me.y))me.x+=dx*speed*dt;
    if(canMove(me.x,me.y+dy*speed*dt))me.y+=dy*speed*dt;
    me.face=Math.atan2(dy,dx);
    if(now-lastStep>210){lastStep=now;playV4Footstep()}
  }
  if(online)publishMovement(now);
  playAmbient(now);
  background(now)
 }else{
   ctx.fillStyle='#14332b';ctx.fillRect(0,0,w,h);
   for(let i=0;i<20;i++){circle(((i*431+now/250*(i%3+1))%w),((i*193+now/800)%h),2,'#b5e6ab33')}
 }
 requestAnimationFrame(tick)
}
requestAnimationFrame(tick);
function publishMovement(now){
 const pose=me.pose||'stand';
 const x=Math.round(me.x),y=Math.round(me.y);
 const changedSceneOrPose=scene!==sentMovement?.scene||pose!==sentMovement?.pose;
 if(!changedSceneOrPose&&(now-lastMove<MOVE_INTERVAL_MS||(x===sentMovement.x&&y===sentMovement.y)))return;
 const movement={type:'move',x,y,scene,pose};
 lastMove=now;sentMovement=movement;
 send(movement);
}
c.addEventListener('pointerup',e=>{
 const camera=renderedCamera;
 if(!active||buildDraft||el('dialog').open||!camera||camera.scene!==scene||camera.w!==w||camera.h!==h)return;
 const bounds=c.getBoundingClientRect();
 const x=((e.clientX-bounds.left)*w/bounds.width-w/2)/camera.zoom+camera.x;
 const y=((e.clientY-bounds.top)*h/bounds.height-h/2)/camera.zoom+camera.y;
 if(scene==='inside'){if(Math.hypot(x-325,y-413)<40)interact({type:'exit'});return}
 const l=localLot();
 for(let i=0;i<PLOT_COUNT;i++){
   const r=plotRect(l,i);
   if(distanceToRect(x,y,r)!==0)continue;
   if(plotInReach(r))openPlot(i);else notice('เดินเข้าใกล้แปลงสวนก่อนครับ');
   return
 }
 if(distanceToRect(x,y,market)===0){
   if(distanceToRect(me.x,me.y,market)<=plotReach)shopDialog();else notice('เดินเข้าใกล้ตลาดก่อนครับ');
   return
 }
 const door=doorPos(l);
 if(Math.hypot(x-door.x,y-door.y)<40){
   if(Math.hypot(me.x-door.x,me.y-door.y)<110)interact({type:'door'});else notice('เดินเข้าใกล้ประตูบ้านก่อนครับ');
 }
});
if(!onlineReady)el('connectionHint').textContent='เชื่อม URL Firebase แล้ว • ยังต้องใส่ Web API key ใน config.js และเปิด Rules; เดโมเล่นได้ทันที';
else el('connectionHint').textContent='เชื่อม Firebase แล้ว • เข้าสู่ระบบเพื่อโหลดเซฟออนไลน์และเข้าชุมชน';
try{el('nickname').value=localStorage.getItem('v5_nickname')||'ผู้เล่น'}catch{}
el('nickname').addEventListener('input',()=>{try{localStorage.setItem('v5_nickname',el('nickname').value)}catch{}});
buildAppearanceEditor(el('avatarFields'),applyAvatarAppearance,{lobby:true});
refreshRooms();setInterval(()=>{if(!active)refreshRooms()},12000);

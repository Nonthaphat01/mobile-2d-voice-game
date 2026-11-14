const EXPANSION_PRICES = [1500, 5000, 20000, 100000, 999999];
const MAX_GARDENERS = 5;
const CROPS = Object.freeze({
  tomato: {name:'มะเขือเทศ',icon:'🍅',seed:5,price:7,grow:60000},
  banana: {name:'กล้วย',icon:'🍌',seed:10,price:14,grow:90000},
  rice: {name:'ข้าว',icon:'🌾',seed:8,price:11,grow:75000},
  watermelon: {name:'แตงโม',icon:'🍉',seed:15,price:21,grow:120000}
});
const cropType = key => Object.hasOwn(CROPS,key) ? key : null;
const estateLevel = value => Number.isInteger(value) ? Math.max(0,Math.min(EXPANSION_PRICES.length,value)) : 0;
const plotCount = level => 10 * 2 ** estateLevel(level);
const emptyPlot = () => ({crop:null,plantedAt:0,watered:false});
const roomSize = level => ({w:650+96*estateLevel(level),h:430+48*estateLevel(level)});
const seedKey = crop => crop+'_seed';
function cropStock(inventory,crop) {
  return crop==='tomato' ? inventory : (inventory.crops[crop] ??= {tomato:0,tomatoGrades:{}});
}
const workersOf = home => [home?.gardener,...(Array.isArray(home?.extraGardeners)?home.extraGardeners:[])].filter(Boolean).slice(0,MAX_GARDENERS);
function setWorkers(home,workers) {
  if(workers.length)home.gardener=workers[0];else delete home.gardener;
  home.extraGardeners=workers.slice(1);
}

const NEEDS_STEP_MS = 5000;
const LOW_NEED = 30;

function normalizeNeeds(saved) {
  const value = key => Number.isFinite(saved?.[key]) ? Math.max(0, Math.min(100, saved[key])) : 100;
  return {happiness:value('happiness'),energy:value('energy'),fullness:value('fullness')};
}

function advanceNeeds(needs, pose, nearPlayer=false) {
  const next = normalizeNeeds(needs);
  next.fullness -= .85;
  next.energy += pose === 'sleep' ? 6 : pose === 'sit' ? 1.5 : -.6;
  next.happiness += (pose === 'sit' ? 8 : pose === 'sleep' ? 1.5 : next.fullness <= LOW_NEED ? -.8 : -.35)+(nearPlayer?1.25:0);
  return normalizeNeeds(next);
}

function fatigueOpacity(elapsed, energy) {
  if (energy >= LOW_NEED || elapsed < 7000) return 0;
  const phase = (elapsed % 7000) / 1250;
  return phase < 1 ? Math.sin(phase * Math.PI) ** 2 * (.10 + .18 * (1 - energy / LOW_NEED)) : 0;
}

function hungerOffset(elapsed, fullness) {
  if (fullness >= LOW_NEED || elapsed < 0 || elapsed % 2600 > 350) return 0;
  const phase = (elapsed % 2600) / 350;
  return Math.sin(phase * Math.PI * 7) * Math.sin(phase * Math.PI) * 2.6;
}

const GARDENER_PLANS = Object.freeze({
  short: {label:'10 นาที',duration:600000,cost:100},
  hour: {label:'1 ชั่วโมง',duration:3600000,cost:500},
  day: {label:'24 ชั่วโมง',duration:86400000,cost:3000}
});
const GARDENER_HEARTBEAT = 15000;
const gardenerPost = lot => ({x:lot.x+63,y:lot.y+253});
const gardenBoxPosition = lot => ({x:lot.x+255,y:lot.y+278});
const GARDEN_STEP_MS = 4500;
const MAX_MONEY = 100000000;
const MAX_PRODUCE = 99999;
const MARKET_HOUR_MS = 600000;
const GRADES = [
  {name:'C', chance:68, min:100, max:100, color:'#d8e4c3'},
  {name:'B', chance:23, min:150, max:150, color:'#8ce0b2'},
  {name:'A', chance:7, min:500, max:500, color:'#a8b8ff'},
  {name:'S', chance:1.8, min:1000, max:5000, color:'#ffd36a'},
  {name:'SS', chance:.2, min:10000, max:99900, color:'#f8a9ff'}
];

function gradeOf(key) {
  const value = Number(key);
  if (!Number.isInteger(value) || String(value) !== String(key)) return undefined;
  if (value > 150 && value % 100 !== 0) return undefined;
  return GRADES.find(grade => value >= grade.min && value <= grade.max);
}

function rollGrade(random = Math.random) {
  let roll = random() * 100;
  for (const grade of GRADES) {
    roll -= grade.chance;
    if (roll < 0 || grade.name === 'SS') {
      return grade.min + 100 * Math.floor(random() * (1 + (grade.max - grade.min) / 100));
    }
  }
}

function marketPrice(key, now = Date.now(), crop='tomato') {
  if (!gradeOf(key)) return 0;
  const rates = [100, 115, 125, 110, 90, 80];
  const rate = rates[Math.floor(now / MARKET_HOUR_MS) % rates.length];
  return Math.max(1, Math.round(CROPS[crop].price * Number(key) * rate / 10000));
}

function normalizeProduce(inventory) {
  const result = {};
  const raw = inventory?.tomatoGrades;
  let remaining = MAX_PRODUCE;
  for (const [key, quantity] of Object.entries(raw || {})) {
    if (!gradeOf(key)) continue;
    const count = Math.max(0, Math.min(remaining, Math.floor(Number(quantity) || 0)));
    if (!count) continue;
    result[key] = count;
    remaining -= count;
  }
  if (!raw) {
    const legacy = Math.max(0, Math.min(remaining, Math.floor(Number(inventory?.tomato) || 0)));
    if (legacy) result[100] = legacy;
  }
  return result;
}

function changeProduce(inventory, key, delta) {
  const quantity = (inventory.tomatoGrades[key] || 0) + delta;
  if (quantity < 0 || inventory.tomato + delta > MAX_PRODUCE) return false;
  if (quantity) inventory.tomatoGrades[key] = quantity;
  else delete inventory.tomatoGrades[key];
  inventory.tomato += delta;
  return true;
}

function gardenerRoute(lot) {
  const gateX = lot.x + 246;
  const top = lot.slot < 4;
  const gateY = top ? lot.y + lot.h : lot.y;
  return [
    {x:lot.x+316, y:gateY+(top?-47:36)},
    {x:gateX, y:gateY+(top?-28:26)},
    {x:gateX, y:top?593:694},
    {x:1200, y:top?593:694}
  ];
}

function gardenerTravelMs(lot) {
  const route = gardenerRoute(lot);
  const distance = route.slice(1).reduce((sum,p,i) => sum+Math.hypot(p.x-route[i].x,p.y-route[i].y),0);
  return Math.ceil(distance / 105 * 1000);
}

function gardenerPosition(lot, worker, now) {
  const route = gardenerRoute(lot);
  if (worker.phase === 'garden' || worker.phase === 'deposit') {
    const index = worker.plot;
    if (index < 0) return gardenBoxPosition(lot);
    const plotAt = i => ({x:lot.x+307+(i%2)*94,y:lot.y+98+Math.floor((i%10)/2)*65});
    const target = plotAt(index);
    const from = worker.fromPlot < 0 ? gardenBoxPosition(lot):plotAt(worker.fromPlot);
    const elapsed=Math.max(0,now-worker.startedAt);
    if(worker.phase==='deposit'&&elapsed>=2000){
      const box=gardenBoxPosition(lot),p=Math.min(1,(elapsed-2000)/2200);
      return {x:target.x+(box.x-target.x)*p,y:target.y+(box.y-target.y)*p,walking:p<1,face:Math.atan2(box.y-target.y,box.x-target.x)};
    }
    const p = Math.min(1,elapsed/(worker.phase==='deposit'?1800:2600));
    const moving=from.x!==target.x||from.y!==target.y;
    return {x:from.x+(target.x-from.x)*p,y:from.y+(target.y-from.y)*p,walking:moving&&p<1,face:Math.atan2(target.y-from.y,target.x-from.x)};
  }
  if (worker.phase === 'outbound' && worker.fromPlot >= 0) {
    const index = worker.fromPlot;
    route.unshift({x:lot.x+270+(index%2)*94, y:lot.y+98+Math.floor(index/2)*65});
  }
  if (worker.phase === 'return') route.reverse();
  const segments = route.slice(1).map((p,i) => Math.hypot(p.x-route[i].x,p.y-route[i].y));
  const progress = Math.max(0,Math.min(1,(now-worker.startedAt)/Math.max(1,worker.nextAt-worker.startedAt)));
  let distance = progress * segments.reduce((sum,len) => sum+len,0);
  for (const [i,len] of segments.entries()) {
    if (distance <= len || i === segments.length-1) {
      const a=route[i], b=route[i+1], p=Math.min(1,distance/len);
      return {x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,walking:progress<1,face:Math.atan2(b.y-a.y,b.x-a.x)};
    }
    distance -= len;
  }
}

const catalog = [
 ['bed','เตียง','🛏️',45,2,1,'bed','#70a99e'],
 ['chair','เก้าอี้','🪑',25,1,1,'chair','#bd8759'],
 ['sofa','โซฟา','🛋️',120,2,1,'seat','#819f89'],
 ['armchair','เก้าอี้นวม','🛋️',75,1,1,'seat','#9b7474'],
 ['stool','ม้านั่งเตี้ย','🪑',20,1,1,'table','#bd9365'],
 ['bench','ม้านั่งไม้','🪵',55,2,1,'table','#9c704d'],
 ['desk','โต๊ะเขียนหนังสือ','🖥️',65,2,1,'table','#a98062'],
 ['coffeeTable','โต๊ะกาแฟ','☕',45,2,1,'table','#8b664f'],
 ['diningTable','โต๊ะกินข้าว','🍽️',85,2,2,'table','#bf9669'],
 ['sideTable','โต๊ะข้างเตียง','🗄️',35,1,1,'table','#998679'],
 ['wardrobe','ตู้เสื้อผ้า','🚪',95,2,1,'cabinet','#ac7857'],
 ['bookshelf','ชั้นหนังสือ','📚',80,2,1,'books','#76543f'],
 ['dresser','ตู้ลิ้นชัก','🗄️',70,2,1,'cabinet','#a58670'],
 ['chest','หีบเก็บของ','📦',45,1,1,'cabinet','#9e643e'],
 ['clock','นาฬิกาตั้งพื้น','🕰️',75,1,1,'clock','#a57751'],
 ['mirror','กระจกตั้งพื้น','🪞',65,1,1,'mirror','#b39e82'],
 ['floorLamp','โคมไฟตั้งพื้น','💡',55,1,1,'lamp','#efce78'],
 ['tableLamp','โคมไฟเล็ก','🏮',32,1,1,'lamp','#ef9e89'],
 ['fern','กระถางเฟิร์น','🪴',28,1,1,'plant','#6f9f50'],
 ['cactus','กระบองเพชร','🌵',25,1,1,'plant','#4ba170'],
 ['flowers','แจกันดอกไม้','💐',30,1,1,'flowers','#ea9ba6'],
 ['rug','พรมทอ','🧶',50,2,2,'rug','#a97f88'],
 ['mat','พรมเช็ดเท้า','🟫',20,1,1,'rug','#c7ab79'],
 ['counter','เคาน์เตอร์ครัว','🍳',90,2,1,'counter','#9db1a9'],
 ['fridge','ตู้เย็น','🧊',125,1,1,'cabinet','#b1ccd5'],
 ['radio','วิทยุไม้','📻',42,1,1,'radio','#c08c60'],
 ['piano','เปียโน','🎹',180,2,1,'piano','#59515a']
];

const FURNITURE_TYPES = Object.freeze(Object.fromEntries(catalog.map(
 ([type,label,emoji,price,width,height,model,color])=>[type,{label,emoji,price,width,height,model,color}]
)));

function furniturePose(item) {
 if(item.type==='bed')return 'sleep';
 return ['chair','sofa','armchair','stool','bench'].includes(item.type)?'sit':null;
}

/** Game state rules shared by the browser and server. */
function homeGrid(level=0){
  const tier=estateLevel(level);
  return {...HOME_GRID,cols:HOME_GRID.cols+2*tier,rows:HOME_GRID.rows+tier};
}
const MAX_PLAYERS = 8;
const PLOT_COUNT = 10;
const ROOM_IDS = ['001', '002', '003'];
const GROW_MS = 60000;
const WORLD = {w:2400,h:1290};
const HOME_GRID = Object.freeze({x:36,y:106,cols:12,rows:6,tile:48});
const lots = Array.from({length:8}, (_,slot)=> ({
  slot,
  x:130+(slot%4)*555,
  y:slot<4?105:755,
  w:495,h:425,
  doorX:130+(slot%4)*555+117,
  doorY:slot<4?105+425:755
}));

/** Original V4 customizable model, sanitized before storing online. */
function sanitizeAppearance(value){
  const defaults={gender:2,skin:1,hair:1,style:0,outfit:0,accessory:0};
  const ranges={gender:3,skin:5,hair:5,style:4,outfit:6,accessory:3};
  const clean={...defaults};
  if(!value||typeof value!=='object')return clean;
  for(const [key,count] of Object.entries(ranges)){
    const n=Number(value[key]);
    if(Number.isInteger(n)&&n>=0&&n<count)clean[key]=n;
  }
  return clean;
}

function isFurnitureType(type){return Object.hasOwn(FURNITURE_TYPES,type)}
function normalizeRotation(value){
  const n=Number(value);
  return [0,90,180,270].includes(n)?n:0;
}
function furnitureFootprint(value){
  const type=typeof value==='string'?value:value?.type;
  const def=isFurnitureType(type)?FURNITURE_TYPES[type]:FURNITURE_TYPES.chair;
  const rotation=normalizeRotation(typeof value==='string'?0:value?.rotation);
  return rotation%180===0?{w:def.width,h:def.height}:{w:def.height,h:def.width};
}
function normalizeFurniture(value,index=0){
  const type=typeof value==='string'?value:value?.type;
  if(!isFurnitureType(type))return null;
  const id=String(typeof value==='object'&&value?.id?value.id:'legacy-'+type+'-'+index)
    .replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'furniture-'+type+'-'+index;
  const col=Number.isInteger(value?.col)?value.col:typeof value==='string'?0:Number(value?.col);
  const row=Number.isInteger(value?.row)?value.row:typeof value==='string'?0:Number(value?.row);
  return {id,type,col:Number.isInteger(col)?col:0,row:Number.isInteger(row)?row:0,rotation:normalizeRotation(value?.rotation)};
}
function isValidFurniturePlacement(candidate,existing=[],ignoreId=null,level=0){
  const p=normalizeFurniture(candidate,0);
  if(!p||p.col<0||p.row<0)return false;
  const footprint=furnitureFootprint(p);
  const grid=homeGrid(level);
  if(p.col+footprint.w>grid.cols||p.row+footprint.h>grid.rows)return false;
  return !existing.some(other=>{
    if(!other||other.id===ignoreId||other.id===p.id)return false;
    const q=normalizeFurniture(other,0);if(!q)return false;
    const size=furnitureFootprint(q);
    return p.col<q.col+size.w&&p.col+footprint.w>q.col&&p.row<q.row+size.h&&p.row+footprint.h>q.row;
  });
}
function firstAvailable(type,existing,index){
  for(let row=0;row<HOME_GRID.rows;row++)for(let col=0;col<HOME_GRID.cols;col++){
    const candidate={id:'legacy-'+type+'-'+index,type,col,row,rotation:0};
    if(isValidFurniturePlacement(candidate,existing))return candidate;
  }
  return null;
}
function sanitizeFurniture(value,level=0){
  const placements=[];
  if(!Array.isArray(value))return placements;
  for(let index=0;index<value.length&&placements.length<homeGrid(level).cols*homeGrid(level).rows;index++){
    const raw=value[index];
    let candidate=normalizeFurniture(raw,index);
    if(typeof raw==='string')candidate=firstAvailable(raw,placements,index);
    if(!candidate||placements.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,placements,null,level))continue;
    placements.push(candidate);
  }
  return placements;
}
function strictFurnitureList(value,level){
  if(!Array.isArray(value)||value.length>homeGrid(level).cols*homeGrid(level).rows)return null;
  const placements=[];
  for(let index=0;index<value.length;index++){
    const candidate=normalizeFurniture(value[index],index);
    if(!candidate||placements.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,placements,null,level))return null;
    placements.push(candidate);
  }
  return placements;
}
function countFurniture(list,type){return list.filter(item=>item.type===type).length}
function clampCount(value){return Math.max(0,Math.min(99999,Math.floor(Number(value)||0)))}

function starter(name='ผู้เล่น') {
  return {
    version:5, displayName:String(name).trim().slice(0,18)||'ผู้เล่น',
    money:100, level:1,xp:0, appearance:sanitizeAppearance(), needs:normalizeNeeds(), needsAt:0,
    playSeconds:0,
    inventory:{hoe:1,watering_can:1,tomato_seed:3,banana_seed:0,rice_seed:0,watermelon_seed:0,crops:{},tomato:0,tomatoGrades:{},furniture:Object.fromEntries(Object.keys(FURNITURE_TYPES).map(type=>[type,0]))},
    home:{expansion:0,furniture:[],gardenBox:{tomato:0,tomatoGrades:{},crops:{}},plots:Array.from({length:PLOT_COUNT},emptyPlot)}
  };
}
function sanitizeState(s,name='ผู้เล่น') {
  if(!s || typeof s!=='object') return starter(name);
  const o=starter(name);
  o.displayName=String(s.displayName||name).slice(0,18);
  o.money=Math.max(0,Math.min(1e8,Number(s.money)||0));
  o.level=Math.max(1,Math.min(99,Number(s.level)||1));
  o.xp=Math.max(0,Math.min(1e7,Number(s.xp)||0));
  o.appearance=sanitizeAppearance(s.appearance);
  o.needs=normalizeNeeds(s.needs);
  o.needsAt=Number.isFinite(s.needsAt)?Math.max(0,s.needsAt):0;
  o.playSeconds=Number.isSafeInteger(s.playSeconds)?Math.max(0,s.playSeconds):0;
  for(const key of ['hoe','watering_can','tomato_seed'])o.inventory[key]=clampCount(s.inventory?.[key]);
  o.inventory.tomatoGrades=normalizeProduce(s.inventory);
  o.inventory.tomato=Object.values(o.inventory.tomatoGrades).reduce((sum,count)=>sum+count,0);
  for(const type of Object.keys(FURNITURE_TYPES))o.inventory.furniture[type]=clampCount(s.inventory?.furniture?.[type]);
  o.home.expansion=estateLevel(s.home?.expansion);
  o.home.furniture=sanitizeFurniture(s.home?.furniture,o.home.expansion);
  for(const crop of Object.keys(CROPS).filter(crop=>crop!=='tomato')){
    o.inventory[seedKey(crop)]=clampCount(s.inventory?.[seedKey(crop)]);
    for(const [destination,source] of [[o.inventory,s.inventory],[o.home.gardenBox,s.home?.gardenBox]]){
      const grades=normalizeProduce(source?.crops?.[crop]);
      if(Object.keys(grades).length)destination.crops[crop]={tomatoGrades:grades,tomato:Object.values(grades).reduce((a,b)=>a+b,0)};
    }
  }
  o.home.gardenBox.tomatoGrades=normalizeProduce(s.home?.gardenBox);
  o.home.gardenBox.tomato=Object.values(o.home.gardenBox.tomatoGrades).reduce((sum,count)=>sum+count,0);
  o.home.plots=Array.from({length:plotCount(o.home.expansion)},(_,i)=>{
    const q=s.home?.plots?.[i];
    return cropType(q?.crop)?{crop:q.crop,plantedAt:Math.max(0,Number(q.plantedAt)||0),watered:q.watered===true}:emptyPlot();
  });
  const workers=[];
  for(const worker of workersOf(s.home).filter(worker=>['garden','deposit','outbound','return'].includes(worker.phase))){
    const plotIndex=i=>Number.isInteger(i)&&i>=0&&i<o.home.plots.length?i:-1;
    workers.push({
      phase:['outbound','return'].includes(worker.phase)?'garden':worker.phase, startedAt:Number.isFinite(worker.startedAt)?Math.max(0,worker.startedAt):0,
      nextAt:Number.isFinite(worker.nextAt)?Math.max(0,worker.nextAt):0,
      contractUntil:Number.isFinite(worker.contractUntil)?Math.max(0,worker.contractUntil):0,
      lastSeenAt:Number.isFinite(worker.lastSeenAt)?Math.max(0,worker.lastSeenAt):0,
      plot:plotIndex(worker.plot),fromPlot:plotIndex(worker.fromPlot),
      slot:Number.isInteger(worker.slot)&&lots[worker.slot]?worker.slot:0
    });
  }
  setWorkers(o.home,workers);
  const receipt=s.home?.gardenerReceipt;
  if(Number.isSafeInteger(receipt?.at)&&receipt.at>0&&Number.isSafeInteger(receipt.gross)&&Number.isSafeInteger(receipt.paid)&&receipt.paid>=0&&receipt.paid<=receipt.gross)
    o.home.gardenerReceipt={at:receipt.at,gross:receipt.gross,paid:receipt.paid,stored:clampCount(receipt.stored),ended:receipt.ended===true};
  return o;
}

function sellProduce(state, grade, now, crop){
  const inventory=cropStock(state.inventory,crop);
  const entries=Object.entries(inventory.tomatoGrades).filter(([key])=>grade===undefined||key===String(grade));
  const total=entries.reduce((sum,[key,quantity])=>sum+marketPrice(key,now,crop)*quantity,0);
  if(!total)return {ok:false,message:'ไม่มีผลผลิตเกรดนี้ในกระเป๋า'};
  if(state.money+total>MAX_MONEY)return {ok:false,message:'เงินจะเกินเพดาน กรุณาขายทีละเกรด'};
  for(const [key,quantity] of entries)changeProduce(inventory,key,-quantity);
  state.money+=total;
  return {ok:true,message:'ขาย'+CROPS[crop].name+' ได้ '+total+' บาท'};
}

function advanceGardener(state, worker, now, random, slot){
  const inventory=state.inventory;
  const plots=state.home.plots;
  const previous=worker.phase==='deposit'?-1:worker.plot;
  const update=(phase,delay,plot=-1,fromPlot=-1)=>Object.assign(worker,{phase,startedAt:now,nextAt:now+delay,plot,fromPlot,slot});
  let plot=plots.findIndex(p=>p.crop&&p.watered&&now-p.plantedAt>=CROPS[p.crop].grow&&cropStock(state.home.gardenBox,p.crop).tomato<=MAX_PRODUCE-3);
  let type='harvest';
  if(plot<0&&inventory.watering_can){plot=plots.findIndex(p=>p.crop&&!p.watered);type='water'}
  const crop=Object.keys(CROPS).find(crop=>inventory[seedKey(crop)]>0);
  if(plot<0&&crop){plot=plots.findIndex(p=>!p.crop);type='plant'}
  if(plot>=0){
    if(type==='harvest'){
      harvestCrop(state,plots[plot],cropStock(state.home.gardenBox,plots[plot].crop),random);
      update('deposit',GARDEN_STEP_MS,plot,previous);
      return;
    }
    applyAction(state,{type,plot,crop},now,random);
    update('garden',GARDEN_STEP_MS,plot,previous);
  }else{
    const next=plots.filter(p=>p.crop&&p.watered).map(p=>p.plantedAt+CROPS[p.crop].grow).filter(at=>at>now);
    update('garden',next.length?Math.max(GARDEN_STEP_MS,Math.min(...next)-now):20000,previous,previous);
  }
}

function settleGardener(state, action, now, random){
  const workers=workersOf(state.home);
  if(!workers.length||!Number.isInteger(action.slot)||!lots[action.slot])return {ok:false,message:''};
  for(const worker of workers){
  if(!worker.contractUntil){
    // Existing permanent hires get a first 10-minute contract without a second fee.
    worker.contractUntil=now+GARDENER_PLANS.short.duration;
    worker.nextAt=now;
    worker.startedAt=now;
    worker.lastSeenAt=now;
  }
  }
  const offline=workers.some(worker=>now-worker.lastSeenAt>GARDENER_HEARTBEAT*1.5||(action.type==='gardenerResume'&&now>worker.lastSeenAt));
  const countStored=()=>Object.keys(CROPS).reduce((sum,crop)=>sum+cropStock(state.home.gardenBox,crop).tomato,0);
  const before=countStored();
  for(const worker of workers)worker.nextAt=Math.max(worker.nextAt,worker.contractUntil-GARDENER_PLANS.day.duration,0);
  for(;;){
    const worker=workers.filter(worker=>worker.nextAt<=Math.min(now,worker.contractUntil)).sort((a,b)=>a.nextAt-b.nextAt)[0];
    if(!worker)break;
    advanceGardener(state,worker,worker.nextAt,random,worker.slot);
  }
  const remaining=workers.filter(worker=>now<worker.contractUntil);
  const ended=remaining.length<workers.length;
  for(const worker of remaining){
    if(worker.slot!==action.slot)Object.assign(worker,{slot:action.slot,phase:'garden',plot:-1,fromPlot:-1,startedAt:now,nextAt:now+GARDEN_STEP_MS});
    worker.lastSeenAt=now;
  }
  setWorkers(state.home,remaining);
  const stored=countStored()-before;
  if(offline&&(stored||ended))state.home.gardenerReceipt={at:now,gross:0,paid:0,stored,ended};
  const message=stored?'คนสวนเก็บผลผลิตเข้ากล่อง '+stored+' ผล':'';
  return {ok:true,message:offline?'':ended?(message?message+' · หมดเวลาจ้าง':'หมดเวลาจ้างคนสวนแล้ว'):message};
}

function harvestCrop(state,plot,destination,random){
  const grade=rollGrade(random);
  if(!changeProduce(destination,grade,3))return null;
  Object.assign(plot,{crop:null,watered:false,plantedAt:0});
  state.xp+=10;
  while(state.xp>=state.level*30){state.xp-=state.level*30;state.level=Math.min(99,state.level+1)}
  return grade;
}

function applyAction(s,action,now=Date.now(),random=Math.random) {
  const items=s.inventory;
  const plotIndex=action?.plot;
  const plot=Number.isInteger(plotIndex)&&plotIndex>=0&&plotIndex<s.home.plots.length?s.home.plots[plotIndex]:null;
  let status='';
  switch(action?.type){
    case 'needsTick':
      if(now-s.needsAt<NEEDS_STEP_MS-250)return {ok:false,message:''};
      s.needs=advanceNeeds(s.needs,action.pose,action.nearPlayer===true);
      s.playSeconds=Math.min(Number.MAX_SAFE_INTEGER,s.playSeconds+NEEDS_STEP_MS/1000);
      s.needsAt=now;
      break;
    case 'eat': {
      if(s.needs.fullness>=100)return {ok:false,message:'ตัวละครอิ่มแล้ว'};
      const key=Object.keys(items.tomatoGrades).find(grade=>items.tomatoGrades[grade]>0);
      if(!key)return {ok:false,message:'ต้องมีมะเขือเทศในกระเป๋า'};
      changeProduce(items,key,-1);
      s.needs=normalizeNeeds({...s.needs,fullness:s.needs.fullness+28,happiness:s.needs.happiness+3});
      status='กินมะเขือเทศแล้ว · ความอิ่มเพิ่มขึ้น';
      break;
    }
    case 'plant': {
      const crop=cropType(action.crop??'tomato');
      if(!crop||!plot||plot.crop||items[seedKey(crop)]<1)return {ok:false,message:'ต้องมีแปลงว่างและเมล็ดพืช'};
      plot.crop=crop;plot.plantedAt=now;plot.watered=false;items[seedKey(crop)]--;status='ปลูก'+CROPS[crop].name+'แล้ว';break;
    }
    case 'water':
      if(!plot || !plot.crop || plot.watered || !items.watering_can)return {ok:false,message:'ไม่สามารถรดน้ำแปลงนี้ได้'};
      plot.watered=true;status='รดน้ำเรียบร้อย';break;
    case 'harvest': {
      if(!plot?.crop || !plot.watered || now-plot.plantedAt<CROPS[plot.crop].grow)return {ok:false,message:'ต้นไม้ยังไม่พร้อมเก็บเกี่ยว'};
      const stock=cropStock(items,plot.crop), name=CROPS[plot.crop].name;
      if(stock.tomato>MAX_PRODUCE-3)return {ok:false,message:'กระเป๋าผลผลิตเต็ม'};
      const grade=harvestCrop(s,plot,stock,random);
      status='เก็บ'+name+' เกรด '+gradeOf(grade).name+' '+(grade/100)+'× จำนวน 3 ผล ได้ 10 EXP';break;
    }
    case 'sell': {
      const crop=cropType(action.crop??'tomato');
      return crop?sellProduce(s,action.grade,now,crop):{ok:false,message:'ไม่พบพืช'};
    }
    case 'collectGardenBox': {
      let collected=0, available=false;
      for(const crop of Object.keys(CROPS)){
      const box=cropStock(s.home.gardenBox,crop), stock=cropStock(items,crop);
      available||=box.tomato>0;
      let space=MAX_PRODUCE-stock.tomato;
      for(const [key,quantity] of Object.entries(box.tomatoGrades)){
        const count=Math.min(space,quantity);
        if(!count)break;
        changeProduce(stock,key,count);
        changeProduce(box,key,-count);
        collected+=count;space-=count;
      }
      }
      if(!collected)return {ok:false,message:available?'กระเป๋าเต็ม':'กล่องยังว่าง'};
      status='รับผลผลิตจากกล่อง '+collected+' ผล';break;
    }
    case 'hireGardener': {
      const plan=Object.hasOwn(GARDENER_PLANS,action.plan)?GARDENER_PLANS[action.plan]:null;
      if(!plan||!Number.isInteger(action.slot)||!lots[action.slot])return {ok:false,message:'กรุณาเลือกเวลาจ้างคนสวน'};
      const workers=workersOf(s.home);
      if(workers.length>=MAX_GARDENERS)return {ok:false,message:'จ้างคนสวนครบแล้ว'};
      if(s.money<plan.cost)return {ok:false,message:'เงินไม่พอจ้างคนสวน'};
      s.money-=plan.cost;
      workers.push({phase:'garden',startedAt:now,nextAt:now+workers.length*1200,contractUntil:now+plan.duration,lastSeenAt:now,plot:-1,fromPlot:-1,slot:action.slot});
      setWorkers(s.home,workers);
      status='จ้างคนสวน '+plan.label+' แล้ว';
      break;
    }
    case 'gardenerResume':
    case 'gardenerStep':
      return settleGardener(s,action,now,random);
    case 'seed': {
      const crop=cropType(action.crop??'tomato'), quantity=action.quantity??1;
      if(!crop||![1,10,100].includes(quantity))return {ok:false,message:'จำนวนหรือชนิดเมล็ดไม่ถูกต้อง'};
      const cost=CROPS[crop].seed*quantity, key=seedKey(crop);
      if(s.money<cost||items[key]+quantity>99999)return {ok:false,message:'เงินไม่พอหรือกระเป๋าเต็ม'};
      s.money-=cost;items[key]+=quantity;status='ซื้อเมล็ด'+CROPS[crop].name+' '+quantity+' ชิ้น';break;
    }
    case 'expandEstate': {
      const level=s.home.expansion, price=EXPANSION_PRICES[level];
      if(!price||action.level!==level||s.money<price)return {ok:false,message:'ซื้อพื้นที่ไม่ได้ กรุณาตรวจสอบราคาและเงิน'};
      s.money-=price;s.home.expansion++;
      while(s.home.plots.length<plotCount(s.home.expansion))s.home.plots.push(emptyPlot());
      status='ขยายบ้านและสวนแล้ว';break;
    }
    case 'buy': {
      const item=String(action.item);const def=isFurnitureType(item)?FURNITURE_TYPES[item]:null;
      if(!def||s.money<def.price)return {ok:false,message:'ซื้อไม่ได้: เงินไม่พอ'};
      items.furniture[item]=clampCount(items.furniture[item])+1;s.money-=def.price;
      status='ซื้อ'+def.label+'เข้ากระเป๋าแล้ว';break;
    }
    case 'placeFurniture': {
      const item=String(action.item);if(!isFurnitureType(item)||items.furniture[item]<1)return {ok:false,message:'ไม่มีเฟอร์นิเจอร์ชิ้นนี้ในกระเป๋า'};
      const candidate=normalizeFurniture({id:action.id,type:item,col:action.col,row:action.row,rotation:action.rotation},s.home.furniture.length);
      if(!candidate||s.home.furniture.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,s.home.furniture,null,s.home.expansion))return {ok:false,message:'ตำแหน่งนี้วางไม่ได้หรือมีของกีดขวาง'};
      s.home.furniture.push(candidate);items.furniture[item]--;status='วาง'+FURNITURE_TYPES[item].label+'แล้ว';break;
    }
    case 'moveFurniture':
    case 'rotateFurniture': {
      const index=s.home.furniture.findIndex(p=>p.id===String(action.id));
      if(index<0)return {ok:false,message:'ไม่พบเฟอร์นิเจอร์ชิ้นนี้'};
      const current=s.home.furniture[index];
      const candidate=normalizeFurniture({...current,col:action.col??current.col,row:action.row??current.row,rotation:action.rotation??(action.type==='rotateFurniture'?current.rotation+90:current.rotation)},index);
      if(!candidate||!isValidFurniturePlacement(candidate,s.home.furniture,current.id,s.home.expansion))return {ok:false,message:'ตำแหน่งนี้วางไม่ได้หรือมีของกีดขวาง'};
      s.home.furniture[index]=candidate;status=action.type==='rotateFurniture'?'หมุนเฟอร์นิเจอร์แล้ว':'ย้ายเฟอร์นิเจอร์แล้ว';break;
    }
    case 'removeFurniture': {
      const index=s.home.furniture.findIndex(p=>p.id===String(action.id));
      if(index<0)return {ok:false,message:'ไม่พบเฟอร์นิเจอร์ชิ้นนี้'};
      const [removed]=s.home.furniture.splice(index,1);items.furniture[removed.type]=clampCount(items.furniture[removed.type])+1;
      status='เก็บเฟอร์นิเจอร์เข้ากระเป๋าแล้ว';break;
    }
    case 'saveHome': {
      const furniture=strictFurnitureList(action.furniture,s.home.expansion);
      const proposed={};for(const type of Object.keys(FURNITURE_TYPES))proposed[type]=clampCount(action.inventoryFurniture?.[type]);
      if(!furniture||Object.values(proposed).some(value=>value>99999))return {ok:false,message:'แบบบ้านไม่ถูกต้อง'};
      for(const type of Object.keys(FURNITURE_TYPES)){
        const currentTotal=items.furniture[type]+countFurniture(s.home.furniture,type);
        if(proposed[type]+countFurniture(furniture,type)!==currentTotal)return {ok:false,message:'รายการเฟอร์นิเจอร์เปลี่ยนระหว่างจัดบ้าน กรุณาเปิดโหมดสร้างใหม่'};
      }
      s.home.furniture=furniture;items.furniture=proposed;status='บันทึกการจัดบ้านแล้ว';break;
    }
    case 'name':
      if(!action.name||String(action.name).trim().length>18)return {ok:false,message:'ชื่อยาวเกินไป'};
      s.displayName=String(action.name).trim();status='บันทึกชื่อแล้ว';break;
    case 'appearance':
      s.appearance=sanitizeAppearance(action.appearance);status='บันทึกตัวละครแล้ว';break;
    default: return {ok:false,message:'คำสั่งไม่รู้จัก'};
  }
  return {ok:true,message:status};
}

const LISTING_DURATION = 86400000;
const MAX_LISTINGS = 80;
const MAX_PER_SELLER = 5;
const fail = message => ({ok:false,message});

// Called inside one transaction containing both players and the listing.
function trade(root, uid, request, now) {
  if (!root?.profiles?.[uid]) return fail('ไม่พบเซฟผู้เล่น');
  const listings = root.marketListings || {};
  const buyer = sanitizeState(root.profiles[uid]);
  const id = request.id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return fail('รหัสรายการไม่ถูกต้อง');
  const listing = Object.hasOwn(listings,id) ? listings[id] : null;

  if (request.type === 'list') {
    const {key, quantity} = request;
    const crop=cropType(request.crop??'tomato');
    if (listing || !crop || !gradeOf(key) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      return fail('จำนวนผลผลิตหรือรายการไม่ถูกต้อง');
    const records = Object.values(listings);
    if (records.length >= MAX_LISTINGS || records.filter(row=>row.seller===uid).length >= MAX_PER_SELLER)
      return fail('พื้นที่ลงขายเต็ม กรุณาเก็บรายการเก่าคืนก่อน');
    if (!changeProduce(cropStock(buyer.inventory,crop),key,-quantity)) return fail('ผลผลิตไม่พอ');
    const unitPrice = marketPrice(key,now,crop);
    listings[id] = {seller:uid, name:buyer.displayName, crop, key:Number(key), quantity, unitPrice, expiresAt:now+LISTING_DURATION};
    root.marketListings = listings;
    root.profiles[uid] = buyer;
    return {ok:true,message:'ลงขายแล้วที่ '+unitPrice+' บาท/ผล'};
  }
  if (!listing) return fail('รายการนี้ถูกซื้อหรือยกเลิกแล้ว');
  const {seller, key, quantity, unitPrice, expiresAt} = listing;
  const crop=cropType(listing.crop??'tomato');
  if(!crop)return fail('ไม่พบพืช');
  const stock=cropStock(buyer.inventory,crop);
  if (!gradeOf(key)||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isInteger(unitPrice)||unitPrice<1)
    return fail('ข้อมูลรายการไม่ถูกต้อง');
  if (request.type === 'cancel') {
    if (seller !== uid) return fail('ยกเลิกได้เฉพาะรายการของคุณ');
    if (!changeProduce(stock,key,quantity)) return fail('กระเป๋าผลผลิตเต็ม');
    delete listings[id];
    root.profiles[uid] = buyer;
    return {ok:true,message:'เก็บผลผลิตคืนเข้ากระเป๋าแล้ว'};
  }
  if (request.type !== 'buy' || seller === uid || now >= expiresAt || !root.profiles[seller])
    return fail('รายการนี้ซื้อไม่ได้');
  const count=request.quantity??quantity;
  if(!Number.isInteger(count)||count<1||count>quantity||(request.quantity!==undefined&&![1,10,100].includes(count)))return fail('จำนวนสินค้าคงเหลือไม่เพียงพอ');
  const price=unitPrice*count;
  if (buyer.money < price) return fail('เงินไม่พอ');
  const sellerProfile = sanitizeState(root.profiles[seller]);
  if (sellerProfile.money+price > MAX_MONEY || stock.tomato+count > MAX_PRODUCE)
    return fail('เงินหรือกระเป๋าผลผลิตจะเกินเพดาน');
  changeProduce(stock,key,count);
  buyer.money -= price;
  sellerProfile.money += price;
  root.profiles[uid] = buyer;
  root.profiles[seller] = sellerProfile;
  if(count===quantity)delete listings[id];else listings[id]={...listing,quantity:quantity-count};
  return {ok:true,message:'ซื้อผลผลิตแล้ว '+price+' บาท'};
}

// This file is bundled with the game's shared trade rules before upload to Apps Script.
const MARKET_ROOT = 'little-neighborhood-v5';
const LISTINGS_TAB = 'ประกาศขาย';
const MARKET_HEADERS = ['รหัสประกาศ','รหัสผู้ขาย','ชื่อตัวละคร','รหัสเกรด','จำนวนผล','ราคา/ผล (บาท)','หมดอายุ (เวลาไทย)'];
const VALID_ACTIONS = new Set(['browse','list','buy','cancel']);
const failure = message => ({ok:false,message});

function settings_() {
  const config = PropertiesService.getScriptProperties().getProperties();
  if (!config.SPREADSHEET_ID || !config.FIREBASE_API_KEY || !config.FIREBASE_PROJECT_ID ||
      !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:firebasedatabase\.app|firebaseio\.com)$/.test(config.FIREBASE_DATABASE_URL || ''))
    throw new Error('ตั้งค่าโครงการร้านค้าไม่ครบ');
  return config;
}

function lookupPlayer_(config, token) {
  if (typeof token !== 'string' || token.length>8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(config.FIREBASE_API_KEY),{
    method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token}),muteHttpExceptions:true
  });
  if (response.getResponseCode()!==200) return null;
  const user = JSON.parse(response.getContentText()).users?.[0];
  const payloadPart=token.split('.')[1];
  const payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(
    payloadPart.padEnd(Math.ceil(payloadPart.length/4)*4,'='))).getDataAsString());
  if (payload.aud!==config.FIREBASE_PROJECT_ID || payload.iss!=='https://securetoken.google.com/'+config.FIREBASE_PROJECT_ID ||
      payload.sub!==user?.localId || user?.disabled || Number(user.validSince||0)>payload.auth_time ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(user?.localId || '')) return null;
  return user.localId;
}

function openFirebase_(config) {
  const url=config.FIREBASE_DATABASE_URL+'/'+MARKET_ROOT+'.json';
  const oauth=ScriptApp.getOAuthToken();
  const responseEtag=response=>{
    const value=Object.entries(response.getAllHeaders()).find(([key])=>key.toLowerCase()==='etag')?.[1];
    return Array.isArray(value)?value[0]:value;
  };
  function read(headers={}) {
    const response=UrlFetchApp.fetch(url+'?format=export',{
      headers:{Authorization:'Bearer '+oauth,'Cache-Control':'no-cache',...headers},muteHttpExceptions:true
    });
    if(response.getResponseCode()!==200)throw Error('อ่านฐานข้อมูลตลาดไม่สำเร็จ');
    return {root:JSON.parse(response.getContentText())||{},etag:responseEtag(response)};
  }
  function put(root,etag) {
    if(!etag)throw Error('ฐานข้อมูลไม่ได้ส่งรหัสรุ่นสำหรับบันทึก');
    const response=UrlFetchApp.fetch(url+'?format=export',{
      method:'put',contentType:'application/json',payload:JSON.stringify(root),
      headers:{Authorization:'Bearer '+oauth,'If-Match':etag,'X-Firebase-ETag':'true'},muteHttpExceptions:true
    });
    if(response.getResponseCode()===412){
      const newest=responseEtag(response);
      return newest?{root:JSON.parse(response.getContentText())||{},etag:newest}:false;
    }
    if(response.getResponseCode()!==200)throw Error('บันทึกการซื้อขายไม่สำเร็จ');
    return true;
  }
  return {read,put};
}

function nearMarket_(root,uid,room,slot) {
  if(!ROOM_IDS.includes(room)||!Number.isInteger(slot)||slot<0||slot>=MAX_PLAYERS)return false;
  const player=root.rooms?.[room]?.slots?.[slot];
  return player?.uid===uid && player.scene==='outside' &&
    Math.hypot(Math.max(1136-player.x,0,player.x-1264),Math.max(588-player.y,0,player.y-699))<=82;
}

function marketOperation_(database,uid,request,now) {
  const {type,room,slot}=request;
  const schema=request.marketSchema===3?3:2;
  let latest;
  for(let attempt=0;attempt<12;attempt++){
    const {root,etag}=latest||database.read(type==='browse'?{}:{'X-Firebase-ETag':'true'});
    if(!nearMarket_(root,uid,room,slot))return failure('เดินไปที่ตลาดกลางก่อน');
    const profile=root.profiles?.[uid];
    if(!profile)return failure('ไม่พบเซฟผู้เล่น');
    const listings=Object.fromEntries(Object.entries(root.marketListings||{}).filter(([id,item])=>
      /^[a-f0-9-]{36}$/.test(id)&&item&&typeof item==='object'&&Number.isFinite(item.expiresAt)));
    if(type==='browse')return {
      ok:true, marketSchema:schema, profile:sanitizeState(profile),
      listings:Object.entries(listings).filter(([,item])=>item&&(schema===3||!item.crop||item.crop==='tomato')&&(item.expiresAt>now||item.seller===uid))
        .map(([id,item])=>({id,sellerKey:item.seller,own:item.seller===uid,name:item.name,crop:item.crop||'tomato',key:item.key,quantity:item.quantity,
          unitPrice:item.unitPrice,expired:item.expiresAt<=now}))
    };
    const listing=listings[request.id];
    if(schema===2&&(request.crop&&request.crop!=='tomato'||listing?.crop&&listing.crop!=='tomato'))return failure('กรุณาอัปเดตเกมก่อนทำรายการ');
    const marketState={profiles:root.profiles,marketListings:listings};
    const result=trade(marketState,uid,request,now);
    if(!result.ok)return result;
    root.marketListings={...root.marketListings,...marketState.marketListings};
    if(!marketState.marketListings[request.id])delete root.marketListings[request.id];
    latest=database.put(root,etag);
    if(latest===true)return {...result,marketSchema:schema,profile:root.profiles[uid]};
  }
  return failure('ตลาดมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองอีกครั้ง');
}

function syncListings() {
  const lock=LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const config=settings_();
    const {root}=openFirebase_(config).read();
    const sheet=SpreadsheetApp.openById(config.SPREADSHEET_ID).getSheetByName(LISTINGS_TAB);
    if(!sheet||JSON.stringify(sheet.getRange(1,1,1,7).getValues()[0])!==JSON.stringify(MARKET_HEADERS))
      throw Error('ไม่พบหัวตารางประกาศขายที่กำหนด');
    const rows=Object.entries(root.marketListings||{})
      .filter(([id,x])=>/^[a-f0-9-]{36}$/.test(id)&&x&&Number.isFinite(x.expiresAt))
      .sort((a,b)=>a[1].expiresAt-b[1].expiresAt)
      .map(([id,x])=>[id,String(x.seller),safeCell_(x.name),x.crop&&x.crop!=='tomato'?x.crop+':'+x.key:x.key,x.quantity,x.unitPrice,new Date(x.expiresAt)]);
    const count=Math.max(rows.length,sheet.getLastRow()-1);
    if(!count)return;
    while(rows.length<count)rows.push(['','','','','','','']);
    sheet.getRange(2,1,count,7).setValues(rows);
    SpreadsheetApp.flush();
  } finally {lock.releaseLock()}
}

function safeCell_(value){
  const text=String(value||'');
  return /^[\s]*[=+@-]/.test(text) ? "'"+text : text;
}

function installListingsSync() {
  syncListings();
  if(!ScriptApp.getProjectTriggers().some(trigger=>trigger.getHandlerFunction()==='syncListings')) {
    ScriptApp.newTrigger('syncListings').timeBased().everyMinutes(5).create();
  }
}

function doPost(event) {
  function json(result){return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)}
  try {
    const body=event?.postData?.contents;
    if(!body||body.length>12000)return json(failure('คำขอร้านค้าไม่ถูกต้อง'));
    const {token,request}=JSON.parse(body);
    if(!request||!VALID_ACTIONS.has(request.type))return json(failure('คำขอร้านค้าไม่ถูกต้อง'));
    const config=settings_();
    const uid=lookupPlayer_(config,token);
    if(!uid)return json(failure('กรุณาเข้าสู่ระบบใหม่'));
    return json(marketOperation_(openFirebase_(config),uid,request,Date.now()));
  } catch {
    return json(failure('ติดต่อร้านค้าไม่สำเร็จ กรุณาลองใหม่'));
  }
}

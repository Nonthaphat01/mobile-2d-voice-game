const NEEDS_STEP_MS = 5000;
const LOW_NEED = 30;

function normalizeNeeds(saved) {
  const value = key => Number.isFinite(saved?.[key]) ? Math.max(0, Math.min(100, saved[key])) : 100;
  return {happiness:value('happiness'),energy:value('energy'),fullness:value('fullness')};
}

function advanceNeeds(needs, pose) {
  const next = normalizeNeeds(needs);
  next.fullness -= .85;
  next.energy += pose === 'sleep' ? 6 : pose === 'sit' ? 1.5 : -.6;
  next.happiness += pose === 'sit' ? 4 : pose === 'sleep' ? .75 : next.fullness <= LOW_NEED ? -.8 : -.35;
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
const GARDENER_OFFLINE_RATE = .8;
const gardenerPost = lot => ({x:lot.x+164,y:lot.y+280});
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

function marketPrice(key, now = Date.now()) {
  if (!gradeOf(key)) return 0;
  const rates = [100, 115, 125, 110, 90, 80];
  const rate = rates[Math.floor(now / MARKET_HOUR_MS) % rates.length];
  return Math.max(1, Math.round(7 * Number(key) * rate / 10000));
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
  if (worker.phase === 'garden') {
    const index = worker.plot;
    if (index < 0) return route[0];
    const target = {x:lot.x+270+(index%2)*94, y:lot.y+98+Math.floor(index/2)*65};
    const from = worker.fromPlot < 0 ? route[0] :
      {x:lot.x+270+(worker.fromPlot%2)*94, y:lot.y+98+Math.floor(worker.fromPlot/2)*65};
    const p = Math.max(0,Math.min(1,(now-worker.startedAt)/2600));
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


/** Game state rules shared by the browser and server. */
const MAX_PLAYERS = 8;
const PLOT_COUNT = 10;
const ROOM_IDS = ['001', '002', '003'];
const GROW_MS = 60000;
const WORLD = {w:2400,h:1290};
const HOME_GRID = Object.freeze({x:36,y:106,cols:12,rows:6,tile:48});
const FURNITURE_TYPES = Object.freeze({
  bed:{price:45,label:'เตียง',emoji:'🛏️',width:2,height:1},
  chair:{price:25,label:'เก้าอี้',emoji:'🪑',width:1,height:1}
});
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
  const def=FURNITURE_TYPES[type]||FURNITURE_TYPES.chair;
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
function isValidFurniturePlacement(candidate,existing=[],ignoreId=null){
  const p=normalizeFurniture(candidate,0);
  if(!p||p.col<0||p.row<0)return false;
  const footprint=furnitureFootprint(p);
  if(p.col+footprint.w>HOME_GRID.cols||p.row+footprint.h>HOME_GRID.rows)return false;
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
function sanitizeFurniture(value){
  const placements=[];
  if(!Array.isArray(value))return placements;
  for(let index=0;index<value.length&&placements.length<HOME_GRID.cols*HOME_GRID.rows;index++){
    const raw=value[index];
    let candidate=normalizeFurniture(raw,index);
    if(typeof raw==='string')candidate=firstAvailable(raw,placements,index);
    if(!candidate||placements.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,placements))continue;
    placements.push(candidate);
  }
  return placements;
}
function strictFurnitureList(value){
  if(!Array.isArray(value)||value.length>HOME_GRID.cols*HOME_GRID.rows)return null;
  const placements=[];
  for(let index=0;index<value.length;index++){
    const candidate=normalizeFurniture(value[index],index);
    if(!candidate||placements.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,placements))return null;
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
    inventory:{hoe:1,watering_can:1,tomato_seed:3,tomato:0,tomatoGrades:{},furniture:{bed:0,chair:0}},
    home:{furniture:[],plots:Array.from({length:PLOT_COUNT},()=>({crop:null,plantedAt:0,watered:false}))}
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
  for(const key of ['hoe','watering_can','tomato_seed'])o.inventory[key]=clampCount(s.inventory?.[key]);
  o.inventory.tomatoGrades=normalizeProduce(s.inventory);
  o.inventory.tomato=Object.values(o.inventory.tomatoGrades).reduce((sum,count)=>sum+count,0);
  for(const type of Object.keys(FURNITURE_TYPES))o.inventory.furniture[type]=clampCount(s.inventory?.furniture?.[type]);
  o.home.furniture=sanitizeFurniture(s.home?.furniture);
  o.home.plots=o.home.plots.map((p,i)=>{const q=s.home?.plots?.[i];return q?.crop==='tomato'?{crop:'tomato',plantedAt:Math.max(0,Number(q.plantedAt)||0),watered:q.watered===true}:p});
  const worker=s.home?.gardener;
  if(worker && ['garden','outbound','return'].includes(worker.phase)){
    const plotIndex=i=>Number.isInteger(i)&&i>=0&&i<PLOT_COUNT?i:-1;
    o.home.gardener={
      phase:worker.phase, startedAt:Number.isFinite(worker.startedAt)?Math.max(0,worker.startedAt):0,
      nextAt:Number.isFinite(worker.nextAt)?Math.max(0,worker.nextAt):0,
      contractUntil:Number.isFinite(worker.contractUntil)?Math.max(0,worker.contractUntil):0,
      lastSeenAt:Number.isFinite(worker.lastSeenAt)?Math.max(0,worker.lastSeenAt):0,
      plot:plotIndex(worker.plot),fromPlot:plotIndex(worker.fromPlot),
      slot:Number.isInteger(worker.slot)&&lots[worker.slot]?worker.slot:0
    };
  }
  const receipt=s.home?.gardenerReceipt;
  if(Number.isSafeInteger(receipt?.at)&&receipt.at>0&&Number.isSafeInteger(receipt.gross)&&Number.isSafeInteger(receipt.paid)&&receipt.paid>=0&&receipt.paid<=receipt.gross)
    o.home.gardenerReceipt={at:receipt.at,gross:receipt.gross,paid:receipt.paid,ended:receipt.ended===true};
  return o;
}

function sellProduce(state, grade, now){
  const inventory=state.inventory;
  const entries=Object.entries(inventory.tomatoGrades).filter(([key])=>grade===undefined||key===String(grade));
  const total=entries.reduce((sum,[key,quantity])=>sum+marketPrice(key,now)*quantity,0);
  if(!total)return {ok:false,message:'ไม่มีมะเขือเทศเกรดนี้ในกระเป๋า'};
  if(state.money+total>MAX_MONEY)return {ok:false,message:'เงินจะเกินเพดาน กรุณาขายทีละเกรด'};
  for(const [key,quantity] of entries)changeProduce(inventory,key,-quantity);
  state.money+=total;
  return {ok:true,message:'ขายมะเขือเทศ ได้ '+total+' บาท'};
}

function advanceGardener(state, now, random, slot, receiveSale){
  const worker=state.home.gardener;
  const inventory=state.inventory;
  const plots=state.home.plots;
  const previous=worker.plot;
  const update=(phase,delay,plot=-1,fromPlot=-1)=>Object.assign(worker,{phase,startedAt:now,nextAt:now+delay,plot,fromPlot,slot});
  if(worker.phase==='outbound'){
    receiveSale(now);
    update('return',gardenerTravelMs(lots[slot]));
    return;
  }
  if(worker.phase==='return'){
    update('garden',GARDEN_STEP_MS);
    return;
  }
  let plot=plots.findIndex(p=>p.crop&&p.watered&&now-p.plantedAt>=GROW_MS&&inventory.tomato<=MAX_PRODUCE-3);
  let type='harvest';
  if(plot<0&&inventory.watering_can){plot=plots.findIndex(p=>p.crop&&!p.watered);type='water'}
  if(plot<0&&inventory.tomato_seed){plot=plots.findIndex(p=>!p.crop);type='plant'}
  if(plot>=0&&(type==='harvest'||!inventory.tomato)){
    applyAction(state,{type,plot},now,random);
    update('garden',GARDEN_STEP_MS,plot,previous);
  }else if(inventory.tomato){
    update('outbound',gardenerTravelMs(lots[slot])+(previous>=0?2600:0),-1,previous);
  }else{
    const next=plots.filter(p=>p.crop&&p.watered).map(p=>p.plantedAt+GROW_MS).filter(at=>at>now);
    update('garden',next.length?Math.max(GARDEN_STEP_MS,Math.min(...next)-now):20000,previous,previous);
  }
}

function settleGardener(state, action, now, random){
  const worker=state.home.gardener;
  if(!worker||!Number.isInteger(action.slot)||!lots[action.slot])return {ok:false,message:''};
  if(!worker.contractUntil){
    // Existing permanent hires get a first 10-minute contract without a second fee.
    worker.contractUntil=now+GARDENER_PLANS.short.duration;
    worker.nextAt=now;
    worker.startedAt=now;
    worker.lastSeenAt=now;
  }
  const gap=now-worker.lastSeenAt;
  const offline=gap>GARDENER_HEARTBEAT*1.5||(action.type==='gardenerResume'&&gap>0);
  const lastSeen=worker.lastSeenAt;
  const cutoff=Math.min(now,worker.contractUntil);
  let gross=0, paid=0, onlinePaid=0;
  const receiveSale=at=>{
    const entries=Object.entries(state.inventory.tomatoGrades);
    const price=entries.reduce((sum,[key,n])=>sum+marketPrice(key,at)*n,0);
    if(!price)return;
    const away=offline&&at>lastSeen;
    const amount=away?Math.floor((gross+price)*GARDENER_OFFLINE_RATE)-paid:price;
    if(state.money+amount>MAX_MONEY)return;
    for(const [key,n] of entries)changeProduce(state.inventory,key,-n);
    state.money+=amount;
    if(away){gross+=price;paid+=amount}else onlinePaid+=amount;
  };
  worker.nextAt=Math.max(worker.nextAt,worker.contractUntil-GARDENER_PLANS.day.duration,0);
  while(worker.nextAt<=cutoff){
    advanceGardener(state,worker.nextAt,random,worker.slot,receiveSale);
  }
  const ended=now>=worker.contractUntil;
  if(ended)delete state.home.gardener;
  else{
    if(worker.slot!==action.slot){
      Object.assign(worker,{slot:action.slot,phase:'garden',plot:-1,fromPlot:-1,startedAt:now,nextAt:now+GARDEN_STEP_MS});
    }
    worker.lastSeenAt=now;
  }
  if(offline&&(gross||ended||gap>=GARDENER_HEARTBEAT))state.home.gardenerReceipt={at:now,gross,paid,ended};
  const message=onlinePaid?'คนสวนขายผลผลิตได้ '+onlinePaid.toLocaleString('th-TH')+' บาท':'';
  return {ok:true,message:ended&&!offline?(message?message+' · หมดเวลาจ้าง':'หมดเวลาจ้างคนสวนแล้ว'):message};
}

function applyAction(s,action,now=Date.now(),random=Math.random) {
  const items=s.inventory;
  const plotIndex=action?.plot;
  const plot=Number.isInteger(plotIndex)&&plotIndex>=0&&plotIndex<PLOT_COUNT?s.home.plots[plotIndex]:null;
  let status='';
  switch(action?.type){
    case 'needsTick':
      if(now-s.needsAt<NEEDS_STEP_MS-250)return {ok:false,message:''};
      s.needs=advanceNeeds(s.needs,action.pose);
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
    case 'plant':
      if(!plot || plot.crop || items.tomato_seed<1)return {ok:false,message:'ต้องมีแปลงว่างและเมล็ดมะเขือเทศ'};
      plot.crop='tomato';plot.plantedAt=now;plot.watered=false;items.tomato_seed--;status='ปลูกมะเขือเทศแล้ว';break;
    case 'water':
      if(!plot || !plot.crop || plot.watered || !items.watering_can)return {ok:false,message:'ไม่สามารถรดน้ำแปลงนี้ได้'};
      plot.watered=true;status='รดน้ำเรียบร้อย';break;
    case 'harvest': {
      if(!plot?.crop || !plot.watered || now-plot.plantedAt<GROW_MS)return {ok:false,message:'ต้นไม้ยังไม่พร้อมเก็บเกี่ยว'};
      if(items.tomato>MAX_PRODUCE-3)return {ok:false,message:'กระเป๋าผลผลิตเต็ม'};
      const grade=rollGrade(random);
      changeProduce(items,grade,3);
      plot.crop=null;plot.watered=false;plot.plantedAt=0;s.xp+=10;
      while(s.xp>=s.level*30){s.xp-=s.level*30;s.level=Math.min(99,s.level+1)}
      status='เก็บมะเขือเทศเกรด '+gradeOf(grade).name+' '+(grade/100)+'× จำนวน 3 ผล ได้ 10 EXP';break;
    }
    case 'sell':
      return sellProduce(s,action.grade,now);
    case 'hireGardener': {
      const plan=Object.hasOwn(GARDENER_PLANS,action.plan)?GARDENER_PLANS[action.plan]:null;
      if(!plan||!Number.isInteger(action.slot)||!lots[action.slot])return {ok:false,message:'กรุณาเลือกเวลาจ้างคนสวน'};
      if(s.home.gardener)return {ok:false,message:'มีคนสวนอยู่แล้ว'};
      if(s.money<plan.cost)return {ok:false,message:'เงินไม่พอจ้างคนสวน'};
      s.money-=plan.cost;
      s.home.gardener={phase:'garden',startedAt:now,nextAt:now,contractUntil:now+plan.duration,lastSeenAt:now,plot:-1,fromPlot:-1,slot:action.slot};
      status='จ้างคนสวน '+plan.label+' แล้ว';
      break;
    }
    case 'gardenerResume':
    case 'gardenerStep':
      return settleGardener(s,action,now,random);
    case 'seed':
      if(s.money<5)return {ok:false,message:'เงินไม่พอซื้อเมล็ด (5 บาท)'};
      s.money-=5;items.tomato_seed++;status='ซื้อเมล็ด 1 ชิ้น';break;
    case 'buy': {
      const item=String(action.item);const def=FURNITURE_TYPES[item];
      if(!def||s.money<def.price)return {ok:false,message:'ซื้อไม่ได้: เงินไม่พอ'};
      items.furniture[item]=clampCount(items.furniture[item])+1;s.money-=def.price;
      status='ซื้อ'+def.label+'เข้ากระเป๋าแล้ว';break;
    }
    case 'placeFurniture': {
      const item=String(action.item);if(!isFurnitureType(item)||items.furniture[item]<1)return {ok:false,message:'ไม่มีเฟอร์นิเจอร์ชิ้นนี้ในกระเป๋า'};
      const candidate=normalizeFurniture({id:action.id,type:item,col:action.col,row:action.row,rotation:action.rotation},s.home.furniture.length);
      if(!candidate||s.home.furniture.some(p=>p.id===candidate.id)||!isValidFurniturePlacement(candidate,s.home.furniture))return {ok:false,message:'ตำแหน่งนี้วางไม่ได้หรือมีของกีดขวาง'};
      s.home.furniture.push(candidate);items.furniture[item]--;status='วาง'+FURNITURE_TYPES[item].label+'แล้ว';break;
    }
    case 'moveFurniture':
    case 'rotateFurniture': {
      const index=s.home.furniture.findIndex(p=>p.id===String(action.id));
      if(index<0)return {ok:false,message:'ไม่พบเฟอร์นิเจอร์ชิ้นนี้'};
      const current=s.home.furniture[index];
      const candidate=normalizeFurniture({...current,col:action.col??current.col,row:action.row??current.row,rotation:action.rotation??(action.type==='rotateFurniture'?current.rotation+90:current.rotation)},index);
      if(!candidate||!isValidFurniturePlacement(candidate,s.home.furniture,current.id))return {ok:false,message:'ตำแหน่งนี้วางไม่ได้หรือมีของกีดขวาง'};
      s.home.furniture[index]=candidate;status=action.type==='rotateFurniture'?'หมุนเฟอร์นิเจอร์แล้ว':'ย้ายเฟอร์นิเจอร์แล้ว';break;
    }
    case 'removeFurniture': {
      const index=s.home.furniture.findIndex(p=>p.id===String(action.id));
      if(index<0)return {ok:false,message:'ไม่พบเฟอร์นิเจอร์ชิ้นนี้'};
      const [removed]=s.home.furniture.splice(index,1);items.furniture[removed.type]=clampCount(items.furniture[removed.type])+1;
      status='เก็บเฟอร์นิเจอร์เข้ากระเป๋าแล้ว';break;
    }
    case 'saveHome': {
      const furniture=strictFurnitureList(action.furniture);
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
    if (listing || !gradeOf(key) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      return fail('จำนวนผลผลิตหรือรายการไม่ถูกต้อง');
    const records = Object.values(listings);
    if (records.length >= MAX_LISTINGS || records.filter(row=>row.seller===uid).length >= MAX_PER_SELLER)
      return fail('พื้นที่ลงขายเต็ม กรุณาเก็บรายการเก่าคืนก่อน');
    if (!changeProduce(buyer.inventory,key,-quantity)) return fail('ผลผลิตไม่พอ');
    const unitPrice = marketPrice(key,now);
    listings[id] = {seller:uid, name:buyer.displayName, key:Number(key), quantity, unitPrice, expiresAt:now+LISTING_DURATION};
    root.marketListings = listings;
    root.profiles[uid] = buyer;
    return {ok:true,message:'ลงขายแล้วที่ '+unitPrice+' บาท/ผล'};
  }
  if (!listing) return fail('รายการนี้ถูกซื้อหรือยกเลิกแล้ว');
  const {seller, key, quantity, unitPrice, expiresAt} = listing;
  if (!gradeOf(key)||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isInteger(unitPrice)||unitPrice<1)
    return fail('ข้อมูลรายการไม่ถูกต้อง');
  if (request.type === 'cancel') {
    if (seller !== uid) return fail('ยกเลิกได้เฉพาะรายการของคุณ');
    if (!changeProduce(buyer.inventory,key,quantity)) return fail('กระเป๋าผลผลิตเต็ม');
    delete listings[id];
    root.profiles[uid] = buyer;
    return {ok:true,message:'เก็บผลผลิตคืนเข้ากระเป๋าแล้ว'};
  }
  if (request.type !== 'buy' || seller === uid || now >= expiresAt || !root.profiles[seller])
    return fail('รายการนี้ซื้อไม่ได้');
  const price = unitPrice*quantity;
  if (buyer.money < price) return fail('เงินไม่พอ');
  const sellerProfile = sanitizeState(root.profiles[seller]);
  if (sellerProfile.money+price > MAX_MONEY || buyer.inventory.tomato+quantity > MAX_PRODUCE)
    return fail('เงินหรือกระเป๋าผลผลิตจะเกินเพดาน');
  changeProduce(buyer.inventory,key,quantity);
  buyer.money -= price;
  sellerProfile.money += price;
  root.profiles[uid] = buyer;
  root.profiles[seller] = sellerProfile;
  delete listings[id];
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
  function read(headers={}) {
    const response=UrlFetchApp.fetch(url+'?format=export',{
      headers:{Authorization:'Bearer '+oauth,...headers},muteHttpExceptions:true
    });
    if(response.getResponseCode()!==200)throw Error('อ่านฐานข้อมูลตลาดไม่สำเร็จ');
    const etag=Object.entries(response.getAllHeaders()).find(([key])=>key.toLowerCase()==='etag')?.[1];
    return {root:JSON.parse(response.getContentText())||{},etag};
  }
  function put(root,etag) {
    if(!etag)throw Error('ฐานข้อมูลไม่ได้ส่งรหัสรุ่นสำหรับบันทึก');
    const response=UrlFetchApp.fetch(url,{
      method:'put',contentType:'application/json',payload:JSON.stringify(root),
      headers:{Authorization:'Bearer '+oauth,'If-Match':etag},muteHttpExceptions:true
    });
    if(response.getResponseCode()===412)return false;
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
  for(let attempt=0;attempt<6;attempt++){
    const {root,etag}=database.read(type==='browse'?{}:{'X-Firebase-ETag':'true'});
    if(!nearMarket_(root,uid,room,slot))return failure('เดินไปที่ตลาดกลางก่อน');
    const profile=root.profiles?.[uid];
    if(!profile)return failure('ไม่พบเซฟผู้เล่น');
    const listings=Object.fromEntries(Object.entries(root.marketListings||{}).filter(([id,item])=>
      /^[a-f0-9-]{36}$/.test(id)&&item&&typeof item==='object'&&Number.isFinite(item.expiresAt)));
    if(type==='browse')return {
      ok:true, profile:sanitizeState(profile),
      listings:Object.entries(listings).filter(([,item])=>item&&(item.expiresAt>now||item.seller===uid))
        .map(([id,item])=>({id,own:item.seller===uid,name:item.name,key:item.key,quantity:item.quantity,
          unitPrice:item.unitPrice,expired:item.expiresAt<=now}))
    };
    const marketState={profiles:root.profiles,marketListings:listings};
    const result=trade(marketState,uid,request,now);
    if(!result.ok)return result;
    root.marketListings={...root.marketListings,...marketState.marketListings};
    if(type==='buy'||type==='cancel')delete root.marketListings[request.id];
    if(database.put(root,etag))return {...result,profile:root.profiles[uid]};
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
      .map(([id,x])=>[id,String(x.seller),safeCell_(x.name),x.key,x.quantity,x.unitPrice,new Date(x.expiresAt)]);
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


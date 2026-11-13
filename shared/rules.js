/** Game state rules shared by the browser and server. */
import {changeProduce, gardenerTravelMs, GARDENER_COST, GARDEN_STEP_MS, gradeOf, marketPrice, MAX_MONEY, MAX_PRODUCE, normalizeProduce, rollGrade} from './farming.js?v=v5-farm-1';
export const MAX_PLAYERS = 8;
export const PLOT_COUNT = 10;
export const ROOM_IDS = ['001', '002', '003'];
export const GROW_MS = 60_000;
export const WORLD = {w:2400,h:1290};
export const HOME_GRID = Object.freeze({x:36,y:106,cols:12,rows:6,tile:48});
export const FURNITURE_TYPES = Object.freeze({
  bed:{price:45,label:'เตียง',emoji:'🛏️',width:2,height:1},
  chair:{price:25,label:'เก้าอี้',emoji:'🪑',width:1,height:1}
});
export const lots = Array.from({length:8}, (_,slot)=> ({
  slot,
  x:130+(slot%4)*555,
  y:slot<4?105:755,
  w:495,h:425,
  doorX:130+(slot%4)*555+117,
  doorY:slot<4?105+425:755
}));

/** Original V4 customizable model, sanitized before storing online. */
export function sanitizeAppearance(value){
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
export function furnitureFootprint(value){
  const type=typeof value==='string'?value:value?.type;
  const def=FURNITURE_TYPES[type]||FURNITURE_TYPES.chair;
  const rotation=normalizeRotation(typeof value==='string'?0:value?.rotation);
  return rotation%180===0?{w:def.width,h:def.height}:{w:def.height,h:def.width};
}
export function normalizeFurniture(value,index=0){
  const type=typeof value==='string'?value:value?.type;
  if(!isFurnitureType(type))return null;
  const id=String(typeof value==='object'&&value?.id?value.id:'legacy-'+type+'-'+index)
    .replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'furniture-'+type+'-'+index;
  const col=Number.isInteger(value?.col)?value.col:typeof value==='string'?0:Number(value?.col);
  const row=Number.isInteger(value?.row)?value.row:typeof value==='string'?0:Number(value?.row);
  return {id,type,col:Number.isInteger(col)?col:0,row:Number.isInteger(row)?row:0,rotation:normalizeRotation(value?.rotation)};
}
export function isValidFurniturePlacement(candidate,existing=[],ignoreId=null){
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
export function sanitizeFurniture(value){
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

export function starter(name='ผู้เล่น') {
  return {
    version:5, displayName:String(name).trim().slice(0,18)||'ผู้เล่น',
    money:100, level:1,xp:0, appearance:sanitizeAppearance(),
    inventory:{hoe:1,watering_can:1,tomato_seed:3,tomato:0,tomatoGrades:{},furniture:{bed:0,chair:0}},
    home:{furniture:[],plots:Array.from({length:PLOT_COUNT},()=>({crop:null,plantedAt:0,watered:false}))}
  };
}
export function sanitizeState(s,name='ผู้เล่น') {
  if(!s || typeof s!=='object') return starter(name);
  const o=starter(name);
  o.displayName=String(s.displayName||name).slice(0,18);
  o.money=Math.max(0,Math.min(1e8,Number(s.money)||0));
  o.level=Math.max(1,Math.min(99,Number(s.level)||1));
  o.xp=Math.max(0,Math.min(1e7,Number(s.xp)||0));
  o.appearance=sanitizeAppearance(s.appearance);
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
      phase:worker.phase, startedAt:Math.max(0,Number(worker.startedAt)||0),
      nextAt:Math.max(0,Number(worker.nextAt)||0),
      plot:plotIndex(worker.plot),fromPlot:plotIndex(worker.fromPlot),
      slot:Number.isInteger(worker.slot)&&lots[worker.slot]?worker.slot:0
    };
  }
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

function advanceGardener(state, now, random, slot){
  const worker=state.home.gardener;
  if(!worker||now<worker.nextAt||!lots[slot])return {ok:false,message:''};
  const inventory=state.inventory;
  const plots=state.home.plots;
  const previous=worker.plot;
  const update=(phase,delay,plot=-1,fromPlot=-1)=>Object.assign(worker,{phase,startedAt:now,nextAt:now+delay,plot,fromPlot,slot});
  if(worker.slot!==slot && worker.phase!=='garden'){
    update('garden',0);
    return {ok:true,message:''};
  }
  if(worker.phase==='outbound'){
    const result=sellProduce(state,undefined,now);
    update('return',gardenerTravelMs(lots[slot]));
    return {ok:true,message:result.ok?'คนสวน: '+result.message:''};
  }
  if(worker.phase==='return'){
    update('garden',GARDEN_STEP_MS);
    return {ok:true,message:''};
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
  return {ok:true,message:''};
}

export function applyAction(s,action,now=Date.now(),random=Math.random) {
  const items=s.inventory;
  const plotIndex=action?.plot;
  const plot=Number.isInteger(plotIndex)&&plotIndex>=0&&plotIndex<PLOT_COUNT?s.home.plots[plotIndex]:null;
  let status='';
  switch(action?.type){
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
    case 'hireGardener':
      if(s.home.gardener||s.money<GARDENER_COST||!Number.isInteger(action.slot)||!lots[action.slot])return {ok:false,message:'จ้างคนสวนไม่ได้'};
      s.money-=GARDENER_COST;
      s.home.gardener={phase:'garden',startedAt:now,nextAt:now,plot:-1,fromPlot:-1,slot:action.slot};
      status='จ้างคนสวนแล้ว';break;
    case 'dismissGardener':
      if(!s.home.gardener)return {ok:false,message:'ยังไม่มีคนสวน'};
      delete s.home.gardener;
      status='หยุดคนสวนแล้ว';break;
    case 'gardenerStep':
      return advanceGardener(s,now,random,action.slot);
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

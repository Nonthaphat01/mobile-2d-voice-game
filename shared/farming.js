export const GARDENER_PLANS = Object.freeze({
  short: {label:'10 นาที',duration:600_000,cost:100},
  hour: {label:'1 ชั่วโมง',duration:3_600_000,cost:500},
  day: {label:'24 ชั่วโมง',duration:86_400_000,cost:3000}
});
export const GARDENER_HEARTBEAT = 15_000;
export const gardenerPost = lot => ({x:lot.x+63,y:lot.y+253});
export const gardenBoxPosition = lot => ({x:lot.x+255,y:lot.y+278});
export const GARDEN_STEP_MS = 4500;
export const MAX_MONEY = 100_000_000;
export const MAX_PRODUCE = 99999;
export const MARKET_HOUR_MS = 600_000;
export const GRADES = [
  {name:'C', chance:68, min:100, max:100, color:'#d8e4c3'},
  {name:'B', chance:23, min:150, max:150, color:'#8ce0b2'},
  {name:'A', chance:7, min:500, max:500, color:'#a8b8ff'},
  {name:'S', chance:1.8, min:1000, max:5000, color:'#ffd36a'},
  {name:'SS', chance:.2, min:10000, max:99900, color:'#f8a9ff'}
];

export function gradeOf(key) {
  const value = Number(key);
  if (!Number.isInteger(value) || String(value) !== String(key)) return undefined;
  if (value > 150 && value % 100 !== 0) return undefined;
  return GRADES.find(grade => value >= grade.min && value <= grade.max);
}

export function rollGrade(random = Math.random) {
  let roll = random() * 100;
  for (const grade of GRADES) {
    roll -= grade.chance;
    if (roll < 0 || grade.name === 'SS') {
      return grade.min + 100 * Math.floor(random() * (1 + (grade.max - grade.min) / 100));
    }
  }
}

export function marketPrice(key, now = Date.now(), crop='tomato') {
  if (!gradeOf(key)) return 0;
  const rates = [100, 115, 125, 110, 90, 80];
  const rate = rates[Math.floor(now / MARKET_HOUR_MS) % rates.length];
  return Math.max(1, Math.round(CROPS[crop].price * Number(key) * rate / 10000));
}

export function normalizeProduce(inventory) {
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

export function changeProduce(inventory, key, delta) {
  const quantity = (inventory.tomatoGrades[key] || 0) + delta;
  if (quantity < 0 || inventory.tomato + delta > MAX_PRODUCE) return false;
  if (quantity) inventory.tomatoGrades[key] = quantity;
  else delete inventory.tomatoGrades[key];
  inventory.tomato += delta;
  return true;
}

export function gardenerRoute(lot) {
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

export function gardenerTravelMs(lot) {
  const route = gardenerRoute(lot);
  const distance = route.slice(1).reduce((sum,p,i) => sum+Math.hypot(p.x-route[i].x,p.y-route[i].y),0);
  return Math.ceil(distance / 105 * 1000);
}

export function gardenerPosition(lot, worker, now, level=0) {
  const plotAt = i => {
    const r=estatePlotRect(lot,i,level);
    return {x:r.x+r.w/2,y:r.y+r.h*.82};
  };
  const route = gardenerRoute(lot);
  if (worker.phase === 'garden' || worker.phase === 'deposit') {
    const index = worker.plot;
    if (index < 0) return gardenBoxPosition(lot);
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
    route.unshift(plotAt(index));
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
import {estatePlotRect} from './estate-layout.js?v=estate-frontage-1';
import {CROPS} from './estate.js?v=estate-1';


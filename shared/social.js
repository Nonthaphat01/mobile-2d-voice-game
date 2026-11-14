export const uidPattern=/^[A-Za-z0-9_-]{1,128}$/;
export const SOCIAL_LIMIT=200;

export function messagePair(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!uidPattern.test(a)||!uidPattern.test(b)||a===b)throw Error('ไม่พบผู้เล่น');
 return [a,b].sort().join('/');
}

export function playerCard(player){
 const number=(value,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,Math.floor(value))):null;
 return {
   id:player.uid??player.id,
   name:String(player.name||'ผู้เล่น').slice(0,18),
   appearance:player.appearance,
   level:number(player.level,99),
   money:number(player.money,100000000),
   playSeconds:number(player.playSeconds,Number.MAX_SAFE_INTEGER)
 };
}

export function groupListings(listings){
 const sellers=new Map();
 for(const row of listings){
   // Old endpoints lack seller identity. Avoid confusing two players with the same name.
   const id=row.own?'own':uidPattern.test(row.sellerKey||'')?row.sellerKey:'legacy:'+row.id;
   if(!sellers.has(id))sellers.set(id,{id,name:row.own?'ร้านของฉัน':String(row.name||'ผู้ขาย'),own:row.own,items:[]});
   sellers.get(id).items.push(row);
 }
 return [...sellers.values()].sort((a,b)=>Number(b.own)-Number(a.own)||a.name.localeCompare(b.name,'th'));
}

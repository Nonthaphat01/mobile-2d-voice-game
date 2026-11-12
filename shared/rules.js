/** Game state rules shared by browser demo and authoritative Node server. */
export const MAX_PLAYERS = 8;
export const PLOT_COUNT = 10;
export const ROOM_IDS = ['001', '002', '003'];
export const GROW_MS = 60_000;
export const WORLD = {w:2400,h:1290};
export const lots = Array.from({length:8}, (_,slot)=> ({
  slot,
  x:130+(slot%4)*555,
  y:slot<4?105:755,
  w:495,h:425,
  doorX:130+(slot%4)*555+117,
  doorY:slot<4?105+425:755
}));
export function starter(name='ผู้เล่น') {
  return {
    version:5, displayName:String(name).trim().slice(0,18)||'ผู้เล่น',
    money:100, level:1,xp:0,
    inventory:{hoe:1,watering_can:1,tomato_seed:3,tomato:0},
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
  for(const key of Object.keys(o.inventory))o.inventory[key]=Math.max(0,Math.min(99999,Math.floor(Number(s.inventory?.[key])||0)));
  o.home.furniture=Array.isArray(s.home?.furniture)?s.home.furniture.filter(v=>['bed','chair'].includes(v)).slice(0,12):[];
  o.home.plots=o.home.plots.map((p,i)=>{const q=s.home?.plots?.[i];return q?.crop==='tomato'?{crop:'tomato',plantedAt:Math.max(0,Number(q.plantedAt)||0),watered:q.watered===true}:p});
  return o;
}
export function applyAction(s,action,now=Date.now()) {
  const items=s.inventory;
  const plotIndex=Number(action?.plot);
  const plot=Number.isInteger(plotIndex)&&plotIndex>=0&&plotIndex<PLOT_COUNT?s.home.plots[plotIndex]:null;
  let status='';
  switch(action?.type){
    case 'plant':
      if(!plot || plot.crop || items.tomato_seed<1)return {ok:false,message:'ต้องมีแปลงว่างและเมล็ดมะเขือเทศ'};
      plot.crop='tomato';plot.plantedAt=now;plot.watered=false;items.tomato_seed--;status='ปลูกมะเขือเทศแล้ว';break;
    case 'water':
      if(!plot || !plot.crop || plot.watered || !items.watering_can)return {ok:false,message:'ไม่สามารถรดน้ำแปลงนี้ได้'};
      plot.watered=true;status='รดน้ำเรียบร้อย';break;
    case 'harvest':
      if(!plot?.crop || !plot.watered || now-plot.plantedAt<GROW_MS)return {ok:false,message:'ต้นไม้ยังไม่พร้อมเก็บเกี่ยว'};
      plot.crop=null;plot.watered=false;plot.plantedAt=0;items.tomato+=3;s.xp+=10;
      while(s.xp>=s.level*30){s.xp-=s.level*30;s.level=Math.min(99,s.level+1)}
      status='เก็บมะเขือเทศ 3 ผล ได้ 10 EXP';break;
    case 'sell':
      if(items.tomato<1)return {ok:false,message:'ไม่มีมะเขือเทศในกระเป๋า'};
      s.money+=items.tomato*7;status=`ขายมะเขือเทศ ได้ ${items.tomato*7} บาท`;items.tomato=0;break;
    case 'seed':
      if(s.money<5)return {ok:false,message:'เงินไม่พอซื้อเมล็ด (5 บาท)'};
      s.money-=5;items.tomato_seed++;status='ซื้อเมล็ด 1 ชิ้น';break;
    case 'buy': {
      const price={bed:45,chair:25};const item=String(action.item);
      if(!(item in price)||s.home.furniture.length>=12||s.money<price[item])return {ok:false,message:'ซื้อไม่ได้: เงินไม่พอหรือบ้านเต็ม'};
      s.home.furniture.push(item);s.money-=price[item];status=`ซื้อ${item==='bed'?'เตียง':'เก้าอี้'}แล้ว`;break;
    }
    case 'name':
      if(!action.name||String(action.name).trim().length>18)return {ok:false,message:'ชื่อยาวเกินไป'};
      s.displayName=String(action.name).trim();status='บันทึกชื่อแล้ว';break;
    default: return {ok:false,message:'คำสั่งไม่รู้จัก'};
  }
  return {ok:true,message:status};
}

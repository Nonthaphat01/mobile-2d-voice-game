export const VEHICLES = Object.freeze({
  bicycle: {name:'จักรยาน',icon:'🚲',price:0,speed:255},
  motorcycle: {name:'มอเตอร์ไซค์',icon:'🏍️',price:15000,speed:365},
  car: {name:'รถยนต์',icon:'🚗',price:10000,speed:320},
  pickup: {name:'รถกระบะ',icon:'🛻',price:100000,speed:350},
  sport: {name:'รถสปอร์ต',icon:'🏎️',price:250000,speed:475},
  van: {name:'รถตู้',icon:'🚐',price:150000,speed:340}
});

export const APPEARANCE_LIMITS = Object.freeze({
  gender:3,skin:10,hair:10,style:10,outfit:10,pants:10,shoes:10,accessory:3
});
export const APPEARANCE_DEFAULTS = Object.freeze({
  gender:2,skin:1,hair:1,style:0,outfit:0,pants:0,shoes:0,accessory:0
});

export const HOME_FINISHES = Object.freeze({
  walls: ['#9d795d','#e4d2b9','#697f73','#526675','#a86459','#dba77d'],
  floors:['#d8b894','#ebe1d2','#9bb8a5','#7f9aab','#cf9483','#dec78a']
});

export function sanitizeGarage(value){
  const owned=['bicycle',...Object.keys(VEHICLES).filter(id=>id!=='bicycle'&&
    ((Array.isArray(value?.owned)&&value.owned.includes(id))||value?.owned?.[id]===true))];
  return {owned,equipped:owned.includes(value?.equipped)?value.equipped:'bicycle'};
}

export const partitionKey=({col,row,edge})=>col+','+row+','+edge;
export function sanitizeArchitecture(value,grid){
  const {cols,rows}=grid;
  const inside=entry=>Number.isInteger(entry?.col)&&entry.col>=0&&entry.col<cols&&
    Number.isInteger(entry.row)&&entry.row>=0&&entry.row<rows;
  const walls=[],tiles=[],edges=new Set(),floors=new Set();
  const validFinish=finish=>Number.isInteger(finish)&&finish>=0&&finish<HOME_FINISHES.walls.length;
  if(Array.isArray(value?.walls))for(const wall of value.walls.slice(0,cols*rows*2+cols+rows)){
    if(!inside(wall)||!['east','south','north','west'].includes(wall.edge)||
      !['wall','door','window'].includes(wall.kind)||!validFinish(wall.finish))continue;
    const {col,row,edge,kind,finish}=wall;
    if((edge==='north'&&row!==0)||(edge==='west'&&col!==0))continue;
    const perimeter=edge==='north'||edge==='west'||(edge==='east'&&col===cols-1)||(edge==='south'&&row===rows-1);
    if((kind==='door'&&perimeter)||(kind==='window'&&!perimeter))continue;
    const key=partitionKey(wall);
    if(edges.has(key))continue;
    edges.add(key);
    walls.push({col,row,edge,kind,finish,open:kind==='door'&&wall.open===true});
  }
  if(Array.isArray(value?.tiles))for(const tile of value.tiles.slice(0,cols*rows)){
    if(!inside(tile)||!Number.isInteger(tile.finish)||tile.finish<0||tile.finish>=HOME_FINISHES.floors.length)continue;
    const key=tile.col+','+tile.row;
    if(floors.has(key))continue;
    floors.add(key);
    tiles.push({col:tile.col,row:tile.row,finish:tile.finish});
  }
  return {walls,tiles};
}

export function partitionLine(part,grid){
  const {tile}=grid;
  let x=grid.x+part.col*tile,y=grid.y+part.row*tile;
  if(part.edge==='east')x+=tile;
  if(part.edge==='south')y+=tile;
  return part.edge==='east'||part.edge==='west'?[x,y,x,y+tile]:[x,y,x+tile,y];
}

export function partitionBlocks(part,grid,x,y,margin=8){
  if(part.kind==='door'&&part.open)return false;
  const [ax,ay,bx,by]=partitionLine(part,grid);
  const dx=Math.max(ax-x,x-bx,0),dy=Math.max(ay-y,y-by,0);
  return Math.hypot(dx,dy)<margin;
}

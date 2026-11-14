import {estateLevel,plotCount} from './estate.js?v=estate-1';

const BED_WIDTH=78,BED_HEIGHT=53,COLUMN_STEP=94,ROW_STEP=65;
const FIELD_COLUMN_STEP=86,AISLE_WIDTH=36;
const columnsByTier=[2,4,6,8,12,16];
const sides=[0,48,78,150,332,520];
const rowsByTier=columnsByTier.map((columns,tier)=>tier?Math.ceil((plotCount(tier)-plotCount(tier-1))/columns):0);
const rearByTier=rowsByTier.map((_,tier)=>tier?60+rowsByTier.slice(1,tier+1).reduce((a,b)=>a+b,0)*ROW_STEP:0);
const LOT_SPACING=1600, BASE_SPACING=555;
const X_MAP=[[0,-2208]];
for(let i=0;i<4;i++){
 const left=130+i*BASE_SPACING,offset=(i-1.5)*(LOT_SPACING-BASE_SPACING);
 if(i===2)X_MAP.push([1200,1200]);
 X_MAP.push([left,left+offset],[left+495,left+495+offset]);
}
X_MAP.push([2400,4608]);
const rear=rearByTier.at(-1);
const Y_MAP=[[0,-rear],[105,105],[1180,1180],[1290,1290+rear]];
export const estateWorld={left:X_MAP[0][1],right:X_MAP.at(-1)[1],top:Y_MAP[0][1],bottom:Y_MAP.at(-1)[1]};

// Keep Firebase's legacy coordinate range, with the market and the road at
// their original Y coordinates and unchanged base-lot offsets.
function project(value,anchors,from){
 const to=1-from;
 let i=1;
 while(i<anchors.length-1&&value>anchors[i][from])i++;
 const a=anchors[i-1],b=anchors[i];
 return a[to]+(value-a[from])*(b[to]-a[to])/(b[from]-a[from]);
}
export const estateToWire=(x,y)=>({x:project(x,X_MAP,1),y:project(y,Y_MAP,1)});
export const estateFromWire=(x,y)=>({x:project(x,X_MAP,0),y:project(y,Y_MAP,0)});
export function mapEstateLot(lot){
 const {x,y}=estateFromWire(lot.x,lot.y);
 return {...lot,x,y};
}

export function estateBounds(lot,level){
 const tier=estateLevel(level),side=sides[tier],back=rearByTier[tier];
 return {
   x:lot.x-side,y:lot.y-(lot.slot<4?back:0),
   w:lot.w+2*side,h:lot.h+back,
   gateX:lot.x+225,gateY:lot.slot<4?lot.y+lot.h:lot.y
 };
}
export function estateFenceSegments(lot,level){
 const {x,y,w,h,gateX,gateY}=estateBounds(lot,level);
 const right=x+w,backY=lot.slot<4?y:y+h;
 const stepY=gateY+(lot.slot<4?-24:24);
 const leftFront=lot.x,rightFront=lot.x+lot.w;
 return [
   [leftFront,gateY,gateX,gateY],[gateX+42,gateY,rightFront,gateY],
   [leftFront,gateY,leftFront,stepY],[rightFront,gateY,rightFront,stepY],
   [leftFront,stepY,x,stepY],[rightFront,stepY,right,stepY],
   [x,stepY,x,backY],[right,stepY,right,backY],[x,backY,right,backY]
 ];
}

export function estateFenceBlocks(lot,x,y,level){
 const margin=11;
 const bounds=estateBounds(lot,level);
 if(x<bounds.x-margin||x>bounds.x+bounds.w+margin||y<bounds.y-margin||y>bounds.y+bounds.h+margin)return false;
 return estateFenceSegments(lot,level).some(([ax,ay,bx,by])=>{
   if(ay===by&&ay===bounds.gateY){
     if(Math.abs(y-ay)>=margin)return false;
     return bx===bounds.gateX ? x>ax-margin&&x<bx+14 : x>ax-14&&x<bx+margin;
   }
   const dx=Math.max(Math.min(ax,bx)-x,0,x-Math.max(ax,bx));
   const dy=Math.max(Math.min(ay,by)-y,0,y-Math.max(ay,by));
   return dx<margin&&dy<margin;
 });
}


const fields=columnsByTier.slice(1).map((columns,i)=>{
 const first=plotCount(i),pairs=first/2,rows=rowsByTier[i+1];
 const pairsPerRow=Math.floor(pairs/rows),extras=pairs%rows;
 let offset=first;
 const beds=Array.from({length:rows},(_,row)=>{
   // Give the outer rows any extra pairs while keeping both sides of the path balanced.
   const rank=Math.min(row,rows-1-row)*2+(row>=rows/2?1:0);
   const half=pairsPerRow+Number(rank<extras);
   const band={first:offset,count:half*2,half};
   offset+=band.count;
   return band;
 });
 return {first,end:first*2,depth:i===0?36:rearByTier[i]-24,rows:beds};
});

export function estateGardenFields(lot,level){
 const centre=lot.x+lot.w/2;
 const rear=lot.slot<4?lot.y:lot.y+lot.h;
 return fields.slice(0,estateLevel(level)).map(field=>{
   const width=(Math.max(...field.rows.map(row=>row.half))-1)*FIELD_COLUMN_STEP*2+BED_WIDTH*2+AISLE_WIDTH;
   const h=(field.rows.length-1)*ROW_STEP+BED_HEIGHT;
   return {x:centre-width/2,y:lot.slot<4?rear-field.depth-h:rear+field.depth,w:width,h,centre};
 });
}

export function estatePlotRect(lot,index){
 if(index<10){
   return {x:lot.x+269+(index%2)*COLUMN_STEP,y:lot.y+53+Math.floor(index/2)*ROW_STEP,w:BED_WIDTH,h:BED_HEIGHT};
 }
 const field=fields.find(field=>index<field.end);
 const row=field.rows.findIndex(row=>index<row.first+row.count);
 const band=field.rows[row],col=index-band.first;
 const centre=lot.x+lot.w/2;
 const x=col<band.half
   ?centre-AISLE_WIDTH/2-BED_WIDTH-(band.half-1-col)*FIELD_COLUMN_STEP
   :centre+AISLE_WIDTH/2+(col-band.half)*FIELD_COLUMN_STEP;
 const y=lot.slot<4
   ?lot.y-field.depth-BED_HEIGHT-row*ROW_STEP
   :lot.y+lot.h+field.depth+row*ROW_STEP;
 return {x,y,w:BED_WIDTH,h:BED_HEIGHT};
}

export function estatePlotIndex(lot,x,y,level){
 const total=plotCount(level);
 for(let index=0;index<total;index++){
   const r=estatePlotRect(lot,index);
   if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return index;
 }
 return -1;
}

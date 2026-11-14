import {estateLevel,plotCount} from './estate.js?v=estate-1';

const sideExpansion=[0,9,13,16,18,20];
const backExpansion=[0,26,40,53,66,78];

export function estateBounds(lot,level){
 const tier=estateLevel(level),side=sideExpansion[tier],back=backExpansion[tier];
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

const columnsByLevel=[2,4,5,8,10,16];
function gardenGrid(lot,level){
 const tier=estateLevel(level),cols=columnsByLevel[tier],count=plotCount(tier);
 if(!tier)return {x:lot.x+269,y:lot.y+53,cols,count,dx:94,dy:65,w:78,h:53};
 const bounds=estateBounds(lot,tier),x=lot.x+263,y=bounds.y+47;
 const dx=(bounds.x+bounds.w-x-12)/cols;
 const dy=(bounds.y+bounds.h-y-30)/Math.ceil(count/cols),gap=cols<=5?7:3;
 return {x,y,cols,count,dx,dy,w:dx-gap,h:dy-gap};
}
export function estatePlotRect(lot,index,level){
 const g=gardenGrid(lot,level);
 return {x:g.x+(index%g.cols)*g.dx,y:g.y+Math.floor(index/g.cols)*g.dy,w:g.w,h:g.h};
}
export function estatePlotIndex(lot,x,y,level){
 const g=gardenGrid(lot,level),col=Math.floor((x-g.x)/g.dx),row=Math.floor((y-g.y)/g.dy);
 const index=row*g.cols+col;
 if(col<0||col>=g.cols||row<0||index>=g.count)return -1;
 if(x-g.x-col*g.dx>g.w||y-g.y-row*g.dy>g.h)return -1;
 return index;
}

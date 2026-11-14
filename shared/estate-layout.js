import {estateLevel,plotCount} from './estate.js?v=estate-1';

export function estateBounds(lot,level){
 const tier=estateLevel(level),side=tier*4,back=tier*14;
 return {
   x:lot.x-side,y:lot.y-(lot.slot<4?back:0),
   w:lot.w+2*side,h:lot.h+back,
   gateX:lot.x+225,gateY:lot.slot<4?lot.y+lot.h:lot.y
 };
}

export function estateFenceBlocks(lot,x,y,level){
 const {x:left,y:top,w,h,gateX,gateY}=estateBounds(lot,level);
 const right=left+w,bottom=top+h,margin=11;
 if(x<left-margin||x>right+margin||y<top-margin||y>bottom+margin)return false;
 if(Math.abs(x-left)<margin||Math.abs(x-right)<margin)return true;
 if(Math.abs(y-top)>=margin&&Math.abs(y-bottom)>=margin)return false;
 return !(Math.abs(y-gateY)<margin&&x>gateX+14&&x<gateX+28);
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

import {estateLevel,plotCount} from './estate.js?v=estate-1';

const columnsByLevel=[2,4,5,8,10,16];
function gardenGrid(lot,level){
 const tier=estateLevel(level),cols=columnsByLevel[tier],count=plotCount(tier);
 if(!tier)return {x:lot.x+269,y:lot.y+53,cols,count,dx:94,dy:65,w:78,h:53};
 const dx=225/cols,dy=345/Math.ceil(count/cols),gap=cols<=5?7:3;
 return {x:lot.x+258,y:lot.y+47,cols,count,dx,dy,w:dx-gap,h:dy-gap};
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

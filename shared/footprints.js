export const FOOTPRINT_LIFETIME=10000;
const STRIDE=24;

export function walkFootprints(){
  const walkers=new Map();
  let marks=[];
  return {
    sample(id,position,now,{place,walking,weather}){
      const {x,y}=position;
      const prior=walkers.get(id);
      const next={x,y,place,time:now,distance:0,side:prior?.side??1};
      walkers.set(id,next);
      if(!walking||!prior||prior.place!==place||now-prior.time>300)return;
      const dx=x-prior.x,dy=y-prior.y,length=Math.hypot(dx,dy);
      if(length>80)return;
      if(!length){next.distance=prior.distance;return}
      const angle=Math.atan2(dy,dx);
      for(let lengthAlong=STRIDE-prior.distance;lengthAlong<=length;lengthAlong+=STRIDE){
        const along=lengthAlong/length;
        marks.push({x:prior.x+dx*along-Math.sin(angle)*next.side*5,
          y:prior.y+dy*along+Math.cos(angle)*next.side*5+15,angle,place,time:now,weather});
        next.side*=-1;
      }
      next.distance=(prior.distance+length)%STRIDE;
    },
    visible(now,place){
      marks=marks.filter(mark=>now-mark.time<FOOTPRINT_LIFETIME);
      for(const [id,actor] of walkers)if(now-actor.time>500)walkers.delete(id);
      return marks.filter(mark=>mark.place===place);
    },
    reset(){marks=[];walkers.clear()}
  };
}

export function drawFootprints(ctx,marks,now){
  ctx.save();
  for(const mark of marks){
    const indoor=mark.place!=='outside';
    const road=!indoor&&mark.y>=560&&mark.y<=736;
    const wet=!indoor&&mark.weather.rain>0;
    const opacity=wet ? .65 : indoor ? .24 : mark.weather.wind>.6 ? .34 : .44;
    ctx.globalAlpha=(1-(now-mark.time)/FOOTPRINT_LIFETIME)*opacity;
    ctx.fillStyle=wet?(road?'#26364d':'#483729'):road?'#283f48':indoor?'#694b39':'#495836';
    const toeX=Math.cos(mark.angle)*2.5,toeY=Math.sin(mark.angle)*2.5;
    ctx.beginPath();
    ctx.ellipse(mark.x+toeX,mark.y+toeY,4,2.4,mark.angle,0,Math.PI*2);
    ctx.moveTo(mark.x-toeX+2.4,mark.y-toeY);
    ctx.ellipse(mark.x-toeX,mark.y-toeY,2.4,1.9,mark.angle,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

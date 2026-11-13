export const MOVE_INTERVAL_MS=100;
const PLAYBACK_DELAY_MS=160;

export function updateRemoteMotion(previous,player,now){
  const latest=previous?.at(-1);
  if(!latest||latest.scene!==player.scene||latest.pose!==player.pose||
     Math.hypot(player.x-latest.x,player.y-latest.y)>100){
    return [{x:player.x,y:player.y,scene:player.scene,pose:player.pose,time:now}];
  }
  if(latest.x===player.x&&latest.y===player.y)return previous;
  // Start a new segment after idle instead of stretching it across the pause.
  const samples=now-latest.time>PLAYBACK_DELAY_MS+MOVE_INTERVAL_MS
    ?[{...latest,time:now-MOVE_INTERVAL_MS}]
    :previous.filter((sample,i)=>i===previous.length-1||previous[i+1].time>=now-PLAYBACK_DELAY_MS);
  samples.push({...latest,x:player.x,y:player.y,time:now});
  return samples;
}

export function sampleRemoteMotion(samples,now){
  const time=now-PLAYBACK_DELAY_MS;
  const nextIndex=samples.findIndex(sample=>sample.time>time);
  const index=nextIndex<0?samples.length-1:Math.max(0,nextIndex-1);
  const from=samples[index],to=nextIndex>0?samples[nextIndex]:null;
  if(!to)return {x:from.x,y:from.y,walking:false};
  const fraction=(time-from.time)/(to.time-from.time);
  return {x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction,walking:true};
}

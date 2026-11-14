export function roomVoice({identity, publish, status, talking}) {
 const senders=new Map(), receivers=new Map();
 let stream=null, context=null, timer=null, lastTalking=false, generation=0;
 const peers=()=>new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 function gathered(peer){
   if(peer.iceGatheringState==='complete')return Promise.resolve();
   return new Promise(resolve=>{
     const done=()=>{clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',change);resolve()};
     const change=()=>{if(peer.iceGatheringState==='complete')done()};
     const timeout=setTimeout(done,3500);
     peer.addEventListener('icegatheringstatechange',change);
   });
 }
 function clear(map,id){
   const item=map.get(id);
   if(!item)return;
   item.peer.close();
   item.audio?.remove();
   map.delete(id);
 }
 function stop(){
   generation++;
   clearInterval(timer);
   stream?.getTracks().forEach(track=>track.stop());
   stream=null;
   context?.close().catch(()=>{});
   context=null;
   for(const id of senders.keys())clear(senders,id);
   talking(false);lastTalking=false;
   publish({voiceEnabled:null,voiceOffers:null,voiceTalking:null});
   status(false);
 }
 async function toggle(players){
   if(stream){stop();return}
   if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('เบราว์เซอร์นี้เปิดไมค์ในเกมไม่ได้');
   const version=++generation;
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(version!==generation){media.getTracks().forEach(track=>track.stop());return}
   stream=media;status(true);
   publish({voiceEnabled:true});
   stream.getAudioTracks()[0].onended=stop;
   try{
     context=new AudioContext();
     await context.resume();
     if(version!==generation)return;
     const analyser=context.createAnalyser();
     context.createMediaStreamSource(stream).connect(analyser);
     const samples=new Uint8Array(analyser.fftSize);
     timer=setInterval(()=>{
       analyser.getByteTimeDomainData(samples);
       const rms=Math.sqrt(samples.reduce((sum,x)=>sum+((x-128)/128)**2,0)/samples.length);
       const speaking=rms>.025;
       if(speaking===lastTalking)return;
       lastTalking=speaking;talking(speaking);
       publish({voiceTalking:speaking||null});
     },140);
   }catch{}
   sync(players());
 }
 async function offer(id){
   const peer=peers(), token=crypto.randomUUID();
   senders.set(id,{peer,token});
   for(const track of stream.getAudioTracks())peer.addTrack(track,stream);
   await peer.setLocalDescription(await peer.createOffer());
   await gathered(peer);
   if(senders.get(id)?.token===token)publish({['voiceOffers/'+id]:{token,sdp:peer.localDescription.sdp}});
 }
 async function answer(id,offer){
   clear(receivers,id);
   const peer=peers(), audio=document.createElement('audio'), token=offer.token;
   audio.autoplay=true;audio.hidden=true;document.body.append(audio);
   receivers.set(id,{peer,audio,token});
   peer.ontrack=event=>{audio.srcObject=event.streams[0];audio.play().catch(()=>{})};
   await peer.setRemoteDescription({type:'offer',sdp:offer.sdp});
   await peer.setLocalDescription(await peer.createAnswer());
   await gathered(peer);
   if(receivers.get(id)?.token===token)publish({['voiceAnswers/'+id]:{token,sdp:peer.localDescription.sdp}});
 }
 const valid=value=>typeof value?.token==='string'&&typeof value?.sdp==='string'&&value.sdp.length<=16000;
 function sync(players){
   if(!window.RTCPeerConnection)return;
   const self=identity();
   const ids=new Set(players.map(player=>player.id));
   for(const id of senders.keys())if(!ids.has(id)){clear(senders,id);publish({['voiceOffers/'+id]:null})}
   for(const id of receivers.keys())if(!ids.has(id)){clear(receivers,id);publish({['voiceAnswers/'+id]:null})}
   for(const player of players){
     const id=player.id;
     if(!/^[\w-]{1,128}$/.test(id))continue;
     if(stream&&!senders.has(id))offer(id).catch(()=>clear(senders,id));
     const sent=senders.get(id), reply=player.voiceAnswers?.[self];
     if(sent&&!sent.answered&&reply?.token===sent.token&&valid(reply)){
       sent.answered=true;
       sent.peer.setRemoteDescription({type:'answer',sdp:reply.sdp}).catch(()=>clear(senders,id));
     }
     const incoming=player.voiceOffers?.[self];
     if(player.voiceEnabled&&valid(incoming)){
       if(receivers.get(id)?.token!==incoming.token)answer(id,incoming).catch(()=>clear(receivers,id));
     }else if(receivers.has(id)){clear(receivers,id);publish({['voiceAnswers/'+id]:null})}
   }
 }
 return {sync,toggle,close(){stop();for(const id of receivers.keys())clear(receivers,id)}};
}

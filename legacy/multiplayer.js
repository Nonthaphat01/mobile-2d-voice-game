'use strict';

// PeerJS rooms, player state, chat and microphone audio.

const others=new Map(),connections=new Map(),calls=new Map(),incomingCalls=new Map(),audios=new Map();let peer=null,myId='',hostId='',roomCode='',isHost=false,localStream=null,recognition=null,recStop=false,speakerOn=true,analyser=null,audioCtx=null,frame=0,lastVoiceSignal=0,voiceActive=false;const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

function status(){updateMineResetButton();const n=1+others.size;$('count').textContent=roomCode?'ในห้อง '+n+' คน':'เล่นคนเดียว';$('state').textContent=roomCode?'ห้อง '+roomCode+(isHost?' (เจ้าของห้อง)':[...connections.values()].some(c=>c.open)?' • เชื่อมต่อแล้ว':' • กำลังเชื่อมต่อ...'):'ยังไม่ได้เข้าห้อง'}function color(id){let n=0;for(const c of id)n=(n*31+c.charCodeAt(0))>>>0;return ['#527bea','#e27a89','#6fbd84','#c49a55','#aa80d6','#61b7c2'][n%6]}
function cleanName(t){return String(t||'ผู้เล่น').trim().slice(0,14)||'ผู้เล่น'}function code(t){return String(t||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24)}function idForRoom(c){return 'thai2droom-v8-'+c}function rand(){return Math.random().toString(36).slice(2,8)}

// MINE WORLD: Each new rock tile removed permanently expands the walkable cave.

function sendTo(id,msg){const c=connections.get(id);if(c?.open)try{c.send(msg)}catch(e){}}function broadcast(msg){for(const id of connections.keys())sendTo(id,msg)}function snapshot(){return {type:'state',id:myId,x:Math.round(me.x),y:Math.round(me.y),face:me.face,name:me.name,text:me.text,until:me.until,talking:voiceActive,pose:me.pose,poseMotion:poseMotionPacket(),walking:me.walking,swimming:!!me.swimming,onBed:!!me.onBed,scene,tool:selectedTool,appearance:me.appearance,activity:activitySnapshot(),vehicle:vehiclePacket(),swing:performance.now()<rockSwingUntil}}
function updateOther(msg){if(!msg.id||msg.id===myId)return;let p=others.get(msg.id)||{x:390,y:300,name:'ผู้เล่น',face:0,color:color(msg.id),text:'',until:0};if(['mine','room','outside'].includes(msg.scene))p.scene=msg.scene;const bound=p.scene==='mine'?MINE.cols*MINE.tile-40:p.scene==='outside'?TOWN.w-24:740,maxY=p.scene==='mine'?MINE.rows*MINE.tile-40:p.scene==='outside'?TOWN.h-24:510;if(Number.isFinite(msg.x))p.x=Math.max(p.scene==='outside'?24:40,Math.min(bound,msg.x));if(Number.isFinite(msg.y))p.y=Math.max(p.scene==='outside'?24:40,Math.min(maxY,msg.y));if(Number.isFinite(msg.face))p.face=msg.face;if(msg.name!==undefined)p.name=cleanName(msg.name);if(['stand','sit','sleep'].includes(msg.pose))p.pose=msg.pose;if(typeof msg.walking==='boolean')p.walking=msg.walking;if(Number.isInteger(msg.tool)&&msg.tool>=0&&msg.tool<3)p.tool=msg.tool;if(typeof msg.swing==='boolean')p.swing=msg.swing;if(msg.talking!==undefined){p.talking=!!msg.talking;p.voiceSeen=Date.now()}if(msg.text!==undefined){p.text=String(msg.text).slice(0,120);p.until=Number(msg.until)||0}p.swimming=p.scene==='outside'&&msg.swimming===true&&!!waterAt(p.x,p.y);p.onBed=p.pose==='sleep'&&msg.onBed===true;if(msg.appearance)p.appearance=cleanAppearance(msg.appearance);readPoseMotion(p,msg.poseMotion);readActivity(p,msg.activity);readVehicleState(p,msg.vehicle,msg.id);others.set(msg.id,p);status()}
function connectTo(id){if(!peer||!id||id===myId||connections.has(id))return;attach(peer.connect(id,{reliable:true}))}
function attach(c){if(connections.has(c.peer)){c.close();return}const earlier=[...connections.keys()];connections.set(c.peer,c);c.on('open',()=>{sendTo(c.peer,snapshot());if(isHost){sendTo(c.peer,{type:'roster',ids:earlier.filter(id=>connections.has(id))});sendTo(c.peer,mineWorldPacket())}toast('✅ เชื่อมต่อผู้เล่น '+c.peer.slice(-6)+' แล้ว');status();if(localStream)callPeer(c.peer)});c.on('data',m=>{if(!m||typeof m!=='object')return;if(m.type==='state'){m.id=c.peer;updateOther(m)}else if(isVehicleMessage(m.type)){handleVehicleMessage(c.peer,m)}else if(m.type==='caption'){let p=others.get(c.peer)||{x:390,y:300,name:'ผู้เล่น',color:color(c.peer)};p.text=String(m.text||'').slice(0,120);p.until=Date.now()+5000;others.set(c.peer,p)}else if(m.type==='voice'){let p=others.get(c.peer)||{x:390,y:300,name:'ผู้เล่น',color:color(c.peer)};p.talking=!!m.active;p.voiceSeen=Date.now();others.set(c.peer,p)}else if(m.type==='roster'&&c.peer===hostId&&Array.isArray(m.ids)){m.ids.slice(0,16).forEach(connectTo)}else if(m.type==='minehit'&&isCurrentMineChange(m)){applyRemoteMineHit(Number(m.idx),m.amount)}else if(m.type==='minebreak'&&isCurrentMineChange(m)){mineBreak(Number(m.idx),false)}else if(m.type==='minesync'){acceptMineWorld(c.peer,m)}});const remove=()=>{if(connections.get(c.peer)===c)removePeer(c.peer)};c.on('close',remove);c.on('error',remove)}
function removePeer(id){vehiclePeerLeft(id);connections.delete(id);others.delete(id);calls.get(id)?.close();calls.delete(id);incomingCalls.get(id)?.close();incomingCalls.delete(id);audios.get(id)?.remove();audios.delete(id);status();if(id===hostId&&!isHost)toast('เจ้าของห้องออกแล้ว ผู้เล่นที่เชื่อมต่อกันอาจยังคุยต่อได้')}function closeAll(){clearVehicleConnections();for(const c of connections.values())c.close();connections.clear();for(const c of calls.values())c.close();calls.clear();for(const c of incomingCalls.values())c.close();incomingCalls.clear();for(const a of audios.values())a.remove();audios.clear();others.clear();if(peer){peer.destroy();peer=null}endRoomMine();hostId='';roomCode='';isHost=false;status()}
function updateRoomUrl(value){
 const url=new URL(location.href);
 if(value)url.searchParams.set('room',value);else url.searchParams.delete('room');
 try{history.replaceState(null,'',url.href)}catch{}
}
let peerLibraryRequest=null,roomRequest=0;
function loadPeerLibrary(){
 if(typeof Peer==='function')return Promise.resolve();
 if(peerLibraryRequest)return peerLibraryRequest;
 peerLibraryRequest=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
   const fail=()=>{
     clearTimeout(timeout);
     script.remove();
     reject(new Error('โหลดระบบออนไลน์ไม่สำเร็จ'));
   };
   const timeout=setTimeout(fail,12000);
   script.onerror=fail;
   script.onload=()=>{
     clearTimeout(timeout);
     if(typeof Peer==='function')resolve();else fail();
   };
   document.head.append(script);
 }).finally(()=>{peerLibraryRequest=null});
 return peerLibraryRequest;
}
async function initPeer(requested,host){
 const request=++roomRequest;
 const joinCode=code($('room').value);
 if(typeof Peer!=='function'){
   toast('กำลังโหลดระบบออนไลน์…');
   try{await loadPeerLibrary()}catch{
     if(request===roomRequest)toast('โหลดระบบออนไลน์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
     return;
   }
   if(request!==roomRequest)return;
 }
 closeAll();
 isHost=host;
 peer=new Peer(requested||undefined,{debug:0});
 peer.on('open',id=>{
   myId=id;
   if(host){
     hostId=id;roomCode=requested.replace('thai2droom-v8-','');
     beginHostedMine();updateRoomUrl(roomCode);
     toast('ห้องพร้อมแล้ว! กดคัดลอกลิงก์เพื่อชวนเพื่อน');
   }else{
     roomCode=joinCode;hostId=idForRoom(roomCode);connectTo(hostId);
     toast('กำลังเข้าห้อง '+roomCode);
   }
   status();
 });
 peer.on('connection',attach);
 peer.on('call',call=>{
 if(!connections.has(call.peer)){call.close();return}
 incomingCalls.get(call.peer)?.close();
 incomingCalls.set(call.peer,call);
 wireCall(call);
 try{call.answer()}catch(e){incomingCalls.delete(call.peer);call.close();toast('รับสายเสียงไม่สำเร็จ')}
});peer.on('error',e=>{toast('เชื่อมต่อไม่สำเร็จ: '+(e.type==='unavailable-id'?'รหัสห้องถูกใช้แล้ว':e.type));if(e.type==='peer-unavailable')toast('ไม่พบห้องนี้ ตรวจสอบรหัสหรือให้เจ้าของห้องออนไลน์')});peer.on('disconnected',()=>toast('การเชื่อมต่อขาดชั่วคราว กำลังลองเชื่อมใหม่'));}
$('leaveRoom').onclick=()=>{roomRequest++;closeAll();updateRoomUrl('');toast('ออกจากห้องออนไลน์แล้ว — กดสร้างห้องเพื่อเริ่มใหม่');};$('create').onclick=()=>{const c=rand();$('room').value=c;initPeer(idForRoom(c),true)};$('join').onclick=()=>{const c=code($('room').value);if(!c)return toast('กรอกรหัสห้องก่อน');$('room').value=c;initPeer(null,false)};$('copy').onclick=async()=>{if(!roomCode)return toast('สร้างหรือเข้าห้องก่อน');const url=new URL(location.href);url.searchParams.set('room',roomCode);try{await navigator.clipboard.writeText(url.href);toast('คัดลอกลิงก์ห้องแล้ว')}catch(e){prompt('คัดลอกลิงก์นี้',url.href)}};
const playerNameKey='thai2d_player_name';
let savedPlayerName='';
try{savedPlayerName=localStorage.getItem(playerNameKey)||''}catch{}
me.name=cleanName(savedPlayerName||'ผู้เล่น'+rand().slice(0,3));
if(!savedPlayerName)try{localStorage.setItem(playerNameKey,me.name)}catch{}
$('name').value=me.name;
$('rename').onclick=()=>{
 me.name=cleanName($('name').value);
 $('name').value=me.name;
 try{localStorage.setItem(playerNameKey,me.name)}catch{}
 broadcast(snapshot());
};

function say(t,final=true){t=String(t||'').trim().slice(0,120);if(!t)return;me.text=t;me.until=Date.now()+5000;broadcast({type:'caption',text:t});if(final)toast('💬 '+t)}$('chat').onsubmit=e=>{e.preventDefault();say($('input').value);$('input').value='';$('input').blur()};

function wireCall(call){call.on('stream',s=>{let a=audios.get(call.peer);if(!a){a=document.createElement('audio');a.autoplay=true;a.playsInline=true;document.body.appendChild(a);audios.set(call.peer,a)}a.srcObject=s;a.muted=!speakerOn;a.play().catch(()=>toast('แตะ 🔊 เพื่ออนุญาตเล่นเสียง'))});call.on('close',()=>{if(incomingCalls.get(call.peer)!==call)return;incomingCalls.delete(call.peer);audios.get(call.peer)?.remove();audios.delete(call.peer)});call.on('error',()=>toast('เสียงบางคนเชื่อมต่อไม่ได้'))}function callPeer(id){if(!localStream||!connections.get(id)?.open||!peer||calls.has(id))return;
 const c=peer.call(id,localStream,{metadata:{voice:4}});
 if(c){
   calls.set(id,c);
   const forget=()=>{if(calls.get(id)===c)calls.delete(id)};
   c.on('close',forget);
   c.on('error',()=>{forget();toast('ส่งเสียงไปยังผู้เล่นบางคนไม่ได้')});
 }}
$('speaker').onclick=()=>{speakerOn=!speakerOn;$('speaker').textContent=speakerOn?'🔊':'🔇';for(const a of audios.values()){a.muted=!speakerOn;a.play().catch(()=>{})}};
const bars=Array.from({length:9},()=>{const b=document.createElement('i');$('wave').appendChild(b);return b});function drawWave(){if(!localStream||!analyser)return;const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);let v=0;for(const n of data)v+=((n-128)/128)**2;const amp=Math.sqrt(v/data.length);const active=amp>0.035;if(active!==voiceActive){voiceActive=active;broadcast({type:'voice',active})}if(performance.now()-lastVoiceSignal>700){broadcast({type:'voice',active:voiceActive});lastVoiceSignal=performance.now()}bars.forEach((b,i)=>b.style.height=Math.max(5,Math.min(23,5+amp*180*(.5+.5*Math.sin(i+performance.now()/160))))+'px');frame=requestAnimationFrame(drawWave)}
function startRecognition(){if(!SpeechRecognition){toast('เบราว์เซอร์นี้ไม่รองรับแปลงเสียงเป็นข้อความ แต่ยังพูดคุยได้');return}recStop=false;const rec=new SpeechRecognition();recognition=rec;rec.lang='th-TH';rec.continuous=true;rec.interimResults=true;let lastCaption='';rec.onresult=e=>{let interim='',final='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t}const t=(final||interim).trim();if(t&&t!==lastCaption){lastCaption=t;say(t,false)}};rec.onend=()=>{if(localStream&&!recStop&&recognition===rec)try{rec.start()}catch(e){}};rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed')toast('ระบบแปลงเสียงไม่ได้รับอนุญาต แต่ไมค์ยังส่งเสียงได้')};try{rec.start()}catch(e){toast('แปลงเสียงไม่พร้อม แต่ไมค์ยังทำงาน')}}
async function stopMic(){recStop=true;try{recognition?.stop()}catch(e){}recognition=null;cancelAnimationFrame(frame);for(const c of calls.values())c.close();calls.clear();if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}if(audioCtx){audioCtx.close().catch(()=>{});audioCtx=null}analyser=null;voiceActive=false;broadcast({type:'voice',active:false});$('mic').classList.remove('on');$('mic').textContent='🎤';bars.forEach(b=>b.style.height='5px');toast('ปิดไมค์แล้ว')}
$('mic').onclick=async()=>{if(localStream){await stopMic();return}try{if(!window.isSecureContext)throw Error('ต้องเปิดผ่าน HTTPS');localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});$('mic').classList.add('on');$('mic').textContent='🔴';audioCtx=new (window.AudioContext||window.webkitAudioContext)();const source=audioCtx.createMediaStreamSource(localStream);analyser=audioCtx.createAnalyser();analyser.fftSize=512;source.connect(analyser);drawWave();for(const id of connections.keys())callPeer(id);startRecognition();toast('เปิดไมค์แล้ว • เพื่อนจะได้ยินเสียงและเห็นข้อความ')}catch(e){toast('เปิดไมค์ไม่ได้: '+(e.message||e.name))}};

let lastSend=0;
function tickMultiplayer(now){
 if(!roomCode||now-lastSend<=90)return;
 lastSend=now;
 broadcast(snapshot());
}
function initializeMultiplayer(){
 const initial=code(new URLSearchParams(location.search).get('room'));
 if(initial){
   $('room').value=initial;
   initPeer(null,false);
 }else{
   status();
   toast('ออกประตูด้านล่างบ้านเพื่อสำรวจย่าน');
 }
}
addEventListener('pagehide',()=>{roomRequest++;if(localStream)stopMic();peer?.destroy()});

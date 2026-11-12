/** V5 MVP authoritative world server. Deploy separately from GitHub Pages. */
import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {createClient} from '@supabase/supabase-js';
import {MAX_PLAYERS,ROOM_IDS,starter,sanitizeState,applyAction,WORLD} from '../shared/rules.js';

const PORT=Number(process.env.PORT||8080);
const URL=process.env.SUPABASE_URL||'';
const SECRET=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(!URL||!SECRET){console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');process.exit(1)}
const supabase=createClient(URL,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const rooms=new Map(ROOM_IDS.map(id=>[id,new Map()]));
const sessions=new Map();
const ALLOWED=String(process.env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
const isOriginAllowed=origin=>!ALLOWED.length||!origin||ALLOWED.some(o=>origin===o||origin.startsWith(o+'/'));
const send=(ws,m)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m))};
const broadcast=(room,m,except)=>{for(const p of rooms.get(room)?.values()||[])if(p.ws!==except)send(p.ws,m)};
const publicPlayer=p=>({id:p.uid,name:p.profile.displayName,slot:p.slot,x:p.x,y:p.y,scene:p.scene,text:p.text||'',until:p.until||0,home:p.profile?.home||null});
const summary=()=>ROOM_IDS.map(id=>({id,count:rooms.get(id).size,capacity:MAX_PLAYERS,open:true}));
function broadcastRooms(){for(const p of sessions.values())send(p.ws,{type:'rooms',rooms:summary()})}
function headers(origin){return {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':isOriginAllowed(origin)?(origin||'*'):'null','Access-Control-Allow-Methods':'GET,OPTIONS'}}
const server=http.createServer((req,res)=>{
 const origin=req.headers.origin||'';
 if(!isOriginAllowed(origin)){res.writeHead(403);res.end();return}
 const path=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
 if(req.method==='OPTIONS'){res.writeHead(204,headers(origin));res.end();return}
 if(path==='/api/rooms'||path==='/api/health'){
   res.writeHead(200,headers(origin));res.end(JSON.stringify(path==='/api/rooms'?{rooms:summary()}:{ok:true,service:'my-little-neighborhood-v5',players:sessions.size}));return;
 }
 res.writeHead(404,headers(origin));res.end(JSON.stringify({error:'Not found'}));
});
const wss=new WebSocketServer({server,maxPayload:8192,verifyClient:info=>isOriginAllowed(info.origin)});

async function loadProfile(uid,name){
 const {data,error}=await supabase.from('game_profiles').select('state').eq('user_id',uid).maybeSingle();
 if(error)throw error;
 if(!data){const s=starter(name);const saved=await supabase.from('game_profiles').upsert({user_id:uid,state:s},{onConflict:'user_id'});if(saved.error)throw saved.error;return s}
 return sanitizeState(data.state,name);
}
async function saveProfile(p){const {error}=await supabase.from('game_profiles').upsert({user_id:p.uid,state:p.profile,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error}
function leave(p){
 if(!p)return;
 if(rooms.get(p.room)?.get(p.uid)===p){rooms.get(p.room).delete(p.uid);broadcast(p.room,{type:'left',id:p.uid},p.ws)}
 if(sessions.get(p.uid)===p)sessions.delete(p.uid);
 broadcastRooms();
}
async function authenticate(ws,msg){
 if(ws.player){send(ws,{type:'error',message:'เข้าห้องแล้ว'});return}
 if(typeof msg.token!=='string'||msg.token.length>8192){send(ws,{type:'error',message:'ไม่มีบัญชีที่ใช้ได้'});return}
 const room=String(msg.room||'002');if(!rooms.has(room)){send(ws,{type:'error',message:'ไม่พบชุมชน'});return}
 const {data,error}=await supabase.auth.getUser(msg.token);
 const uid=data?.user?.id;
 if(error||!uid){send(ws,{type:'error',message:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'});return}
 if(ws.readyState!==WebSocket.OPEN)return;
 const old=sessions.get(uid);if(old){send(old.ws,{type:'kicked',message:'บัญชีนี้เข้าสู่เกมจากหน้าต่างอื่น'});old.ws.close(4002,'Signed in elsewhere');leave(old)}
 const members=rooms.get(room);if(members.size>=MAX_PLAYERS){send(ws,{type:'error',message:'ชุมชนนี้เต็มแล้ว'});return}
 // Reservation happens synchronously after this line, with no awaits.
 const used=new Set([...members.values()].map(p=>p.slot));
 const slot=Array.from({length:MAX_PLAYERS},(_,i)=>i).find(i=>!used.has(i));
 const p={ws,uid,room,slot,profile:null,x:130+(slot%4)*555+245,y:slot<4?490:815,scene:'outside',lastMove:Date.now(),text:'',until:0};
 ws.player=p;members.set(uid,p);sessions.set(uid,p);
 broadcastRooms();
 try{
   p.profile=await loadProfile(uid,String(msg.name||'ผู้เล่น').slice(0,18));
   if(ws.readyState!==WebSocket.OPEN || sessions.get(uid)!==p)return;
   send(ws,{type:'joined',room,slot,id:uid,profile:p.profile,players:[...members.values()].filter(x=>x!==p&&x.profile).map(publicPlayer)});
   broadcast(room,{type:'player',player:publicPlayer(p)},ws);
 }catch(e){console.error('Load save:',e.message);send(ws,{type:'error',message:'โหลดเซฟไม่สำเร็จ กรุณาลองอีกครั้ง'});leave(p);ws.close(1011,'Save error')}
}
async function receive(ws,msg){
 if(!msg||typeof msg!=='object')return;
 if(msg.type==='auth'){await authenticate(ws,msg);return}
 const p=ws.player;if(!p||!p.profile)return;
 if(msg.type==='move'){
   const t=Date.now();if(t-p.lastMove<45)return;
   const x=Number(msg.x),y=Number(msg.y),scene=msg.scene==='inside'?'inside':'outside';
   if(!Number.isFinite(x)||!Number.isFinite(y))return;
   const maxX=scene==='outside'?WORLD.w-22:630,maxY=scene==='outside'?WORLD.h-22:400;
   const nextX=Math.max(22,Math.min(maxX,x)),nextY=Math.max(22,Math.min(maxY,y));
   // Basic speed / teleport moderation. Interior/exterior transitions may reposition freely.
   const delta=Math.hypot(nextX-p.x,nextY-p.y);
   const elapsed=Math.max(.045,Math.min(1,(t-p.lastMove)/1000));
   if(scene===p.scene&&delta>Math.max(50,elapsed*290))return;
   p.x=nextX;p.y=nextY;p.scene=scene;p.lastMove=t;
   broadcast(p.room,{type:'moved',id:p.uid,x:p.x,y:p.y,scene},ws);return;
 }
 if(msg.type==='say'){
   const text=String(msg.text||'').trim().slice(0,120);if(!text)return;
   if(Date.now()-(p.lastChat||0)<850)return;
   p.lastChat=Date.now();p.text=text;p.until=Date.now()+5000;
   broadcast(p.room,{type:'said',id:p.uid,text,until:p.until},ws);return;
 }
 if(msg.type==='action'){
   const result=applyAction(p.profile,msg.action,Date.now());
   if(!result.ok){send(ws,{type:'notice',message:result.message});return}
   try{await saveProfile(p);send(ws,{type:'profile',profile:p.profile,notice:result.message});broadcast(p.room,{type:'homeUpdate',id:p.uid,home:p.profile.home},ws)}
   catch(e){console.error('Save failed:',e.message);p.profile=await loadProfile(p.uid,p.profile.displayName);send(ws,{type:'notice',message:'บันทึกไม่สำเร็จ ลองอีกครั้ง'})}
 }
}
wss.on('connection',ws=>{
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true});
 ws.queue=Promise.resolve();
 ws.on('message',raw=>{
   let msg;try{msg=JSON.parse(raw.toString())}catch{return}
   ws.queue=ws.queue.then(()=>receive(ws,msg)).catch(e=>{console.error('Message:',e);send(ws,{type:'error',message:'มีข้อผิดพลาดฝั่งเซิร์ฟเวอร์'})});
 });
 ws.on('close',()=>leave(ws.player));ws.on('error',()=>leave(ws.player));
});
setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`V5 online server on :${PORT} | rooms: ${ROOM_IDS.join(', ')}`));

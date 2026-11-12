/** Firebase Realtime Database V5 multiplayer adapter. Client-trusted prototype, not a fraud-resistant game server. */
import {initializeApp, getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getDatabase, ref, get, onValue, runTransaction, update, remove, onDisconnect} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {MAX_PLAYERS, ROOM_IDS, starter, sanitizeState, applyAction, lots, sanitizeAppearance} from './shared/rules.js';

const ROOT='little-neighborhood-v5';
export class FirebaseGame {
 constructor(config,emit){
  this.config=config;this.emit=emit;this.app=null;this.auth=null;this.db=null;this.uid='';this.room='';this.slot=-1;
  this.slotRef=null;this.unsubscribe=null;this.unsubConnected=null;this.profile=null;this.lastChat=0;this.ended=false;
 }
 async ready(){
  if(this.app)return;
  this.app=getApps().find(a=>a.name==='neighborhood-v5')||initializeApp(this.config,'neighborhood-v5');
  this.auth=getAuth(this.app);this.db=getDatabase(this.app,this.config.databaseURL);
  await new Promise((resolve,reject)=>{const unsub=onAuthStateChanged(this.auth,()=>{unsub();resolve()},reject)});
 }
 async login(mode,email,password){
  await this.ready();let result;
  if(mode==='login')result=await signInWithEmailAndPassword(this.auth,email,password);
  else if(mode==='signup')result=await createUserWithEmailAndPassword(this.auth,email,password);
  else result=await signInAnonymously(this.auth);
  return result.user;
 }
 currentUser(){return this.auth?.currentUser||null}
 async rooms(){
  await this.ready();if(!this.currentUser())return [];
  return Promise.all(ROOM_IDS.map(async id=>{
    const snap=await get(ref(this.db,`${ROOT}/rooms/${id}/slots`));
    const slots=snap.val()||{};
    return {id,count:Object.keys(slots).length,capacity:MAX_PLAYERS,open:true};
  }));
 }
 async loadProfile(name){
  const uid=this.currentUser()?.uid;if(!uid)throw Error('กรุณาเข้าสู่ระบบก่อน');
  const profileRef=ref(this.db,`${ROOT}/profiles/${uid}`);
  // Atomic first-create: existing save is never replaced by starter money.
  const result=await runTransaction(profileRef,previous=>previous==null?starter(name):undefined,{applyLocally:false});
  const data=result.committed?result.snapshot.val():(await get(profileRef)).val();
  return sanitizeState(data,name);
 }
 async join(room,name){
  await this.ready();if(!ROOM_IDS.includes(room))throw Error('ไม่พบชุมชน');
  if(!this.currentUser())throw Error('กรุณาเข้าสู่ระบบก่อน');
  if(this.slotRef)await this.leave();
  const uid=this.currentUser().uid;
  const profile=await this.loadProfile(name);
  const slotsRef=ref(this.db,`${ROOT}/rooms/${room}/slots`);
  const occupied=(await get(slotsRef)).val()||{};
  if(Object.values(occupied).some(p=>p?.uid===uid)){
    throw Error('บัญชีนี้มีตัวละครอยู่ในชุมชนนี้แล้ว กรุณาปิดแท็บเกมเดิมก่อน');
  }
  let taken=-1,slotRef=null;
  const order=Array.from({length:MAX_PLAYERS},(_,i)=>i).sort((a,b)=>{
    const left=occupied[a]?1:0,right=occupied[b]?1:0;return left-right||a-b;
  });
  for(const index of order){
    const candidate=ref(this.db,`${ROOT}/rooms/${room}/slots/${index}`),l=lots[index];
    const pos={uid,name:profile.displayName,slot:index,x:l.x+247,y:index<4?l.y+l.h-45:l.y+50,scene:'outside',pose:'stand',text:'',until:0,home:profile.home,appearance:profile.appearance,updatedAt:Date.now()};
    const result=await runTransaction(candidate,previous=>previous==null?pos:undefined,{applyLocally:false});
    if(result.committed){taken=index;slotRef=candidate;break;}
  }
  if(taken<0)throw Error('ชุมชนนี้เต็มแล้ว (8/8)');
  try{
    // After reserving the lot, register server-side cleanup on disconnect.
    await onDisconnect(slotRef).remove();
    this.uid=uid;this.room=room;this.slot=taken;this.slotRef=slotRef;this.profile=profile;this.ended=false;
    this.unsubscribe=onValue(slotsRef,snap=>{
      const v=snap.val()||{};const players=Object.values(v).filter(p=>p&&p.uid!==uid).map(p=>({id:p.uid,...p}));
      this.emit({type:'players',players});
    },error=>this.emit({type:'error',message:'อ่านข้อมูลเพื่อนไม่ได้: '+error.message}));
    let wasConnected=false;
    this.unsubConnected=onValue(ref(this.db,'.info/connected'),snap=>{
      if(snap.val()===true){wasConnected=true;return}
      if(wasConnected&&!this.ended)this.emit({type:'disconnected'});
    });
    return {id:uid,room,slot:taken,profile};
  }catch(err){try{await remove(slotRef)}catch{};throw err}
 }
 send(m){
  if(!this.slotRef||this.ended)return;
  if(m.type==='move')return update(this.slotRef,{x:m.x,y:m.y,scene:m.scene,pose:['stand','sit','sleep'].includes(m.pose)?m.pose:'stand',updatedAt:Date.now()});
  if(m.type==='say'){
    const now=Date.now();if(now-this.lastChat<850)return;
    this.lastChat=now;return update(this.slotRef,{text:String(m.text||'').slice(0,120),until:now+5000});
  }
  if(m.type==='action')return this.action(m.action);
  if(m.type==='appearance')return this.setAppearance(m.appearance);
 }
 async action(action){
  const uid=this.uid;
  if(!uid||this.ended)return;
  const profileRef=ref(this.db,`${ROOT}/profiles/${uid}`);
  let lastResult={ok:false,message:'ไม่สามารถทำรายการได้'};
  try{
    const result=await runTransaction(profileRef,current=>{
      if(current==null)return undefined;
      const state=sanitizeState(current);
      const r=applyAction(state,action,Date.now());lastResult=r;
      return r.ok?state:undefined;
    },{applyLocally:false});
    if(!result.committed){this.emit({type:'notice',message:lastResult.message});return}
    const profile=sanitizeState(result.snapshot.val());this.profile=profile;
    await update(this.slotRef,{name:profile.displayName,home:profile.home,updatedAt:Date.now()});
    this.emit({type:'profile',profile,notice:lastResult.message});
  }catch(e){this.emit({type:'error',message:'บันทึกข้อมูลไม่สำเร็จ: '+e.message})}
 }
 async setAppearance(value){
  if(!this.uid||!this.slotRef||this.ended)return;
  const appearance=sanitizeAppearance(value);
  const profileRef=ref(this.db,`${ROOT}/profiles/${this.uid}`);
  await update(profileRef,{appearance});
  await update(this.slotRef,{appearance,updatedAt:Date.now()});
  this.profile={...this.profile,appearance};
  this.emit({type:'profile',profile:this.profile,notice:'🎨 บันทึกตัวละครเดิมจาก V4 ลง Firebase แล้ว'});
 }
 async leave(){
  const slot=this.slotRef;this.ended=true;
  this.unsubscribe?.();this.unsubConnected?.();this.unsubscribe=null;this.unsubConnected=null;
  this.slotRef=null;this.uid='';this.room='';this.slot=-1;
  if(slot){try{await onDisconnect(slot).cancel()}catch{};try{await remove(slot)}catch{}}
 }
}

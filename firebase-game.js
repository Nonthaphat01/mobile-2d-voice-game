/** Firebase multiplayer and optional server-managed market adapter. */
import {initializeApp, getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getDatabase, ref, get, onValue, runTransaction, update, remove, onDisconnect} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {getFunctions, httpsCallable} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
import {MAX_PLAYERS, ROOM_IDS, starter, sanitizeState, applyAction, lots, sanitizeAppearance} from './shared/rules.js?v=v5-gardener-1';

const backgroundAction = type => type==='gardenerResume'?'gardenerStep':['gardenerStep','needsTick'].includes(type)?type:false;

const ROOT='little-neighborhood-v5';
export class FirebaseGame {
 constructor(config,emit,marketEnabled=false){
  this.config=config;this.emit=emit;this.app=null;this.auth=null;this.db=null;this.uid='';this.room='';this.slot=-1;
  this.slotRef=null;this.unsubscribe=null;this.unsubConnected=null;this.profile=null;this.lastChat=0;this.ended=false;
  this.profileWrites=Promise.resolve();
  this.marketEnabled=marketEnabled;
 }
 async ready(){
  if(this.app)return;
  this.app=getApps().find(a=>a.name==='neighborhood-v5')||initializeApp(this.config,'neighborhood-v5');
  this.auth=getAuth(this.app);this.db=getDatabase(this.app,this.config.databaseURL);
  if(this.marketEnabled)this.marketCall=httpsCallable(getFunctions(this.app,'asia-southeast1'),'neighborhoodMarket');
  await this.auth.authStateReady();
 }
 async login(mode,email,password){
  await this.ready();let result;
  if(mode==='login')result=await signInWithEmailAndPassword(this.auth,email,password);
  else if(mode==='signup')result=await createUserWithEmailAndPassword(this.auth,email,password);
  else if(mode==='guest')result=await signInAnonymously(this.auth);
  else throw Error('Unknown sign-in method');
  return result.user;
 }
 async logout(){
  await this.leave();
  await signOut(this.auth);
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
  if(this.marketEnabled)return (await this.marketCall({type:'load',name})).data.profile;
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
    this.profileWrites=Promise.resolve();
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
  if(m.type==='action'||m.type==='appearance'){
    const slotRef=this.slotRef;
    const write=this.profileWrites.then(()=>{
      if(this.slotRef!==slotRef)return;
      return m.type==='action'?this.action(m.action):this.setAppearance(m.appearance);
    });
    this.profileWrites=write.catch(()=>{});
    return write;
  }
 }
 async action(action){
  const uid=this.uid;
  if(!uid||this.ended)return {ok:false,message:'การเชื่อมต่อสิ้นสุดแล้ว'};
  const slotRef=this.slotRef;
  if(this.marketEnabled){
    const result=await this.market({type:'action',action});
    if(this.slotRef!==slotRef)return;
    const background=backgroundAction(action.type);
    if(!result.ok){
      if(result.message)this.emit({type:'notice',message:result.message});
      return result;
    }
    this.profile=result.profile;
    this.emit({type:'profile',profile:this.profile,notice:result.message,background});
    if(action.type==='needsTick')return result;
    try{await update(slotRef,{name:result.profile.displayName,home:result.profile.home,updatedAt:Date.now()})}
    catch(e){if(this.slotRef===slotRef)this.emit({type:'notice',message:'บันทึกแล้ว แต่ซิงก์ชุมชนไม่สำเร็จ: '+e.message})}
    return result;
  }
  const profileRef=ref(this.db,`${ROOT}/profiles/${uid}`);
  let lastResult={ok:false,message:'ไม่สามารถทำรายการได้'};
  try{
    const result=await runTransaction(profileRef,current=>{
      // RTDB can start with a null local cache. Let the server compare its value
      // and retry against the existing save before deciding the action failed.
      if(current==null)return null;
      const state=sanitizeState(current);
      const r=applyAction(state,action,Date.now());lastResult=r;
      return r.ok?state:undefined;
    },{applyLocally:false});
    if(this.slotRef!==slotRef)return;
    if(!result.committed||!result.snapshot.exists()){
      const failure={ok:false,message:lastResult.ok?'บันทึกข้อมูลไม่สำเร็จ':lastResult.message};
      if(failure.message)this.emit({type:'notice',message:failure.message});
      return failure;
    }
    const profile=sanitizeState(result.snapshot.val());this.profile=profile;
    const background=backgroundAction(action.type);
    this.emit({type:'profile',profile,notice:lastResult.message,background});
    if(action.type==='needsTick')return lastResult;
    try{
      await update(slotRef,{name:profile.displayName,home:profile.home,updatedAt:Date.now()});
    }catch(e){
      if(this.slotRef===slotRef)this.emit({type:'notice',message:'บันทึกเซฟแล้ว แต่ซิงก์ข้อมูลในชุมชนไม่สำเร็จ: '+e.message});
    }
    return lastResult;
  }catch(e){
    const failure={ok:false,message:'บันทึกข้อมูลไม่สำเร็จ: '+e.message};
    if(this.slotRef===slotRef)this.emit({type:'error',message:failure.message});
    return failure;
  }
 }
 async setAppearance(value){
  if(!this.uid||!this.slotRef||this.ended)return;
  const slotRef=this.slotRef;
  const appearance=sanitizeAppearance(value);
  const profileRef=ref(this.db,`${ROOT}/profiles/${this.uid}`);
  if(this.marketEnabled){
    const result=await this.market({type:'action',action:{type:'appearance',appearance}});
    if(!result.ok){this.emit({type:'notice',message:result.message});return}
    if(this.slotRef!==slotRef)return;
    this.profile=result.profile;
  }else{
    await update(profileRef,{appearance});
    if(this.slotRef!==slotRef)return;
    this.profile={...this.profile,appearance};
  }
  if(this.slotRef!==slotRef)return;
  this.emit({type:'profile',profile:this.profile,notice:'🎨 บันทึกตัวละครเดิมจาก V4 ลง Firebase แล้ว'});
  await update(slotRef,{appearance,updatedAt:Date.now()});
 }
 requestMarket(request){
  const slotRef=this.slotRef;
  const pending=this.profileWrites.then(async ()=>{
    if(!slotRef||this.slotRef!==slotRef)return {ok:false,message:'การเชื่อมต่อสิ้นสุดแล้ว'};
    const result=await this.market(request);
    if(this.slotRef!==slotRef)return {ok:false,message:'การเชื่อมต่อสิ้นสุดแล้ว'};
    if(result.profile)this.profile=result.profile;
    return result;
  });
  this.profileWrites=pending.catch(()=>{});
  return pending;
 }
 async market(request){
  if(!this.marketCall||!this.slotRef||this.ended)return {ok:false,message:'ร้านออนไลน์ยังไม่เปิดให้บริการ'};
  try{
    return (await this.marketCall({...request,room:this.room,slot:this.slot})).data;
  }catch(error){
    return {ok:false,message:error.code==='functions/internal'||error.code==='functions/unavailable'
      ?'ติดต่อร้านออนไลน์ไม่สำเร็จ ลองใหม่อีกครั้ง':error.message};
  }
 }
 async leave(){
  const slot=this.slotRef;this.ended=true;
  this.unsubscribe?.();this.unsubConnected?.();this.unsubscribe=null;this.unsubConnected=null;
  this.slotRef=null;this.uid='';this.room='';this.slot=-1;
  if(slot){try{await onDisconnect(slot).cancel()}catch{};try{await remove(slot)}catch{}}
 }
}

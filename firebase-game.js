/** Firebase multiplayer and optional server-managed market adapter. */
import {initializeApp, getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getDatabase, ref, get, onValue, runTransaction, update, remove, onDisconnect} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {getFunctions, httpsCallable} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
import {saveProfileAction} from './shared/profile-save.js?v=profile-save-1';
import {MAX_PLAYERS, ROOM_IDS, starter, sanitizeState, applyAction, lots, sanitizeAppearance} from './shared/rules.js?v=profile-save-1';
import {gameSocial} from './game-social.js?v=v5-neighbors-1';
import {requestSheetsMarket} from './shared/sheets-market-client.js?v=town-1';

const backgroundAction = type => type==='gardenerResume'?'gardenerStep':['gardenerStep','needsTick'].includes(type)?type:false;

const ROOT='little-neighborhood-v5';
const publicStats=p=>({level:p.level,money:p.money,playSeconds:p.playSeconds});
export class FirebaseGame {
 constructor(config,emit,marketEnabled=false,sheetsMarketUrl=''){
  this.config=config;this.emit=emit;this.app=null;this.auth=null;this.db=null;this.uid='';this.room='';this.slot=-1;
  this.slotRef=null;this.unsubscribe=null;this.unsubConnected=null;this.profile=null;this.lastChat=0;this.ended=false;
  this.profileWrites=Promise.resolve();
  this.marketEnabled=marketEnabled&&!sheetsMarketUrl;
  this.sheetsMarketUrl=sheetsMarketUrl;
  this.marketSchema=0;
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
    const pos={uid,name:profile.displayName,slot:index,x:l.x+247,y:index<4?l.y+l.h-45:l.y+50,scene:'outside',pose:'stand',text:'',until:0,home:profile.home,appearance:profile.appearance,...publicStats(profile),updatedAt:Date.now()};
    const result=await runTransaction(candidate,previous=>previous==null?pos:undefined,{applyLocally:false});
    if(result.committed){taken=index;slotRef=candidate;break;}
  }
  if(taken<0)throw Error('ชุมชนนี้เต็มแล้ว (8/8)');
  try{
    // After reserving the lot, register server-side cleanup on disconnect.
    await onDisconnect(slotRef).remove();
    this.uid=uid;this.room=room;this.slot=taken;this.slotRef=slotRef;this.profile=profile;this.ended=false;
    this.profileWrites=Promise.resolve();
    const contactProbe=ref(this.db,`${ROOT}/social/contacts/_privacy_probe`);
    this.social=null;
    get(contactProbe).catch(error=>{
      if(this.slotRef===slotRef&&/permission[\s_-]denied/i.test(`${error.code||''} ${error.message||''}`)&&uid!=='_privacy_probe'){
        this.social=gameSocial(this.db,uid,profile.displayName);
        this.emit({type:'social'});
      }
    });
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
  if(m.type==='move')return update(this.slotRef,{x:m.x,y:m.y,scene:m.scene,house:m.house??null,restAngle:m.restAngle??null,vehicle:m.scene==='outside'&&this.profile?.garage?.owned.includes(m.vehicle)?m.vehicle:null,pose:['stand','sit','sleep'].includes(m.pose)?m.pose:'stand',updatedAt:Date.now()});
  if(m.type==='voice')return update(this.slotRef,m.fields);
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
  const background=backgroundAction(action.type);
  let result;
  try{
    if(this.marketEnabled)result=await this.market({type:'action',action});
    else{
      const token=await this.currentUser()?.getIdToken();
      if(this.slotRef!==slotRef||this.ended)return;
      result=token?await saveProfileAction(this.config.databaseURL,ROOT,uid,token,action)
        :{ok:false,message:'กรุณาเข้าสู่ระบบใหม่'};
    }
  }catch{
    result={ok:false,message:'ยังยืนยันผลการบันทึกไม่ได้ กรุณาเข้าเกมใหม่เพื่อตรวจยอดก่อนลองอีกครั้ง'};
  }
  if(this.slotRef!==slotRef||this.ended)return;
  if(result.profile){
    this.profile=sanitizeState(result.profile);
    this.emit({type:'profile',profile:this.profile,notice:result.message,background});
    if(result.ok){
      const profile=this.profile;
      const fields=action.type==='needsTick'?publicStats(profile):
        {name:profile.displayName,home:profile.home,appearance:profile.appearance,...publicStats(profile),updatedAt:Date.now()};
      // Presence can wait for reconnection independently of the committed save.
      update(slotRef,fields).catch(()=>{
        if(this.slotRef===slotRef&&!background)this.emit({type:'notice',message:'บันทึกเซฟแล้ว แต่ซิงก์ข้อมูลในชุมชนไม่สำเร็จ',chatOnly:true});
      });
    }
  }else if(result.message&&!background)this.emit({type:'notice',message:result.message});
  return result;
 }
 setAppearance(value){
  return this.action({type:'appearance',appearance:sanitizeAppearance(value)});
 }
 requestMarket(request){
  const slotRef=this.slotRef;
  const pending=this.profileWrites.then(async ()=>{
    if(!slotRef||this.slotRef!==slotRef)return {ok:false,message:'การเชื่อมต่อสิ้นสุดแล้ว'};
    const result=await this.market(request);
    if(this.slotRef!==slotRef)return {ok:false,message:'การเชื่อมต่อสิ้นสุดแล้ว'};
    if(result.marketSchema===3)this.marketSchema=3;
    if(result.profile&&(!this.sheetsMarketUrl||this.marketSchema===3))this.profile=result.profile;
    return result;
  });
  this.profileWrites=pending.catch(()=>{});
  return pending;
 }
 async market(request){
  if((!this.marketCall&&!this.sheetsMarketUrl)||!this.slotRef||this.ended)return {ok:false,message:'ร้านออนไลน์ยังไม่เปิดให้บริการ'};
  try{
    if(this.sheetsMarketUrl){
      if(request.type!=='browse'&&this.marketSchema!==3)
        return {ok:false,message:'ร้านค้ากำลังอัปเดต กรุณารอให้เซิร์ฟเวอร์รองรับเซฟรุ่นใหม่'};
      const token=await this.currentUser()?.getIdToken();
      if(!token)return {ok:false,message:'กรุณาเข้าสู่ระบบใหม่'};
      const result=await requestSheetsMarket(this.sheetsMarketUrl,token,{...request,marketSchema:3,room:this.room,slot:this.slot});
      if(request.type==='browse'&&result.marketSchema!==3){
        this.marketSchema=0;
        return {ok:false,message:'ร้านค้าอยู่ระหว่างอัปเดตเซิร์ฟเวอร์ เกมส่วนอื่นเล่นได้ตามปกติ'};
      }
      return result;
    }
    return (await this.marketCall({...request,room:this.room,slot:this.slot})).data;
  }catch(error){
    return {ok:false,message:error.code==='functions/internal'||error.code==='functions/unavailable'
      ?'ติดต่อร้านออนไลน์ไม่สำเร็จ ลองใหม่อีกครั้ง':error.message};
  }
 }
 async leave(){
  const slot=this.slotRef;this.ended=true;
  this.unsubscribe?.();this.unsubConnected?.();this.unsubscribe=null;this.unsubConnected=null;
  this.slotRef=null;this.uid='';this.room='';this.slot=-1;this.social=null;
  if(slot){try{await onDisconnect(slot).cancel()}catch{};try{await remove(slot)}catch{}}
 }
}

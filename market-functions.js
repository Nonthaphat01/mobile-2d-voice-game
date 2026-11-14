import {initializeApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {createHmac, randomBytes} from 'node:crypto';
import {applyAction, lots} from './shared/rules.js?v=town-1';
import {gardenerPost,gardenBoxPosition} from './shared/farming.js?v=v5-neighbors-1';
import {firestoreMarket, MARKET_PATH} from './firestore-market.js';

initializeApp({databaseURL:'https://gamesurvival-58e92-default-rtdb.asia-southeast1.firebasedatabase.app'});
const ROOT = 'little-neighborhood-v5';
const db = getDatabase();
const game = db.ref(ROOT);
const firestore = getFirestore();
const market = firestoreMarket(firestore,async uid=>(await game.child('profiles').child(uid).get()).val());
const allowedActions = new Set(['plant','water','harvest','sell','seed','buy','saveHome','name','appearance','hireGardener','gardenerStep','gardenerResume','collectGardenBox','expandHouse','expandGarden','needsTick','eat']);
const nearMarket = player => player.scene==='outside' &&
  Math.hypot(Math.max(1136-player.x,0,player.x-1264),Math.max(588-player.y,0,player.y-699))<=82;

export const neighborhoodMarket = onCall({region:'asia-southeast1',maxInstances:4},async request=>{
  const uid=request.auth?.uid;
  if(!uid)throw new HttpsError('unauthenticated','กรุณาเข้าสู่ระบบ');
  if((await firestore.doc(MARKET_PATH).get()).get('enabled')!==true)
    throw new HttpsError('failed-precondition','ร้านออนไลน์ยังไม่เปิดให้บริการ');
  const data=request.data || {};
  if(data.type==='load'){
    return {profile:await market.load(uid,String(data.name||'ผู้เล่น'))};
  }
  const {room,slot}=data;
  if(!['001','002','003'].includes(room)||!Number.isInteger(slot)||!lots[slot])
    throw new HttpsError('failed-precondition','กรุณาเข้าชุมชน');
  const playerRef=game.child('rooms').child(room).child('slots').child(String(slot));
  const player=(await playerRef.get()).val();
  if(!player||player.uid!==uid)throw new HttpsError('failed-precondition','กรุณาเข้าชุมชนใหม่');

  if(data.type==='browse'){
    if(!nearMarket(player))throw new HttpsError('failed-precondition','เดินไปที่ตลาดกลางก่อน');
    return market.browse(uid,Date.now());
  }
  const now=Date.now();
  if(data.type==='action'){
    const action={...data.action,slot};
    if(!allowedActions.has(action.type))throw new HttpsError('invalid-argument','คำสั่งไม่ถูกต้อง');
    if(action.type==='needsTick'){
      action.pose=player.scene==='inside'?player.pose:'stand';
      const players=(await playerRef.parent.get()).val()||{};
      action.nearPlayer=Object.values(players).some(p=>p&&p.uid!==uid&&p.scene===player.scene&&
        (p.scene!=='inside'||(p.house||p.uid)===(player.house||uid))&&Math.hypot(p.x-player.x,p.y-player.y)<=100);
    }
    if(['sell','seed'].includes(action.type)&&!nearMarket(player))return {ok:false,message:'เดินไปที่ตลาดกลางก่อน'};
    if(action.type==='hireGardener'){
      const post=gardenerPost(lots[slot]);
      if(player.scene!=='outside'||Math.hypot(player.x-post.x,player.y-post.y)>75)
        return {ok:false,message:'เดินไปที่จุดจ้างคนสวนหน้าบ้านก่อน'};
    }
    if(['expandHouse','expandGarden'].includes(action.type)){
      const lot=lots[slot];
      if(player.scene!=='outside'||Math.hypot(player.x-lot.x-195,player.y-lot.y-253)>75)
        return {ok:false,message:'เดินไปที่ป้ายขยายพื้นที่หน้าบ้านก่อน'};
    }
    if(action.type==='collectGardenBox'){
      const box=gardenBoxPosition(lots[slot]);
      if(player.scene!=='outside'||Math.hypot(player.x-box.x,player.y-box.y)>60)
        return {ok:false,message:'เดินไปที่กล่องข้างสวนก่อน'};
    }
    const seed=randomBytes(32);
    return market.action(uid,state=>{
      let cursor=0;
      return applyAction(state,action,now,()=>createHmac('sha256',seed).update(String(cursor++)).digest().readUInt32BE()/0x100000000);
    });
  }
  if(!['list','buy','cancel'].includes(data.type))throw new HttpsError('invalid-argument','คำสั่งไม่ถูกต้อง');
  if(!nearMarket(player))return {ok:false,message:'เดินไปที่ตลาดกลางก่อน'};
  return market.transact(uid,data,now);
});


/**
 * Secure server-side AFK sweeper (deploy with Firebase CLI).
 * Session-presence entries are removed by onDisconnect. Only slots created
 * with presenceMode=session are eligible; older versions keep their original
 * onDisconnect behavior until they reconnect with the updated client.
 *
 * Deletes occupancy ONLY, not player profiles, homes, balances or inventory.
 */
export const evictIdlePlayers = onSchedule({
  schedule: 'every 1 minutes',
  region: 'asia-southeast1',
  timeZone: 'Asia/Bangkok',
  maxInstances: 1
}, async () => {
  const now=Date.now(), timeoutMs=30*60*1000;
  let cleared=0, failures=0;
  for(const roomId of ['001','002','003']){
    const roomRef=game.child('rooms').child(roomId);
    const [slotsSnap,connectionsSnap]=await Promise.all([
      roomRef.child('slots').get(),
      roomRef.child('connections').get()
    ]);
    const slots=slotsSnap.val()||{},connections=connectionsSnap.val()||{};
    for(const [slotId,occupied] of Object.entries(slots)){
      if(!/^[0-7]$/.test(slotId)||!occupied||occupied.presenceMode!=='session')continue;
      if(typeof occupied.uid!=='string'||typeof occupied.sessionId!=='string')continue;
      const recent=Number(occupied.lastActivityAt||occupied.updatedAt||0);
      const expired=recent>0&&now-recent>=timeoutMs;
      const hadPresence=connections[occupied.uid]?.sessionId===occupied.sessionId;
      if(!expired&&hadPresence)continue;
      const slotRef=roomRef.child('slots').child(slotId);
      try{
        // Avoid removing a slot taken over by another session, or a player
        // who interacted after the room snapshot was read.
        const connectedNow=await roomRef.child('connections').child(occupied.uid).get();
        const stillConnected=connectedNow.val()?.sessionId===occupied.sessionId;
        if(!expired&&stillConnected)continue;
        const result=await slotRef.transaction(current=>{
          if(!current||current.presenceMode!=='session')return;
          if(current.uid!==occupied.uid||current.sessionId!==occupied.sessionId)return;
          const lastActive=Number(current.lastActivityAt||current.updatedAt||0);
          if(lastActive>now-timeoutMs&&stillConnected)return;
          return null;
        },undefined,false);
        if(result.committed)cleared++;
      }catch(error){
        failures++;
        console.error('AFK cleanup failed for room',roomId,'slot',slotId,error?.code||error?.message||String(error));
      }
    }
  }
  console.info('Room AFK cleanup', {cleared,failures});
});

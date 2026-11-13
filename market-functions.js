import {initializeApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {randomInt} from 'node:crypto';
import {applyAction, sanitizeState, starter, lots} from './shared/rules.js?v=v5-hud-1';
import {trade} from './shared/market-trade.js';

initializeApp({databaseURL:'https://gamesurvival-58e92-default-rtdb.asia-southeast1.firebasedatabase.app'});
const ROOT = 'little-neighborhood-v5';
const db = getDatabase();
const game = db.ref(ROOT);
const allowedActions = new Set(['plant','water','harvest','sell','seed','buy','saveHome','name','appearance','hireGardener','dismissGardener','gardenerStep','needsTick','eat']);
const nearMarket = player => player.scene==='outside' &&
  Math.hypot(Math.max(1136-player.x,0,player.x-1264),Math.max(588-player.y,0,player.y-699))<=82;

export const neighborhoodMarket = onCall({region:'asia-southeast1',maxInstances:4},async request=>{
  const uid=request.auth?.uid;
  if(!uid)throw new HttpsError('unauthenticated','กรุณาเข้าสู่ระบบ');
  const data=request.data || {};
  const profileRef=game.child('profiles').child(uid);
  if(data.type==='load'){
    await profileRef.transaction(current=>current ?? starter(String(data.name||'ผู้เล่น')));
    return {profile:sanitizeState((await profileRef.get()).val())};
  }
  const {room,slot}=data;
  if(!['001','002','003'].includes(room)||!Number.isInteger(slot)||!lots[slot])
    throw new HttpsError('failed-precondition','กรุณาเข้าชุมชน');
  const playerRef=game.child('rooms').child(room).child('slots').child(String(slot));
  const player=(await playerRef.get()).val();
  if(!player||player.uid!==uid)throw new HttpsError('failed-precondition','กรุณาเข้าชุมชนใหม่');

  if(data.type==='browse'){
    if(!nearMarket(player))throw new HttpsError('failed-precondition','เดินไปที่ตลาดกลางก่อน');
    const listings=(await game.child('marketListings').get()).val() || {};
    const now=Date.now();
    return {listings:Object.entries(listings).filter(([,row])=>row.expiresAt>now||row.seller===uid)
      .map(([id,row])=>({id,own:row.seller===uid,name:row.name,key:row.key,quantity:row.quantity,unitPrice:row.unitPrice,expired:row.expiresAt<=now})),
      profile:sanitizeState((await profileRef.get()).val())};
  }
  const now=Date.now();
  let result={ok:false,message:'ทำรายการไม่สำเร็จ'};
  if(data.type==='action'){
    const action={...data.action,slot};
    if(!allowedActions.has(action.type))throw new HttpsError('invalid-argument','คำสั่งไม่ถูกต้อง');
    if(action.type==='needsTick')action.pose=player.scene==='inside'?player.pose:'stand';
    if(['sell','seed'].includes(action.type)&&!nearMarket(player))return {ok:false,message:'เดินไปที่ตลาดกลางก่อน'};
    const rolls=Array.from({length:2},()=>randomInt(1_000_000)/1_000_000);
    const saved=await profileRef.transaction(current=>{
      if(!current)return null;
      const state=sanitizeState(current);
      let cursor=0;
      result=applyAction(state,action,now,()=>rolls[cursor++]);
      return result.ok?state:undefined;
    },undefined,false);
    return saved.committed&&saved.snapshot.exists()?{...result,profile:sanitizeState(saved.snapshot.val())}:{...result,ok:false};
  }
  if(!['list','buy','cancel'].includes(data.type))throw new HttpsError('invalid-argument','คำสั่งไม่ถูกต้อง');
  if(!nearMarket(player))return {ok:false,message:'เดินไปที่ตลาดกลางก่อน'};
  const saved=await game.transaction(current=>{
    if(!current)return null;
    const position=current.rooms?.[room]?.slots?.[slot];
    if(position?.uid!==uid||!nearMarket(position)){result={ok:false,message:'เดินไปที่ตลาดกลางก่อน'};return}
    result=trade(current,uid,data,now);
    return result.ok?current:undefined;
  },undefined,false);
  return saved.committed&&saved.snapshot.exists()?{...result,profile:sanitizeState(saved.snapshot.child('profiles/'+uid).val())}:{...result,ok:false};
});

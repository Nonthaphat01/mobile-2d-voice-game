import {ref, onValue, set, update, push, query, limitToLast, orderByChild, serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import {messagePair,playerCard,SOCIAL_LIMIT} from './shared/social.js?v=v5-neighbors-1';
import {ROOM_IDS} from './shared/rules.js?v=v5-neighbors-1';

const ROOT='little-neighborhood-v5';
export function gameSocial(db,uid,ownName){
 const social=ref(db,ROOT+'/social');
 const at=path=>ref(db,ROOT+'/social/'+path);
 const directory=new Map();
 const watchDirectory=notify=>{
   const byRoom=new Map();
   const subscriptions=ROOM_IDS.map(room=>onValue(ref(db,ROOT+'/rooms/'+room+'/slots'),snapshot=>{
     byRoom.set(room,Object.values(snapshot.val()||{}));
     directory.clear();
     for(const [name,players] of byRoom)for(const p of players)if(p?.uid&&p.uid!==uid){
       const current=directory.get(p.uid);
       if(!current||current.updatedAt<(p.updatedAt||0))directory.set(p.uid,{...playerCard(p),room:name,updatedAt:p.updatedAt||0});
     }
     notify();
   }));
   return ()=>subscriptions.forEach(stop=>stop());
 };
 const watchList=(name,notify,fail)=>onValue(at(name+'/'+uid),snap=>notify(snap.val()||{}),fail);
 const sendRequest=async player=>{
   const peer=player.id;
   messagePair(uid,peer);
   await set(at('requests/'+peer+'/'+uid),true);
 };
 const accept=async (peer,name)=>{
   messagePair(uid,peer);
   await update(social,{
     ['contacts/'+uid+'/'+peer]:{name:String(name||'ผู้เล่น').slice(0,18)},
     ['contacts/'+peer+'/'+uid]:{name:String(ownName||'ผู้เล่น').slice(0,18)},
     ['requests/'+uid+'/'+peer]:null
   });
 };
 const decline=peer=>{messagePair(uid,peer);return set(at('requests/'+uid+'/'+peer),null)};
 const watchMessages=(peer,notify,fail)=>onValue(query(at('messages/'+messagePair(uid,peer)),orderByChild('at'),limitToLast(SOCIAL_LIMIT)),snap=>{
   const messages=[];
   snap.forEach(child=>{messages.push(child.val())});
   notify(messages);
 },fail);
 const sendMessage=async (peer,text)=>{
   const value=String(text).trim().slice(0,240);
   if(!value)return;
   await set(push(at('messages/'+messagePair(uid,peer))),{sender:uid,text:value,at:serverTimestamp()});
 };
 return {directory,watchDirectory,watchList,sendRequest,accept,decline,watchMessages,sendMessage};
}

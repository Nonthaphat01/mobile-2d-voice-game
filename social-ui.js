import {playerCard,uidPattern} from './shared/social.js?v=v5-neighbors-1';

export function installSocialUI({el,showDialog,addButton,addText,avatarIcon,notice,currentPlayers,open,isOnline}){
 let adapter, ownId, contacts={}, requests={}, unsub=[], stopMessages, pane, updateList, generation=0, unavailable=false;
 const titleFor=id=>adapter?.directory.get(id)?.name||contacts[id]?.name||'ผู้เล่น '+id.slice(0,6);
 const text=(tag,value,style='')=>{const node=document.createElement(tag);node.className=style;node.textContent=value;return node};
 const setPane=(name,title,draw)=>{
   stopMessages?.();stopMessages=null;updateList=null;pane=name;
   open();
   showDialog(title,draw);
 };
 function liveList(list,items,render){
   const scroll=list.scrollTop;
   list.replaceChildren();
   items.forEach(item=>list.append(render(item)));
   list.scrollTop=scroll;
 }
 function card(person,detail,fn){
   const button=text('button','','player-card');button.type='button';
   const body=text('div','','player-details');
   body.append(text('strong',person.name),text('small',detail,person.room?'player-online':'player-offline'));
   button.append(avatarIcon(person.appearance,'👤',person.name),body);
   button.onclick=fn;
   return button;
 }
 function tryAction(fn,button){
   return async()=>{
     try{await fn()}
     catch(error){
       addText(el('dialogContent'),error.code==='PERMISSION_DENIED'||error.code==='permission-denied'
         ?'ระบบเพื่อนยังไม่เปิดบนเซิร์ฟเวอร์':'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง');
     }
     if(button)button.focus();
   };
 }
 function profile(person){
   setPane('profile','โปรไฟล์ผู้เล่น',d=>{
     const row=text('div','','player-card');
     const details=text('div','','player-details');
     const mins=person.playSeconds===null||person.playSeconds===undefined?null:Math.floor(person.playSeconds/60);
     details.append(text('strong',person.name),
       text('small',mins===null?'เวลาเล่น · ยังไม่มีข้อมูล':'เวลาเล่น · '+Math.floor(mins/60)+' ชม. '+mins%60+' นาที'),
       text('small','เลเวล · '+(person.level??'—')),
       text('small','เงินในเกม · '+(person.money===null||person.money===undefined?'—':person.money.toLocaleString('th-TH')+' บาท')));
     row.append(avatarIcon(person.appearance,'👤',person.name),details);d.append(row);
     if(adapter&&uidPattern.test(person.id||'')){
       if(contacts[person.id])addButton(d,'ส่งข้อความ',()=>conversation(person.id));
       else addButton(d,'ส่งคำขอเป็นเพื่อน',tryAction(async()=>{await adapter.sendRequest(person);notice('ส่งคำขอเป็นเพื่อนแล้ว')}));
     }
     addButton(d,'กลับรายชื่อผู้เล่น',friends);
   });
 }
 function friends(){
   setPane('friends','เพื่อนและผู้เล่น',d=>{
     const list=text('div','','social-list');d.append(list);
     updateList=()=>{
       if(pane!=='friends'||!list.isConnected)return;
       const people=currentPlayers().filter(p=>uidPattern.test(p.id||'')).map(p=>({...playerCard(p),room:p.room}));
       liveList(list,people,p=>card(p,'อยู่ในชุมชน '+p.room,()=>profile(p)));
       if(!people.length)addText(list,'ยังไม่มีผู้เล่นคนอื่นในชุมชนนี้');
     };
     updateList();
     addButton(d,'เปิดโทรศัพท์',phone);
   });
 }
 function phone(){
   setPane('phone','โทรศัพท์',d=>{
     if(!adapter){addText(d,isOnline()?'ระบบเพื่อนและข้อความส่วนตัวยังไม่ได้เปิดบนเซิร์ฟเวอร์':'เข้าชุมชนออนไลน์เพื่อเพิ่มเพื่อนและส่งข้อความ');return}
     const list=text('div','','social-list');d.append(list);
     updateList=()=>{
       if(pane!=='phone'||!list.isConnected)return;
       list.replaceChildren();
       if(unavailable){addText(list,'ระบบรายชื่อเพื่อนยังไม่เปิดบนเซิร์ฟเวอร์');return}
       for(const peer of Object.keys(requests).filter(id=>uidPattern.test(id)&&!contacts[id])){
         const row=text('div','','dialog-row');
         row.append(text('strong',titleFor(peer)+' ขอเป็นเพื่อน'));
         addButton(row,'รับคำขอ',tryAction(()=>adapter.accept(peer,titleFor(peer))));
         addButton(row,'ปฏิเสธ',tryAction(()=>adapter.decline(peer)));
         list.append(row);
       }
       const ids=Object.keys(contacts).filter(id=>uidPattern.test(id));
       ids.sort((a,b)=>Number(adapter.directory.has(b))-Number(adapter.directory.has(a))||titleFor(a).localeCompare(titleFor(b),'th'));
       for(const peer of ids){
         const live=adapter.directory.get(peer);
         const person=live||{id:peer,name:titleFor(peer)};
         list.append(card(person,live?'ออนไลน์ · ชุมชน '+live.room:'ออฟไลน์',()=>conversation(peer)));
       }
       if(!list.childElementCount)addText(list,'ยังไม่มีรายชื่อเพื่อน');
     };
     updateList();
   });
 }
 function conversation(peer){
   if(!contacts[peer])return;
   setPane('conversation',titleFor(peer),d=>{
     const log=text('div','','dm-log');
     log.setAttribute('role','log');log.setAttribute('aria-label','ประวัติข้อความส่วนตัว');d.append(log);
     const form=document.createElement('form');form.className='dm-form';
     const field=document.createElement('input');field.maxLength=240;field.required=true;
     field.placeholder='พิมพ์ข้อความ';field.setAttribute('aria-label','ข้อความส่วนตัว');
     const send=text('button','ส่ง','dialog-action');send.type='submit';
     form.append(field,send);d.append(form);
     form.onsubmit=async event=>{
       event.preventDefault();
       if(!field.value.trim()||send.disabled)return;
       send.disabled=true;
       await tryAction(async()=>{await adapter.sendMessage(peer,field.value);field.value=''},field)();
       send.disabled=false;
     };
     stopMessages=adapter.watchMessages(peer,items=>{
       if(!log.isConnected)return;
       log.replaceChildren();
       for(const message of items){
         const owner=message.sender===ownId;
         const row=text('p','',''+(owner?'mine':''));
         const at=Number.isFinite(message.at)?new Date(message.at).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}):'';
         row.append(text('small',(owner?'คุณ':titleFor(peer))+' '+at),document.createElement('br'),document.createTextNode(message.text));
         log.append(row);
       }
       log.scrollTop=log.scrollHeight;
     },()=>addText(log,'อ่านประวัติข้อความไม่ได้'));
     addButton(d,'กลับหน้ารายชื่อ',phone);
   });
 }
 function disconnect(){
   generation++;
   stopMessages?.();stopMessages=null;
   unsub.forEach(stop=>stop());unsub=[];
   adapter=null;contacts={};requests={};unavailable=false;updateList=null;pane=null;
   el('friendBadge').hidden=true;
 }
 function connect(next,id){
   disconnect();adapter=next;ownId=id;
   if(!adapter)return;
   const current=generation;
   const fail=()=>{if(generation===current){unavailable=true;updateList?.()}};
   const render=()=>{
     if(generation!==current)return;
     const count=Object.keys(requests).filter(peer=>!contacts[peer]).length;
     el('friendBadge').hidden=!count;
     el('friendBadge').textContent=String(count);
     updateList?.();
   };
   unsub.push(adapter.watchDirectory(render),
     adapter.watchList('contacts',list=>{if(generation===current){contacts=list;render()}},fail),
     adapter.watchList('requests',list=>{if(generation===current){requests=list;render()}},fail));
 }
 el('dialog').addEventListener('close',()=>{stopMessages?.();stopMessages=null;updateList=null;pane=null});
 el('friendsBtn').onclick=friends;
 el('phoneBtn').onclick=phone;
 return {connect,disconnect,refresh:()=>updateList?.(),player:id=>adapter?.directory.get(id)};
}

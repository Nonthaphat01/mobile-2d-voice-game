'use strict';

// Needs, recipes, storage, activities, shopping and save data.

const marketStock = [
 ['waterBottle',2],['rice',3],['tomatoSeed',3],['egg',4],['bread',4],['tomato',4],['cheese',5],['toast',11],['sandwich',13]
];
function awardCoins(amount){
 life.wallet.coins=Math.min(99999,life.wallet.coins+amount);
 updateWalletHud();
 saveLife();
}
function buyItem(key,price){
 if(life.wallet.coins<price)return;
 life.wallet.coins-=price;
 life.bag[key]=(life.bag[key]||0)+1;
 toast('ซื้อ '+itemName(key)+' แล้ว');
}

const tileMenus=new Set(['bag','fridge','stove','shop','stall','garage']);
function applyItemAction(run){
 run();
 saveLife();lifeHud();
 if(lifeDialog.open)drawLifeDialog();
}
function tileButton(text,run,disabled){
 const button=document.createElement('button');
 button.type='button';button.textContent=text;button.disabled=!!disabled;
 button.onclick=()=>applyItemAction(run);
 return button;
}
function itemTile({icon,label,count,detail,action,extra=[]}){
 const tile=document.createElement('article');
 tile.className='item-tile';
 const main=document.createElement(action?'button':'div');
 main.className='item-tile-main';
 if(action){
   const [caption,run,disabled]=action;
   main.type='button';main.disabled=!!disabled;
   main.setAttribute('aria-label',caption+' '+label);
   main.onclick=()=>applyItemAction(run);
 }
 const image=document.createElement('span');
 image.className='item-symbol';image.textContent=icon;
 image.setAttribute('aria-hidden','true');
 const title=document.createElement('strong');
 title.textContent=label;
 main.append(image,title);
 if(count!==undefined){
   const quantity=document.createElement('span');
   quantity.className='item-quantity';quantity.textContent='×'+count;
   main.append(quantity);
 }
 if(detail){
   const info=document.createElement('small');
   info.textContent=detail;main.append(info);
 }
 if(action){
   const caption=document.createElement('span');
   caption.className='item-command';caption.textContent=action[0];
   main.append(caption);
 }
 tile.append(main);
 if(extra.length){
   const controls=document.createElement('div');
   controls.className='item-extra';
   for(const choice of extra)controls.append(tileButton(...choice));
   tile.append(controls);
 }
 $('lifeRows').append(tile);
}
function foodTile(key,info){
 const [icon,label]=foods[key];
 itemTile({icon,label,...info});
}
function drawFridgeTiles(){
 for(const key of Object.keys(staples)){
   foodTile(key,{count:life.fridge[key],
     action:['หยิบ',()=>transfer(life.fridge,life.bag,key),!life.fridge[key]],
     extra:[['เก็บคืน',()=>transfer(life.bag,life.fridge,key),!life.bag[key]]]});
 }
 lifeRow('เติมของในตู้เย็น',[['เติมของ',()=>{
   for(const [key,count] of Object.entries(staples))life.fridge[key]=Math.max(life.fridge[key],count);
 },Object.keys(staples).every(key=>life.fridge[key]>=staples[key])]]);
}
function drawRecipeTiles(){
 for(const [key,ingredients] of Object.entries(recipes)){
   const entries=Object.entries(ingredients);
   const detail=entries.map(([item,n])=>foods[item][0]+' '+(life.bag[item]||0)+'/'+n).join(' · ');
   foodTile(key,{detail,action:['ปรุง',()=>cook(key),entries.some(([item,n])=>(life.bag[item]||0)<n)]});
 }
}
function drawBagTiles(){
 lifeRow('🪙 '+life.wallet.coins+' เหรียญ');
 for(const [key,count] of Object.entries(life.bag)){
   if(count<=0)continue;
   const edible=foods[key][2];
   const label=key==='waterBottle'?'ดื่ม':'กิน';
   foodTile(key,{count,action:edible?[label,()=>eat(key),me.pose!=='stand']:undefined});
 }
 itemTile({icon:'🪨',label:'หิน',count:minedCount});
 for(const [i,tool] of TOOLS.entries()){
   if(miningLevel<tool.unlock)continue;
   itemTile({icon:tool.icon,label:tool.name,action:[i===selectedTool?'ถืออยู่':'ถือ',()=>switchTool(i),i===selectedTool]});
 }
}
function drawGroceryTiles(){
 lifeRow('🪙 '+life.wallet.coins+' เหรียญ');
 const tomatoes=Math.floor(life.bag.tomato||0);
 lifeRow('ร้านรับซื้อมะเขือเทศ '+farmTomatoPrice+' เหรียญ/ลูก',[
   ['ขายในกระเป๋า ('+tomatoes+')',()=>sellBagTomatoes(),tomatoes===0]
 ]);
 for(const [key,price] of marketStock){
   foodTile(key,{count:life.bag[key]||0,action:['ซื้อ '+price+' 🪙',()=>buyItem(key,price),life.wallet.coins<price]});
 }
}

const stallPosition={x:stallCounterBlock.x+stallCounterBlock.w/2,y:stallCounterBlock.y+20};
const stallProducts=[
 {key:'waterBottle',price:5},
 {key:'tomato',price:6},
 {key:'fish',price:8}
];
const stallClerkFee=12;
const stallClerk={
 x:stallPosition.x,y:stallPosition.y-27,name:'ขิม · คนขาย',face:Math.PI/2,walking:false,
 appearance:{gender:1,skin:2,hair:0,style:3,outfit:2,accessory:0}
};
const shoppers=[
 ['แตงโม',1,2,3,3],['กล้า',0,1,1,4],['เดือน',1,3,1,5],
 ['ข้าวปั้น',2,4,2,1],['พลอย',1,2,0,0],['ดล',0,3,2,2],['น้ำหวาน',1,1,1,3]
];
const stallLine=[];
const stallDepartures=[];
let shopperId=0,stallArrivalDelay=.55,stallServiceTime=0,lastStallSale=null;

function makeShopSave(){
 return {waterBottle:0,tomato:0,fish:0,hired:0,open:0,sales:0,revenue:0};
}
function stallAvailable(){
 return stallProducts.filter(({key})=>life.shop[key]>=1);
}
function stallStockCount(){
 return stallProducts.reduce((sum,{key})=>sum+Math.floor(life.shop[key]),0);
}
function stallOwnerPresent(){
 return scene==='outside'&&Math.hypot(me.x-stallPosition.x,me.y-stallPosition.y)<133;
}
function nearShopStall(){
 if(Math.hypot(me.x-stallPosition.x,me.y-stallPosition.y)>53)return;
 return {label:'จัดการแผงหน้าร้าน',run:()=>openLife('stall')};
}
function changeStallStock(key,amount){
 if(amount>0){
   const inBag=Math.floor(life.bag[key]||0);
   const added=Math.min(amount,inBag,99-Math.floor(life.shop[key]));
   if(added<=0)return;
   life.bag[key]-=added;
   life.shop[key]+=added;
 }else{
   if(life.shop[key]<1)return;
   life.shop[key]--;
   life.bag[key]=(life.bag[key]||0)+1;
 }
}
function hireStallClerk(){
 if(life.shop.hired||life.wallet.coins<stallClerkFee)return;
 life.wallet.coins-=stallClerkFee;
 life.shop.hired=1;
 toast('ขิมเริ่มงานแล้ว เปิดแผงและเติมสต๊อกเพื่อให้ขิมขายแทน');
}
function dismissStallClerk(){
 if(!life.shop.hired)return;
 life.shop.hired=0;
 toast('เลิกจ้างขิมแล้ว • คุณเฝ้าแผงและขายเองได้');
}
function drawStallMenu(){
 lifeRow('🪙 เงิน '+life.wallet.coins+' เหรียญ · ขายแล้ว '+life.shop.sales+' ชิ้น');
 for(const {key,price} of stallProducts){
   const inBag=life.bag[key]||0;
   const inStock=life.shop[key];
   foodTile(key,{count:inStock,detail:'ขาย '+price+' 🪙 · มี '+inBag+' ในกระเป๋า',extra:[
     ['เติม +1',()=>changeStallStock(key,1),!inBag||inStock>=99],
     ['เติม +5',()=>changeStallStock(key,5),inBag<5||inStock>94],
     ['นำคืน',()=>changeStallStock(key,-1),!inStock]
   ]});
 }
 if(life.shop.hired){
   lifeRow('ขิมประจำแผง · ขายแทนได้ระหว่างที่คุณไปทำอย่างอื่น',[['เลิกจ้าง',dismissStallClerk]]);
 }else{
   lifeRow('เฝ้าแผงเองหรือจ้างขิมมาช่วยขาย',[
     ['จ้าง 12 🪙',hireStallClerk,life.wallet.coins<stallClerkFee]
   ]);
 }
 const open=!!life.shop.open;
 lifeRow(open?'เปิดขาย · ลูกค้าในแถว '+stallLine.length:'แผงปิดอยู่',[
   [open?'ปิดแผง':'เปิดขาย',()=>{
     life.shop.open=Number(!open);
     toast(open?'ปิดแผงแล้ว':'เปิดแผงแล้ว ลูกค้าจะเดินมาต่อคิว');
   },!open&&!stallStockCount()]
 ]);
 if(!stallStockCount())lifeRow('ซื้อน้ำที่ร้านชำ หรือเก็บมะเขือเทศจากแปลงผักมาเติมสต๊อก');
}
function makeStallCustomer(){
 const [name,gender,skin,style,outfit]=shoppers[shopperId%shoppers.length];
 shopperId++;
 return {x:stallPosition.x+268,y:stallPosition.y+22,name,walking:true,face:Math.PI,
   appearance:{gender,skin,hair:shopperId%5,style,outfit,accessory:0}};
}
function walkToSpot(customer,x,y,dt,speed=105){
 const dx=x-customer.x,dy=y-customer.y;
 const distance=Math.hypot(dx,dy);
 const stride=Math.min(distance,speed*dt);
 customer.walking=distance>2;
 if(distance){
   customer.x+=dx*stride/distance;
   customer.y+=dy*stride/distance;
 }
 if(customer.walking)customer.face=Math.atan2(dy,dx);
 return distance<=2;
}
function sendStallCustomerAway(customer){
 stallDepartures.push(customer);
}
function completeStallSale(now,customer){
 const available=stallAvailable();
 if(!available.length)return;
 const {key,price}=available[Math.floor(Math.random()*available.length)];
 life.shop[key]--;
 life.shop.sales=Math.min(99999,life.shop.sales+1);
 life.shop.revenue=Math.min(99999,life.shop.revenue+price);
 awardCoins(price);
 lastStallSale={price,stamp:now};
 customer.text='ขอบคุณนะ!';
 customer.until=Date.now()+2200;
 if(lifeMode==='stall'&&lifeDialog.open)drawLifeDialog();
}
function shopTick(now,dt,night=false){
 for(let i=stallDepartures.length-1;i>=0;i--){
   const npc=stallDepartures[i];
   if(walkToSpot(npc,stallPosition.x+283,stallPosition.y+30,dt))stallDepartures.splice(i,1);
 }
 const staffed=life.shop.hired||stallOwnerPresent();
 const stock=stallStockCount();
 if(!life.shop.open||!staffed||!stock){
   while(stallLine.length)sendStallCustomerAway(stallLine.shift());
   stallArrivalDelay=.55;
   stallServiceTime=0;
   return;
 }
 stallArrivalDelay=Math.max(0,stallArrivalDelay-dt);
 const cap=Math.min(night?1:4,stock);
 if(stallLine.length<cap&&stallArrivalDelay===0){
   stallLine.push(makeStallCustomer());
   stallArrivalDelay=night?5.5+Math.random()*3:1.1+Math.random()*.65;
 }
 let firstReady=false;
 stallLine.forEach((customer,i)=>{
   const arrived=walkToSpot(customer,stallPosition.x+46+i*56,stallPosition.y+23,dt);
   if(i===0)firstReady=arrived;
 });
 stallServiceTime=firstReady?stallServiceTime+dt:0;
 if(stallServiceTime>=2.05){
   const customer=stallLine.shift();
   completeStallSale(now,customer);
   sendStallCustomerAway(customer);
   stallServiceTime=0;
 }
}
function drawStallCounter(){
 const {x,y}=stallPosition;
 rect(x-43,y+2,86,15,5,'#3d514656');
 rect(x-35,y-11,70,22,4,'#805c49');
 rect(x-35,y-14,70,10,4,'#e7c799');
 rect(x-28,y-5,56,12,3,'#a77754');
 rect(x-35,y-61,4,49,1,'#755c50');
 rect(x+30,y-61,4,49,1,'#755c50');
 if(life.shop.waterBottle){
   for(let i=0;i<Math.min(3,life.shop.waterBottle);i++){
     const bx=x-25+i*9;
     rect(bx,y-26,6,13,2,'#73c3d8');
     rect(bx+1,y-28,4,3,1,'#d5edeb');
   }
 }
 if(life.shop.tomato){
   rect(x+7,y-21,23,7,2,'#b98850');
   for(let i=0;i<Math.min(4,life.shop.tomato);i++)circle(x+11+i*5,y-21,3,'#d65c57');
 }
 if(life.shop.fish){
   rect(x-6,y-23,16,8,3,'#dbe7df');
   rect(x-4,y-23,10,5,3,'#8c9fa8');
   circle(x+4,y-21,1,'#354d5c');
 }
 rect(x-38,y-62,76,11,3,'#724b49');
 for(let i=0;i<8;i++)rect(x-36+i*9,y-60,7,11,2,i%2?'#e8bd84':'#bb7471');
 mapLabel('แผงน้ำและผัก',x,y+6,'#fff2cc');
 mapLabel(!life.shop.open?'ปิดแผง':stallStockCount()?'เปิดขาย':'ของหมด',x,y+26,'#3c5147');
}
function queueStallDrawing(drawList,visible,now){
 const {x,y}=stallPosition;
 if(visible(x,y,125)){
   if(life.shop.hired)drawList.push([stallClerk.y,()=>avatar(stallClerk)]);
   drawList.push([y+12,drawStallCounter]);
   const age=lastStallSale?now-lastStallSale.stamp:Infinity;
   if(age<1700){
     drawList.push([y+60,()=>{
       ctx.save();
       ctx.globalAlpha=1-age/1700;
       mapLabel('+'+lastStallSale.price+' 🪙',x+38,y-41-age*.025,'#654623');
       ctx.restore();
     }]);
   }
 }
 for(const npc of [...stallLine,...stallDepartures]){
   if(visible(npc.x,npc.y))drawList.push([npc.y,()=>avatar(npc)]);
 }
}
function drawShopIncomeHud(now){
 const age=lastStallSale?now-lastStallSale.stamp:Infinity;
 if(age>1800||scene==='outside'&&stallOwnerPresent())return;
 const y=(W<920?161:81)-age*.011;
 ctx.save();
 ctx.globalAlpha=Math.min(1,(1800-age)/450);
 rect(W/2-72,y-16,144,30,8,'#273c2de6');
 mapLabel('ขายได้ +'+lastStallSale.price+' 🪙',W/2,y+4,'#ffe6a8');
 ctx.restore();
}

const activityTimes = {cook:3000,eat:2200,plant:1100,water:1550,harvest:1000,exercise:6000,fish:5600,dance:8000,read:12000};
const growTime = 16000;
let completeActivity = null,manualGardenId=null;
const farmHireFee=10,farmTomatoPrice=4,farmBatchSize=10;
const shipmentTime=4600;
const farmWorker={
 ...gardenDesk,name:'มะปราง',face:Math.PI/2,pose:'stand',walking:false,
 appearance:{gender:1,skin:2,hair:1,style:3,outfit:4,accessory:2}
};
const farmRouteLengths=farmRoute.slice(1).map((point,i)=>Math.hypot(point.x-farmRoute[i].x,point.y-farmRoute[i].y));
const farmRouteDistance=farmRouteLengths.reduce((total,length)=>total+length,0);
let farmTarget=null,farmWorkAfter=0,farmReturnAt=0,farmStatus='';

function beginActivity(kind,item,message,finish,face){
 if(me.action||me.pose!=='stand'||poseIsChanging()||swimAtPlayer()||isInVehicle())return;
 me.action={kind,item,started:performance.now(),duration:activityTimes[kind]};
 if(Number.isFinite(face))me.face=face;
 completeActivity=finish;
 me.walking=false;
 pauseWalking();
 stopMineHold();
 clearInterval(mineSpaceInterval);
 if(lifeDialog.open)lifeDialog.close();
 if(kind==='cook')playGameSound('cook');
 toast(message);
 broadcast(snapshot());
 return true;
}

function tickActivity(now){
 const action=me.action;
 if(!action||now-action.started<action.duration)return;
 const finish=completeActivity;
 completeActivity=null;
 me.action=null;
 setRiseButton();
 finish();
 saveLife();
 lifeHud();
 broadcast(snapshot());
}

function activitySnapshot(){
 const action=me.action;
 if(!action)return null;
 return {kind:action.kind,item:action.item,remaining:Math.max(0,Math.round(action.started+action.duration-performance.now()))};
}

function readActivity(player,data){
 if(!data||!Object.hasOwn(activityTimes,data.kind)||(['exercise','fish','dance','read'].includes(data.kind)?data.item!==data.kind:!Object.hasOwn(foods,data.item))){
   player.action=null;
   return;
 }
 const duration=activityTimes[data.kind];
 if(!Number.isFinite(data.remaining)||data.remaining<=0||data.remaining>duration){
   player.action=null;
   return;
 }
 const started=performance.now()+data.remaining-duration;
 if(player.action?.kind===data.kind&&player.action.item===data.item&&Math.abs(player.action.started-started)<250)return;
 player.action={kind:data.kind,item:data.item,started,duration};
}

function eat(key){
 if(!foods[key]?.[2]||!life.bag[key])return;
 beginActivity('eat',key,'กำลังกิน'+foods[key][1]+'…',()=>{
   life.bag[key]--;
   changeNeed('fullness',foods[key][2]);
   toast('กิน'+foods[key][1]+'แล้ว · ความอิ่มเพิ่มขึ้น');
 });
}

function gardenAction(plot){
 const status=life.garden[plot.id];
 const facing=Math.atan2(plot.y-me.y,plot.x-me.x);
 let started=false;
 if(status===0){
   if(!life.bag.tomatoSeed)return toast('เมล็ดมะเขือเทศหมด ซื้อเพิ่มได้ที่ร้านค้าชุมชน');
   started=beginActivity('plant','tomatoSeed','กำลังปลูกมะเขือเทศ…',()=>{
     manualGardenId=null;
     if(plantGarden(plot))toast('ปลูกแล้ว กด E เพื่อรดน้ำ');
   },facing);
 }else if(status===1){
   started=beginActivity('water','tomatoSeed','กำลังรดน้ำ…',()=>{
     manualGardenId=null;
     if(waterGarden(plot))toast('รดน้ำแล้ว มะเขือเทศพร้อมเก็บใน 16 วินาที');
   },facing);
 }else if(harvestReady(plot)){
   started=beginActivity('harvest','tomato','กำลังเก็บมะเขือเทศ…',()=>{
     manualGardenId=null;
     if(collectGarden(plot)){
       life.bag.tomato=(life.bag.tomato||0)+2;
       toast('เก็บมะเขือเทศ 2 ลูก และเมล็ด 1 เมล็ด');
     }
   },facing);
 }
 if(started)manualGardenId=plot.id;
}
function plantGarden(plot){
 if(life.garden[plot.id]!==0||!(life.bag.tomatoSeed>0))return false;
 life.bag.tomatoSeed--;
 life.garden[plot.id]=1;
 return true;
}
function waterGarden(plot){
 if(life.garden[plot.id]!==1)return false;
 life.garden[plot.id]=Date.now()+growTime;
 return true;
}
function harvestReady(plot,wallTime=Date.now()){
 const status=life.garden[plot.id];
 return status>1&&status<=wallTime;
}
function collectGarden(plot){
 if(!harvestReady(plot))return false;
 life.garden[plot.id]=0;
 life.bag.tomatoSeed=(life.bag.tomatoSeed||0)+1;
 return true;
}
function hireFarmWorker(){
 if(life.farm.hired||life.wallet.coins<farmHireFee)return;
 life.wallet.coins-=farmHireFee;
 life.farm.hired=1;
 Object.assign(farmWorker,gardenDesk,{walking:false,action:null});
 farmReturnAt=0;
 farmTarget=null;
 setFarmStatus('มะปรางกำลังตรวจแปลง');
 toast('มะปรางเริ่มดูแลแปลงแล้ว');
}
function dismissFarmWorker(){
 if(life.farm.inTransit)return;
 life.farm.hired=0;
 life.farm.shipRequested=0;
 farmWorker.walking=false;
 farmWorker.action=null;
 farmTarget=null;
 farmReturnAt=0;
 farmStatus='';
}
function sellBagTomatoes(){
 const count=Math.floor(life.bag.tomato||0);
 if(!count)return;
 life.bag.tomato-=count;
 const coins=count*farmTomatoPrice;
 awardCoins(coins);
 toast('ขายมะเขือเทศ '+count+' ลูก ได้ '+coins+' เหรียญ');
}
function updateFarmMenu(){
 if(lifeMode==='farm'&&lifeDialog.open)drawLifeDialog();
}
function setFarmStatus(status){
 if(farmStatus===status)return;
 farmStatus=status;
 const label=$('farmWorkerStatus');
 if(label)label.textContent=status;
}
function drawFarmMenu(){
 const farm=life.farm;
 const planted=gardenPlots.filter(plot=>life.garden[plot.id]>0).length;
 const ready=gardenPlots.filter(plot=>harvestReady(plot)).length;
 lifeRow('ปลูกแล้ว '+planted+' / '+gardenPlots.length+' แปลง · พร้อมเก็บ '+ready);
 lifeRow('มะเขือเทศในลัง '+farm.crate+' ลูก · ร้านรับซื้อ '+farmTomatoPrice+' เหรียญ/ลูก',[
   ['ใส่กระเป๋า',()=>{
     life.bag.tomato=(life.bag.tomato||0)+farm.crate;
     farm.crate=0;
     farm.shipRequested=0;
   },!farm.crate]
 ]);
 if(!farm.hired){
   lifeRow('มะปรางปลูก รดน้ำ เก็บผลสุก และนำไปส่งร้าน',[
     ['จ้าง '+farmHireFee+' 🪙',hireFarmWorker,life.wallet.coins<farmHireFee]
   ]);
 }else{
   const workerRow=lifeRow(farmStatus||(farm.inTransit?'กำลังส่งมะเขือเทศ '+farm.inTransit+' ลูก':'มะปรางกำลังตรวจแปลง'),[
     ['เลิกจ้าง',dismissFarmWorker,!!farm.inTransit]
   ]);
   workerRow.firstElementChild.id='farmWorkerStatus';
   lifeRow('ปลูกและรดน้ำ '+(farm.tend?'อัตโนมัติ':'ด้วยตัวเอง')+' · เมล็ดในกระเป๋า '+(life.bag.tomatoSeed||0),[
     [farm.tend?'ให้เก็บเกี่ยวอย่างเดียว':'ให้ปลูกและรดน้ำ',()=>{
       farm.tend=Number(!farm.tend);
       farmTarget=null;
     }]
   ]);
   lifeRow(farm.autoShip?'ส่งอัตโนมัติ · เปิด':'ส่งอัตโนมัติ · ปิด',[
     [farm.autoShip?'ปิด':'เปิด',()=>{farm.autoShip=Number(!farm.autoShip)}],
     ['ส่งไปขาย',()=>{farm.shipRequested=1},!farm.crate||!!farm.inTransit||!!farm.shipRequested]
   ]);
 }
 lifeRow('ส่งขายแล้ว '+farm.sold+' ลูก · รายได้ '+farm.revenue+' เหรียญ');
}
function startFarmShipment(wallTime){
 const farm=life.farm;
 if(farm.inTransit||!farm.crate)return;
 farm.inTransit=farm.crate;
 farm.crate=0;
 farm.shipRequested=0;
 farm.deliverAt=wallTime+shipmentTime;
 farmTarget=null;
 farmWorker.action=null;
 saveLife();
 updateFarmMenu();
}
function moveFarmShipment(progress,returning=false){
 let distance=Math.max(0,Math.min(1,progress))*farmRouteDistance;
 let segment=0;
 while(segment<farmRouteLengths.length-1&&distance>farmRouteLengths[segment]){
   distance-=farmRouteLengths[segment++];
 }
 const a=farmRoute[segment],b=farmRoute[segment+1];
 const fraction=distance/farmRouteLengths[segment];
 farmWorker.x=a.x+(b.x-a.x)*fraction;
 farmWorker.y=a.y+(b.y-a.y)*fraction;
 farmWorker.face=Math.atan2(b.y-a.y,b.x-a.x)+(returning?Math.PI:0);
 farmWorker.walking=true;
}
function settleFarmShipment(wallTime){
 const farm=life.farm;
 const count=farm.inTransit,coins=count*farmTomatoPrice;
 farm.sold=Math.min(99999,farm.sold+count);
 farm.revenue=Math.min(99999,farm.revenue+coins);
 farm.inTransit=0;
 farm.deliverAt=0;
 farmReturnAt=wallTime+shipmentTime;
 setFarmStatus('มะปรางกำลังเดินกลับสวน');
 awardCoins(coins);
 toast('ส่งถึงร้านแล้ว · มะเขือเทศ '+count+' ลูก · +'+coins+' เหรียญ');
 updateFarmMenu();
}
const farmTasks={
 harvest:{label:'เก็บมะเขือเทศ',duration:650,item:'tomato'},
 water:{label:'รดน้ำ',duration:700,item:'tomatoSeed'},
 plant:{label:'ปลูกมะเขือเทศ',duration:650,item:'tomatoSeed'}
};
function gardenTaskFor(plot,wallTime){
 if(plot.id===manualGardenId)return null;
 if(harvestReady(plot,wallTime)&&life.farm.crate<=99997)return 'harvest';
 if(!life.farm.tend)return null;
 const status=life.garden[plot.id];
 if(status===1)return 'water';
 if(status===0&&life.bag.tomatoSeed>0)return 'plant';
 return null;
}
function nextFarmTask(wallTime){
 const priority={harvest:0,water:1,plant:2};
 let best=null;
 for(const plot of gardenPlots){
   const kind=gardenTaskFor(plot,wallTime);
   if(!kind)continue;
   const distance=(farmWorker.x-plot.x)**2+(farmWorker.y-plot.y)**2;
   if(!best||priority[kind]<priority[best.kind]||kind===best.kind&&distance<best.distance){
     best={plot,kind,distance};
   }
 }
 return best;
}
function finishFarmTask({plot,kind}){
 if(kind==='plant')return plantGarden(plot);
 if(kind==='water')return waterGarden(plot);
 if(!collectGarden(plot))return false;
 life.farm.crate+=2;
 return true;
}
function farmTick(now,dt){
 const farm=life.farm,wallTime=Date.now();
 if(farm.inTransit){
   setFarmStatus('กำลังส่งมะเขือเทศ '+farm.inTransit+' ลูกไปที่ร้าน');
   moveFarmShipment(1-(farm.deliverAt-wallTime)/shipmentTime);
   if(wallTime>=farm.deliverAt)settleFarmShipment(wallTime);
   return;
 }
 if(!farm.hired)return;
 if(wallTime<farmReturnAt){
   moveFarmShipment((farmReturnAt-wallTime)/shipmentTime,true);
   return;
 }
 if(farmReturnAt){
   Object.assign(farmWorker,gardenDesk);
   farmReturnAt=0;
 }
 if(!farmTarget||gardenTaskFor(farmTarget.plot,wallTime)!==farmTarget.kind){
   farmTarget=nextFarmTask(wallTime);
   farmWorkAfter=0;
   farmWorker.action=null;
 }
 const hasRipe=farmTarget?.kind==='harvest'||gardenPlots.some(plot=>gardenTaskFor(plot,wallTime)==='harvest');
 if(farm.crate&&(farm.shipRequested||farm.autoShip&&(!hasRipe||farm.crate>=farmBatchSize))){
   setFarmStatus('มะปรางกำลังไปยกลัง');
   farmWorkAfter=0;
   farmWorker.action=null;
   if(walkToSpot(farmWorker,gardenDesk.x,gardenDesk.y,dt))startFarmShipment(wallTime);
   return;
 }
 if(!farmTarget){
   const growing=gardenPlots.some(plot=>life.garden[plot.id]>wallTime);
   const dry=gardenPlots.some(plot=>life.garden[plot.id]===1);
   setFarmStatus(growing?'รอผลผลิตโต':dry&&!farm.tend?'รอให้คุณรดน้ำ':
     farm.tend?'รอเมล็ดมะเขือเทศในกระเป๋า':'รอผลผลิตพร้อมเก็บ');
   walkToSpot(farmWorker,gardenDesk.x,gardenDesk.y,dt);
   return;
 }
 const {plot,kind}=farmTarget;
 const task=farmTasks[kind];
 setFarmStatus('มะปรางกำลัง'+task.label+' · แปลง '+(gardenPlots.indexOf(plot)+1));
 if(!walkToSpot(farmWorker,plot.x,plot.y+16,dt))return;
 if(!farmWorkAfter){
   farmWorkAfter=now+task.duration;
   farmWorker.action={kind,item:task.item,started:now,duration:task.duration};
 }
 if(now<farmWorkAfter)return;
 if(finishFarmTask(farmTarget)){
   saveLife();
   updateFarmMenu();
 }
 farmWorker.action=null;
 farmTarget=null;
}
function queueGardenDrawing(drawList,visible){
 if((life.farm.hired||life.farm.inTransit)&&visible(farmWorker.x,farmWorker.y)){
   drawList.push([farmWorker.y,()=>avatar(farmWorker)]);
 }
}

function nearGarden(){
 if(Math.hypot(me.x-gardenDesk.x,me.y-gardenDesk.y)<28){
   return {label:'จัดการสวนและจ้างคนเก็บ',run:()=>openLife('farm')};
 }
 let plot;
 let nearest=36;
 for(const candidate of gardenPlots){
   const d=Math.hypot(me.x-candidate.x,me.y-candidate.y);
   if(d<nearest){nearest=d;plot=candidate}
 }
 if(!plot)return;
 const status=life.garden[plot.id];
 if(status>1&&status>Date.now())return;
 const label=status===0?'ปลูกมะเขือเทศ':status===1?'รดน้ำ':'เก็บมะเขือเทศ';
 return {label,run:()=>gardenAction(plot)};
}

function drawGarden(now){
 const wallTime=Date.now();
 const {x,y,w,h,gateX}=backyard;
 rect(x,y,w,h,13,'#a9b878');
 rect(x+10,y+10,w-20,h-20,11,'#b9c48b');
 rect(gateX-24,y+h-39,48,61,7,'#d0b383');
 for(const fence of yardFences){
   rect(fence.x,fence.y+3,fence.w+2,fence.h,1,'#64704c');
   rect(fence.x,fence.y,fence.w,fence.h,1,'#a37450');
   const horizontal=fence.w>fence.h;
   const count=Math.floor((horizontal?fence.w:fence.h)/25);
   for(let i=0;i<count;i++){
     const postX=fence.x+(horizontal?i*25:0);
     const postY=fence.y+(horizontal?0:i*25);
     rect(postX-1,postY-7,8,14,2,'#855b43');
     rect(postX,postY-7,7,4,2,'#c39766');
   }
 }
 mapLabel('สวนหลังบ้าน',x+w/2,y+19,'#395638');
 for(const {id,x,y} of gardenPlots){
   const status=life.garden[id];
   const wet=status>1&&status>wallTime;
   const ready=status>1&&!wet;
   rect(x-24,y-16,48,37,7,'#4a472e58');
   rect(x-24,y-20,48,36,7,'#ab794a');
   rect(x-20,y-16,40,28,5,wet?'#604938':'#856143');
   for(let i=-1;i<=1;i++)rect(x-16,y+i*7-2,32,2,1,wet?'#795e44':'#a67c53');
   if(status===0)continue;
   const growth=ready?1:wet?.3+.7*Math.max(0,1-(status-wallTime)/growTime):.24;
   const stem=10+growth*21;
   const sway=Math.sin(now/380+x)*1.4*growth;
   ctx.strokeStyle='#387345';ctx.lineWidth=3;
   ctx.beginPath();ctx.moveTo(x,y+4);ctx.quadraticCurveTo(x-2,y-stem/2,x+sway,y-stem);ctx.stroke();
   circle(x-4-growth*6,y-stem*.57,3+growth*4,'#438a49');
   circle(x+5+growth*6,y-stem*.74,3+growth*4,'#65a755');
   circle(x+sway,y-stem,4+growth*3,'#7cb55c');
   if(wet){
     const width=36*(growth-.3)/.7;
     rect(x-18,y+19,36,4,2,'#d1c7a6');rect(x-18,y+19,width,4,2,'#4da1ae');
   }
   if(ready){
     circle(x-8,y-17,5,'#e65d4a');circle(x+8,y-12,5,'#f27855');circle(x+4,y-25,4,'#f3815b');
     circle(x-9,y-19,1.4,'#ffbe91');circle(x+7,y-14,1.4,'#ffbe91');
   }
 }
 rect(gardenDesk.x-18,gardenDesk.y-15,36,23,4,'#87553c');
 rect(gardenDesk.x-16,gardenDesk.y-17,32,8,3,'#c69b63');
 mapLabel('สวน',gardenDesk.x,gardenDesk.y+2,'#fff3cd');
}

function drawCookingFx(stove){
 const now=performance.now();
 const active=player=>player.action?.kind==='cook'&&now-player.action.started<player.action.duration;
 if(!active(me)&&![...others.values()].some(p=>p.scene==='room'&&active(p)))return;
 const x=stove.x+21,y=stove.y+21;
 rect(x+7,y-2,19,4,2,'#2b3437');
 circle(x,y,11,'#242e32');circle(x,y,8,'#7f7369');circle(x,y,5,'#ffe2a2');
 circle(x+1,y,2.5,'#e9a83d');
 for(let i=0;i<4;i++){
   const rise=(now/650+i/4)%1;
   ctx.globalAlpha=(1-rise)*.63;
   circle(x-7+i*4+Math.sin(rise*5+i)*3,y-7-rise*22,2+rise*3,'#fff5e3');
 }
 ctx.globalAlpha=1;
}

const foods = {
 rice:['🌾','ข้าวสาร'],cookedRice:['🍚','ข้าวสวย',25],
 fish:['🐟','ปลาน้ำจืด'],waterBottle:['💧','น้ำดื่ม',7],
 egg:['🥚','ไข่'], bread:['🍞','ขนมปัง',12], tomato:['🍅','มะเขือเทศ',8],
 cheese:['🧀','ชีส',10], toast:['🍳','ขนมปังไข่',38], sandwich:['🥪','แซนด์วิชชีส',48],
 tomatoSeed:['🌱','เมล็ดมะเขือเทศ']
};
const recipes = {
 cookedRice:{rice:1},
 toast:{egg:1,bread:1}, sandwich:{bread:1,tomato:1,cheese:1}
};
const staples = {egg:4,bread:6,tomato:4,cheese:4,rice:4};
const life = {
 fridge:{...staples}, bag:{tomatoSeed:3}, needs:{fullness:78,energy:84,mood:72,health:100},
 friends:{}, contacts:{},
 garden:Object.fromEntries(gardenPlots.map(plot=>[plot.id,0])),
 farm:{hired:0,tend:1,autoShip:1,crate:0,inTransit:0,deliverAt:0,shipRequested:0,sold:0,revenue:0}
};

const kitchen = [
 {x:603,y:240,w:67,h:62,t:'fridge',label:'ตู้เย็น'},
 {x:600,y:147,w:74,h:53,t:'stove',label:'เตา'}
];
const lifeDialog = $('lifeDialog');
let lifeMode = '', lifeTarget = null, lastLifeUpdate = 0, lifeSaveTime = 0;

function loadLife(){
 try{
   const save=JSON.parse(localStorage.getItem('thai2d_life_v4')||'{}');
   for(const group of Object.keys(life)){
     const allowed=group==='bag'?Object.keys(foods):
       group==='friends'||group==='contacts'?allResidentRoutes.map(([name])=>name):Object.keys(life[group]);
     for(const key of allowed){
       const n=save[group]?.[key];
       if(Number.isFinite(n)&&n>=0){
         const timestamp=['garden','clock'].includes(group)||group==='farm'&&key==='deliverAt';
         const flag=group==='contacts'||group==='farm'&&['hired','tend','autoShip','shipRequested'].includes(key);
         const limit=group==='needs'?100:flag?1:timestamp?Number.MAX_SAFE_INTEGER:99999;
         life[group][key]=Math.min(limit,n);
       }
     }
   }
 }catch{}
}
function saveLife(){
 try{localStorage.setItem('thai2d_life_v4',JSON.stringify(life))}catch{}
}
function changeNeed(key,amount){
 life.needs[key]=Math.max(0,Math.min(100,life.needs[key]+amount));
}
function updateWalletHud(){
 $('walletCoins').textContent=life.wallet.coins.toLocaleString('th-TH');
}
function lifeHud(){
 for(const [key,n] of Object.entries(life.needs)){
   const ring=$(key);
   const value=Math.round(n);
   if(ring.getAttribute('aria-valuenow')!==String(value)){
     ring.setAttribute('aria-valuenow',value);
     ring.style.setProperty('--fill',value+'%');
     $(key+'Value').textContent=value+'%';
   }
 }
 updateWalletHud();
 $('townClock').textContent=timeReadout();
 $('poseMenu').disabled=!canChoosePose();
 $('place').textContent=scene==='outside'?townRegion(me.x,me.y):scene==='mine'?'เหมือง':'บ้านของเรา';
}
function itemName(key){return foods[key].slice(0,2).join(' ')}
function lifeRow(label,actions=[]){
 const row=document.createElement('div');
 row.className='life-row';
 const name=document.createElement('span');
 name.textContent=label;
 row.append(name);
 for(const [text,fn,disabled] of actions){
   const button=document.createElement('button');
   button.textContent=text;
   button.disabled=!!disabled;
   button.onclick=()=>{fn();saveLife();lifeHud();if(lifeDialog.open)drawLifeDialog()};
   row.append(button);
 }
 $('lifeRows').append(row);
 return row;
}
function transfer(from,to,key){
 if(!(from[key]>0))return;
 from[key]--;to[key]=(to[key]||0)+1;
}
function cook(key){
 const ingredients=Object.entries(recipes[key]);
 if(ingredients.some(([item,count])=>(life.bag[item]||0)<count))return;
 const stove=kitchen.find(item=>item.t==='stove');
 const face=Math.atan2(stove.y+stove.h/2-me.y,stove.x+stove.w/2-me.x);
 beginActivity('cook',key,'กำลังทำ'+foods[key][1]+'…',()=>{
   for(const [item,count] of ingredients)life.bag[item]-=count;
   life.bag[key]=(life.bag[key]||0)+1;
   playGameSound('done');
   toast('ทำ'+foods[key][1]+'เสร็จแล้ว เปิดกระเป๋าเพื่อกิน');
 },face);
}
function drawLifeDialog(){
 $('lifeRows').replaceChildren();
 $('lifeTitle').textContent={fridge:'🧊 ตู้เย็น',stove:'🍳 ทำอาหาร',bag:'🎒 กระเป๋า',mineReset:'รีเซ็ตเหมือง',garage:'เลือกรถที่โรงรถ',stall:'แผงขายหน้าร้าน',poses:'ท่าทาง',shop:'🛒 ร้านหน้าบ้าน',farm:'สวนหลังบ้าน',neighbor:lifeTarget?.name}[lifeMode];
 $('lifeRows').classList.toggle('item-grid',tileMenus.has(lifeMode));
 if(lifeMode==='fridge'){
   drawFridgeTiles();
 }else if(lifeMode==='stove'){
   drawRecipeTiles();
 }else if(lifeMode==='bag'){
   drawBagTiles();
 }else if(lifeMode==='shop'){
   drawGroceryTiles();
 }else if(lifeMode==='poses'){
   drawPoseMenu();
 }else if(lifeMode==='stall'){
   drawStallMenu();
 }else if(lifeMode==='farm'){
   drawFarmMenu();
 }else if(lifeMode==='garage'){
   drawVehicleGarage();
 }else if(lifeMode==='mineReset'){
   drawMineReset();
 }else if(lifeMode==='neighbor'){
   const npc=lifeTarget;
   const friendship=life.friends[npc.name]||0;
   lifeRow(npc.text&&npc.until>Date.now()?npc.text:'สวัสดี ยินดีที่ได้เจอนะ!');
   lifeRow('ความสนิท '+friendship,[['คุยเล่น',()=>socialize(npc,false)]]);
   for(const key of Object.keys(recipes)){
     if(life.bag[key]>0)lifeRow(itemName(key),[['แบ่งให้',()=>{life.bag[key]--;socialize(npc,true)}]]);
   }
 }
}
function openLife(mode,target=null){
 if(characterDialog.open||(me.action&&!(mode==='poses'&&gestureActive())))return;
 lifeMode=mode;lifeTarget=target;
 keys.clear();stopMineHold();clearInterval(mineSpaceInterval);
 drawLifeDialog();
 if(!lifeDialog.open)lifeDialog.showModal();
}

function nearLife(){
 if(me.pose!=='stand'||me.action||poseIsChanging())return;
 if(scene==='room'){
   const seat=nearFurniture();
   if(seat)return seat;
   for(const item of kitchen){
     const dx=me.x-Math.max(item.x,Math.min(me.x,item.x+item.w));
     const dy=me.y-Math.max(item.y,Math.min(me.y,item.y+item.h));
     if(Math.hypot(dx,dy)<39)return {
       label:item.t==='fridge'?'เปิดตู้เย็น':'ใช้เตาทำอาหาร',
       run:()=>openLife(item.t)
     };
   }
   const workout=nearWorkout();
   if(workout)return workout;
   if(Math.abs(me.x-390)<47&&me.y>463)return {
     label:'ออกไปหน้าบ้าน',run:leaveHome
   };
 }else if(scene==='outside'){
   const vehicle=nearVehicle();if(vehicle)return vehicle;
   if(atHomeDoor())return {
     label:'เข้าบ้าน',run:()=>setLifeScene('room',390,479)
   };
   if(swimAtPlayer())return;
   const stall=nearShopStall();
   if(stall)return stall;
   const fishing=nearFishing();
   if(fishing)return fishing;
   if(nearTownShop())return {label:'เข้าร้านค้า',run:()=>openLife('shop')};
   const workout=nearWorkout();
   if(workout)return workout;
   const garden=nearGarden();
   if(garden)return garden;
   const cityAction=nearCityEvent();if(cityAction)return cityAction;
   const npc=townNeighborNear();
   if(npc)return {label:'ทักทาย'+npc.name,run:()=>{socialize(npc,false);openLife('neighbor',npc)}};
 }
}
function lifeInteract(){if(!lifeDialog.open)nearLife()?.run()}
function lifeTick(now,dt){
 tickActivity(now);
 updateWorkoutHud(now);
 if(characterDialog.open)return;
 farmTick(now,dt);
 shopTick(now,dt,isTownNight());
 if(scene==='room'&&!lifeDialog.open&&me.walking&&!me.action&&me.pose==='stand'&&Math.abs(me.x-390)<35&&me.y>499&&me.face>0.35&&me.face<2.8){
   leaveHome();
 }
 if(scene==='outside'){
   if(!lifeDialog.open&&me.walking&&!me.action&&!isInVehicle()&&atHomeDoor()&&me.y<homeDoor.y-4&&me.face<-.35&&me.face>-2.8)setLifeScene('room',390,479);
   if(scene==='outside'){townTick(now,dt);tickCity(now,dt)}
 }
 changeNeed('fullness',-dt*(scene==='mine'?.12:.05));
 changeNeed('energy',dt*(me.pose==='sleep'?5:me.pose==='sit'?.65:me.running?-3.8:scene==='mine'?-.15:-.06));
 changeNeed('mood',-dt*(life.needs.fullness<25?.24:.045));
 const {fullness,energy}=life.needs;
 if(fullness<20||energy<18)changeNeed('health',-dt*.24);
 else if(me.pose==='sleep'&&fullness>=40)changeNeed('health',dt*.55);
 else if(fullness>=60&&energy>=60)changeNeed('health',dt*.065);
 if(now-lastLifeUpdate>350){
   lastLifeUpdate=now;lifeHud();
 }
 const action=nearLife();
 $('interact').hidden=!action;
 if(action)$('interact').textContent=action.label+' (E)';
 if(now-lifeSaveTime>5000){lifeSaveTime=now;saveLife()}
}
function drawKitchen(o){
 const fridge=o.t==='fridge';
 rect(o.x,o.y,o.w,o.h,10,fridge?'#c9e4e1':'#415461');
 rect(o.x+5,o.y+5,o.w-10,o.h-10,7,fridge?'#e7f3ee':'#586b75');
 if(fridge){
   rect(o.x+4,o.y+21,o.w-8,2,1,'#89a6a4');
   rect(o.x+13,o.y+26,4,19,2,'#699393');
 }else{
   for(const x of [o.x+21,o.x+53]){
     circle(x,o.y+22,10,'#273746');circle(x,o.y+22,6,'#b57259');
     circle(x,o.y+42,3,'#d4cdbd');
   }
   drawCookingFx(o);
 }
 mapLabel(o.label,o.x+o.w/2,o.y+o.h+13);
}

function initializeLife(){
 objects.push(...kitchen);
 life.wallet={coins:36};
 life.shop=makeShopSave();
 life.clock={origin:Date.now()};
 loadLife();
 lifeHud();
}
$('bag').onclick=()=>openLife('bag');
$('lifeClose').onclick=()=>lifeDialog.close();
$('interact').onclick=lifeInteract;
lifeDialog.addEventListener('close',()=>{lifeMode='';lifeTarget=null;keys.clear()});
addEventListener('keydown',e=>{
 if(e.repeat||lifeDialog.open||characterDialog.open||mapDialog.open||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 const key=e.code==='KeyE'?'e':e.code==='KeyI'?'i':e.key.toLowerCase();
 if(key==='e'&&me.pose==='stand'&&!e.defaultPrevented){lifeInteract();e.preventDefault()}
 if(key==='i'){openLife('bag');e.preventDefault()}
});
addEventListener('pagehide',saveLife);

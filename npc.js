'use strict';

// Residents, animals, city events and relationship behavior.

const cityCitizenNames=[
 ['กัปตันยอด','ปลา','เมษ','หิน','จัน','แพรว'],
 ['ขวัญ','ศร','ปิ่น','ปาล์ม','เอม','จูน'],
 ['แก้ม','ป้าแสง','สมบัติ','จิ๊บ','นง','ปลื้ม'],
 ['นารา','ลูกตาล','ดาวเหนือ','ขิมเล็ก','กันต์','เนย'],
 ['เต้','นักวิ่งป๊อบ','เสือ','มิ้นท์','เพชร','เกล'],
 ['ลุงชื่น','ส้ม','กลอย','กล้าไม้','ยายอร','ต้อย'],
 ['เหนือ','ลม','นกหวีด','พีท','พลับ','คีรี'],
 ['ทะเล','แป้ง','ลูกน้ำ','พิม','ฟอง','สายลม']
];
const cityPedestrians=cityDistricts.flatMap((d,i)=>cityCitizenNames[i].map((name,j)=>{
 const start=d.x+190+(j*371)%2150;
 const y=d.y+(j%2?1048:312);
 return [name,d.roofs[j%3],(i+j)%3,[[start,y],[Math.min(d.x+d.w-60,start+210),y+7],
   [Math.min(d.x+d.w-60,start+260),y+23],[start+78,y+28]],
  ['สวัสดี! แวะมาเดินเล่นแถว'+d.label+'เหรอ','เดินตามถนนใหญ่กลับไปละแวกบ้านได้นะ']];
}));

const cityPetAnchors=[
 ['dog',464,310],['cat',268,333],['bird',406,451],['dog',517,544],['cat',709,399],
 ['bird',604,364],['dog',927,541],['cat',1365,533],['bird',1188,864],['dog',2241,592],
 ['cat',447,1083],['bird',2059,861]
];
const cityAnimalReactions={
 dog:['tail','approach','call','flee'],
 cat:['approach','call','tail','flee'],
 bird:['flutter','call','tail','approach']
};
const cityAnimals=[...cityPetAnchors,...cityDistricts.flatMap(district=>[
 ['dog',district.x+455,district.y+415],['cat',district.x+507,district.y+967],
 ['bird',district.x+1815,district.y+408],['dog',district.x+2330,district.y+937],
 ['bird',district.x+1440,district.y+1318],['cat',district.x+1300,district.y+292]
])].map(([kind,x,y],index)=>{
 const lake=cityLakes.find(l=>x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h);
 const homeX=lake?lake.x-44:x;
 return {kind,x:homeX,y,homeX,homeY:y,index,face:index%2?1:-1,
  state:'wander',until:0,close:false,readyAt:0};
});
function tickCityAnimal(pet,now,dt){
 const gap=Math.hypot(me.x-pet.x,me.y-pet.y);
 if(gap>1100)return;
 if(gap>112)pet.close=false;
 if(gap<78&&!pet.close&&now>=pet.readyAt){
   const options=cityAnimalReactions[pet.kind];
   pet.state=options[Math.floor(Math.random()*options.length)];
   pet.until=now+3000;pet.readyAt=now+7500;pet.close=true;
 }
 if(now>=pet.until)pet.state='wander';
 let tx=pet.homeX+Math.sin(now/2700+pet.index)*35;
 let ty=pet.homeY+Math.cos(now/3400+pet.index)*24;
 let speed=28;
 if(pet.state==='approach'){
   if(gap<25){pet.face=me.x>=pet.x?1:-1;return}
   tx=me.x;ty=me.y;speed=65;
 }else if(pet.state==='flee'||pet.state==='flutter'){
   const dx=pet.x-me.x,dy=pet.y-me.y;
   tx=pet.x+dx;ty=pet.y+dy;speed=pet.state==='flutter'?98:77;
   if(Math.hypot(pet.x-pet.homeX,pet.y-pet.homeY)>135)return;
 }else if(pet.state==='call'||pet.state==='tail'){
   pet.face=me.x>=pet.x?1:-1;
   return;
 }
 const dx=tx-pet.x,dy=ty-pet.y,distance=Math.hypot(dx,dy);
 if(distance<1)return;
 const step=Math.min(distance,speed*dt);
 const nextX=pet.x+dx*step/distance,nextY=pet.y+dy*step/distance;
 if(!hit(nextX,nextY)&&!waterAt(nextX,nextY)){
   pet.x=nextX;pet.y=nextY;
 }
 if(Math.abs(dx)>1)pet.face=dx>0?1:-1;
}
function cityTail(x,y,points,color,width){
 ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(...points[0]);
 ctx.quadraticCurveTo(...points[1],...points[2]);ctx.stroke();ctx.restore();
}
function cityTriangle(points,color){
 ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(...points[1]);ctx.lineTo(...points[2]);ctx.closePath();ctx.fill();
}
function drawCityAnimal(pet,now){
 const {x,y,kind,index,state}=pet;
 const stride=state==='tail'||state==='call'?0:Math.sin(now/116+index)*2.1;
 const lift=state==='flutter'?18+Math.sin(now/180)*4:kind==='bird'?Math.max(0,stride):0;
 ctx.save();ctx.translate(x,y);ctx.scale(pet.face,1);
 townEllipse(0,2,kind==='dog'?18:13,4,'#284b3a55');
 ctx.translate(0,-lift);
 if(kind==='dog'){
   const coat=['#b28259','#c2996e','#95816f'][index%3];
   const dark=['#805e48','#957150','#675c54'][index%3];
   cityTail(-11,-10,[[-2,0],[-10,-5],[-10,-12+Math.sin(now/(state==='tail'?65:190))*4]],dark,3.7);
   for(const offset of [-9,6])rect(offset+stride,-7,5,10,2,dark);
   townEllipse(-2,-8,13,7.3,coat);townEllipse(4,-7,8,6,'#d3a77b');
   circle(10,-12,7,coat);townEllipse(7,-13,3,6,dark);townEllipse(15,-9,5,3.5,'#deb993');
   circle(18,-11,2.2,'#352d32');circle(12,-13,1.45,'#302e2a');circle(12.5,-13.4,.45,'#fff2ce');
   rect(5,-7,7,2,1,'#7396a6');
 }else if(kind==='cat'){
   const coat=['#d29d68','#9c9b99','#ccb99d'][index%3],dark=['#a67551','#68666d','#968470'][index%3];
   cityTail(-9,-7,[[0,0],[-12,-4],[-11+Math.sin(now/145)*4,-13]],dark,3);
   for(const offset of [-8,5])rect(offset+stride*.7,-5,3.5,7,2,dark);
   townEllipse(-1,-7,11,6,coat);circle(7,-11,6.4,coat);
   cityTriangle([[2,-14],[3,-21],[7,-16]],dark);cityTriangle([[8,-16],[13,-20],[13,-13]],dark);
   townEllipse(12,-9,3,2.5,'#f0d4ae');circle(10,-12,1.2,'#41443c');circle(14,-10,1,'#965c59');
   for(let i=0;i<2;i++)rect(-6+i*4,-12,2,6,1,dark);
 }else{
   const wing=state==='flutter'?Math.sin(now/48)*6:stride;
   townEllipse(-3,-7,8,5,'#698ea2');townEllipse(-4,-7+wing,5,3,'#506d8c');
   circle(3,-11,5,'#789cab');cityTriangle([[7,-11],[12,-9],[7,-8]],'#d6a86c');
   circle(4,-12,1.1,'#283c43');townEllipse(3,-7,3,2,'#c6d8d6');rect(-4,-3,2,4,1,'#966a52');
 }
 ctx.restore();
}

const cityEventKinds=[
 ['เพื่อนบ้านคุยกัน','☕','ช่วงนี้สวนหน้าบ้านเป็นยังไง','มะเขือเทศกำลังออกลูกเลย','ร่วมวงคุย','เพื่อนบ้านชวนคุยเรื่องปลูกผัก'],
 ['คนกำลังเสียใจ','💛','วันนี้ฉันรู้สึกไม่ค่อยดี',null,'นั่งเป็นเพื่อน','เขาขอบคุณที่คุณมานั่งเป็นเพื่อน',true],
 ['นักดนตรีเปิดหมวก','🎸','เพลงนี้แต่งตอนเดินผ่านสวน',null,'หยุดฟังเพลง','นักดนตรียิ้มและเล่นเพลงให้ฟังต่อ'],
 ['ตามหาสัตว์เลี้ยง','🐾','เห็นแมวลายเดินแถวนี้ไหม',null,'ช่วยมองหา','พบแมวแอบอยู่ใกล้ต้นไม้'],
 ['แลกสูตรอาหาร','🍳','ฉันใส่มะเขือเทศลงไปด้วย','น่าลองทำบ้างจัง','ฟังสูตรอาหาร','ได้ฟังเคล็ดลับทำอาหารจากเพื่อนบ้าน']
];
const cityEventAnchors=[
 [306,443],[420,514],[650,484],[700,395],[839,426],[1064,470],
 [1512,435],[1876,578],[2360,862],[2140,1283],[1290,1230],[590,1430]
];
const activeCityEvents=[];
let cityEventBag=[],nextCityEventAt=0;
function nextCityEventKind(){
 if(!cityEventBag.length)cityEventBag=cityEventKinds.slice();
 const index=Math.floor(Math.random()*cityEventBag.length);
 return cityEventBag.splice(index,1)[0];
}
function cityEventSpot(){
 const candidate=cityEventAnchors.filter(([x,y])=>{
   const gap=Math.hypot(me.x-x,me.y-y);
   return gap>=125&&gap<=480&&!inBackyard(x,y)&&!activeCityEvents.some(event=>Math.hypot(x-event.x,y-event.y)<185);
 });
 if(candidate.length)return candidate[Math.floor(Math.random()*candidate.length)];
 for(let i=0;i<12;i++){
   const angle=Math.random()*Math.PI*2,distance=145+Math.random()*220;
   const x=Math.round(me.x+Math.cos(angle)*distance),y=Math.round(me.y+Math.sin(angle)*distance);
   const closeToOther=activeCityEvents.some(event=>Math.hypot(x-event.x,y-event.y)<160);
   const onRoad=(y>mainRoad.y-5&&y<mainRoad.y+mainRoad.h+3)||cityRoads.some(([rx,ry,w,h])=>x>rx-32&&x<rx+w+32&&y>ry-14&&y<ry+h+14);
   if(x>110&&x<cityMapSize.w-110&&y>110&&y<cityMapSize.h-105&&!closeToOther&&!onRoad&&!inBackyard(x,y)&&
     !hit(x-27,y)&&!hit(x+27,y)&&!waterAt(x-27,y)&&!waterAt(x+27,y))return [x,y];
 }
}
function makeCityEvent(kind,x,y,now){
 const [label,icon,lineA,lineB,action,reply,seated]=kind;
 const index=cityEventKinds.indexOf(kind);
 const people=lineB?[lineA,lineB]:[lineA];
 const actors=people.map((line,i)=>({
   x:x+(people.length===1?0:i===0?-27:27),y:y+i*8,face:people.length===1?Math.PI/2:i===0?.14:Math.PI-.14,
   name:i===0?'เพื่อนบ้าน':'คนในย่าน',text:i===0?line:'',until:Date.now()+41000,
   pose:seated?'sit':'stand',
   appearance:{gender:(index+i)%3,skin:(index+i*2)%5,hair:(index*3+i)%5,style:(index+i)%4,outfit:(index+i*2)%6,accessory:0}
 }));
 return {label,icon,action,reply,x,y,actors,people,started:now,expires:now+41000,resolved:false};
}
function tickCity(now,dt){
 for(const pet of cityAnimals)tickCityAnimal(pet,now,dt);
 for(let i=activeCityEvents.length-1;i>=0;i--){
   const event=activeCityEvents[i];
   if(now>=event.expires||Math.hypot(me.x-event.x,me.y-event.y)>1300)activeCityEvents.splice(i,1);
   else if(!event.resolved){
     const speaker=Math.floor((now-event.started)/4550)%event.actors.length;
     event.actors.forEach((actor,index)=>{actor.text=index===speaker?event.people[index]:''});
   }
 }
 if(now<nextCityEventAt||activeCityEvents.length>=2)return;
 const spot=cityEventSpot();
 if(spot){
   activeCityEvents.push(makeCityEvent(nextCityEventKind(),...spot,now));
   nextCityEventAt=now+13000+Math.random()*8000;
 }else nextCityEventAt=now+2200;
}
function nearCityEvent(){
 const event=activeCityEvents.find(e=>!e.resolved&&Math.hypot(me.x-e.x,me.y-e.y)<70);
 if(!event)return;
 return {label:event.action,run:()=>{
   event.resolved=true;
   for(const actor of event.actors)actor.text='';
   event.actors[0].text=event.reply;
   event.actors[0].until=Date.now()+5900;
   event.expires=Math.min(event.expires,performance.now()+6500);
   changeNeed('mood',4);saveLife();lifeHud();toast(event.reply);
 }};
}
function queueCityActors(drawList,visible,now){
 for(const pet of cityAnimals)if(visible(pet.x,pet.y,100))drawList.push([pet.y,()=>drawCityAnimal(pet,now)]);
 for(const event of activeCityEvents){
   if(!visible(event.x,event.y,175))continue;
   for(const actor of event.actors)drawList.push([actor.y,()=>avatar(actor)]);
   if(!personTextNearby(event))continue;
   drawList.push([event.y+15,()=>{
     const label=event.icon+' '+event.label;
     ctx.font='bold 13px system-ui';
     const width=ctx.measureText(label).width+19;
     rect(event.x-width/2,event.y+20,width,20,7,event.resolved?'#38594bd9':'#2e5249ed');
     ctx.textAlign='center';ctx.fillStyle='#fff0cc';ctx.fillText(label,event.x,event.y+34);
   }]);
 }

}

const townPedestrians=[
 ['มะลิ','#d87c92',0,[[218,184],[276,190],[332,201],[309,194]],['วันนี้อากาศดีจัง ไปเดินเล่นในสวนกันไหม','สวนชุมชนอยู่ตรงข้ามบ้านเธอเลย']],
 ['ต้น','#488d85',1,[[671,356],[703,432],[705,534],[667,545]],['ขุดเจอหินสวย ๆ บ้างไหม','ร้านอยู่ตรงลานหน้าบ้านนะ']],
 ['ข้าวหอม','#be7e56',0,[[789,190],[975,197],[1086,185],[989,211]],['ที่ร้านชำมีวัตถุดิบหลายอย่างเลย','วันนี้มีเมนูอะไรทำกินบ้าง']],
 ['ภู','#647ca6',1,[[529,192],[708,191],[817,205],[670,209]],['แวะมาทักทายได้นะ','เจอกันอีกแล้ว!']],
 ['แก้ว','#a36780',0,[[173,489],[220,532],[230,584],[153,568]],['ทางนี้เดินไปสวนดอกไม้ได้','แวะเดินเล่นใต้ต้นไม้ไหม']],
 ['เฟิร์น','#668559',1,[[329,849],[437,861],[509,872],[369,885]],['สวนสวยมากช่วงนี้','ถ้าปลูกต้นไม้ อย่าลืมรดน้ำนะ']],
 ['เมฆ','#8d729f',2,[[990,385],[1180,396],[1268,470],[1160,538],[970,521]],['ตรงนี้นั่งพักได้','เห็นรถสีฟ้าผ่านมาเมื่อกี้ไหม']],
 ['ดิน','#b57554',1,[[1035,748],[1302,752],[1323,788],[1102,781]],['ลานกลางเมืองคึกคักทุกวัน','ฉันกำลังไปที่ลานชุมชน']],
 ['ริน','#567e9f',0,[[1720,193],[1865,210],[2054,211],[1969,196]],['เดินลงใต้ไปจะเจอทะเลสาบ','วันนี้ลมดีจังเลย']],
 ['วิน','#829762',1,[[2190,841],[2494,835],[2562,902],[2519,900],[2295,899]],['แถวทะเลสาบอากาศเย็นสบาย','ข้ามถนนระวังรถนะ']],
 ['บัว','#bf7190',0,[[655,966],[835,927],[1050,943],[1094,1012],[858,1059]],['ดอกไม้กำลังบานเลย','ตรงนี้เป็นจุดชมวิวที่ฉันชอบ']],
 ['ตะวัน','#ad7c56',2,[[1415,1095],[1590,1058],[1710,1089],[1670,1220]],['กำลังเดินไปริมทะเลสาบ','เธอเดินมาไกลเหมือนกันนะ']],
 ['ปั้น','#64868c',1,[[1877,1240],[2135,1199],[2212,1199],[2167,1300],[1889,1307]],['เงียบดีนะตรงนี้','ฉันชอบมาที่นี่ตอนพัก']],
 ['แพร','#b87972',0,[[421,1410],[611,1427],[830,1453],[933,1498],[821,1516]],['กลับมาดูต้นไม้บ่อย ๆ นะ','ฉันมาดูต้นไม้แถวเรือนเพาะชำ']]
];
const townSpeeds=[38,45,50,42];
const townGreetings=['สวัสดี!','วันนี้เป็นยังไงบ้าง','สวัสดีจ้ะ','เดินเล่นอยู่เหรอ'];
const personTextRange=100;
const localResidents=new Set(['มะลิ','ต้น','ข้าวหอม','แก้ว','เมฆ','ริน','บัว','ปั้น']);

function makeTownResidents(routes){
 const cityStart=townPedestrians.length*2;
 return routes.flatMap(([name,color,gender,route,lines],index)=>{
   if(index<cityStart){
     if(!localResidents.has(name))return [];
   }else{
     const district=Math.floor((index-cityStart)/6);
     const slot=(index-cityStart)%6;
     if(slot!==district%6)return [];
   }
   return [{
   name,color,x:route[0][0],y:route[0][1],route,lines,
   appearance:{gender,skin:index%5,hair:(index*3)%5,style:index%4,outfit:index%6},
   face:0,walking:true,target:1,inRange:false,greetAfter:0,
   personality:index===0?'social':index===1?'quiet':['quiet','social','watch'][Math.floor(Math.random()*3)]
   }];
 });
}
function personTextNearby(person){
 return (person.x-me.x)**2+(person.y-me.y)**2<=personTextRange**2;
}
function resetTownGreetings(){
 for(const npc of neighbors){
   npc.inRange=false;
   npc.text='';
 }
}
function townNeighborNear(){
 let closest=null, distance=66;
 for(const npc of townResidentsNow()){
   const gap=Math.hypot(npc.x-me.x,npc.y-me.y);
   if(gap<distance){closest=npc;distance=gap}
 }
 return closest;
}

function townTick(now,dt){
 const players=[me,...[...others.values()].filter(p=>p.scene==='outside')];
 townResidentsNow().forEach((npc,index)=>{
   const conversing=lifeTarget===npc&&lifeDialog.open;
   const [x,y]=npc.route[npc.target];
   const dx=x-npc.x,dy=y-npc.y,distance=Math.hypot(dx,dy);
   const stride=Math.min(distance,dt*townSpeeds[index%townSpeeds.length]);
   let nearest=null,closest=94;
   for(const player of players){
     const gap=Math.hypot(player.x-npc.x,player.y-npc.y);
     if(gap<closest){nearest=player;closest=gap}
   }
   const nearMe=personTextNearby(npc);
   if(!npc.inRange&&nearMe&&now>=npc.greetAfter)greetNeighbor(npc,now);
   if(npc.inRange&&!nearMe)npc.text='';
   npc.inRange=nearMe;
   const looking=conversing||nearest&&(npc.personality!=='quiet'||closest<42);
   npc.walking=!conversing&&!(nearest&&closest<69&&npc.personality==='social');
   if(npc.walking&&distance>0){npc.x+=dx*stride/distance;npc.y+=dy*stride/distance}
   if(stride>=distance)npc.target=(npc.target+1)%npc.route.length;
   const lookAt=conversing?me:nearest;
   const direction=looking?Math.atan2(lookAt.y-npc.y,lookAt.x-npc.x):Math.atan2(dy,dx);
   const turn=Math.atan2(Math.sin(direction-npc.face),Math.cos(direction-npc.face));
   npc.face+=turn*Math.min(1,dt*9);
 });
}

const moreResidentNames=['นุ่น','มีนา','เก้า','อิง','ฟ้า','ภูมิ','ดาว','มุก','เจ','ฝน','ตาล','ใบหม่อน','วา','นที'];
function addTownResidents(){
 return townPedestrians.map(([name,color,gender,route,lines],index)=>{
   const offset=2%route.length;
   const shifted=[...route.slice(offset),...route.slice(0,offset)].map(([x,y])=>[x+6,y+5]);
   return [moreResidentNames[index],color,(gender+1)%3,shifted,lines];
 });
}
const nightResidents=new Set(['มะลิ','ต้น','ริน']);
function townResidentsNow(){
 return isTownNight()?nightNeighbors:neighbors;
}

const allResidentRoutes=[...townPedestrians,...addTownResidents(),...cityPedestrians];
const neighbors=makeTownResidents(allResidentRoutes);
const nightNeighbors=neighbors.filter(npc=>nightResidents.has(npc.name));

function greetNeighbor(npc,now){
 const friendship=life.friends[npc.name]||0;
 const met=life.contacts[npc.name]||friendship>0;
 if(friendship>=5)npc.text='ดีใจที่เจอกันอีกนะ '+me.name+'!';
 else if(met)npc.text='อ้าว '+me.name+' เจอกันอีกแล้ว!';
 else npc.text=townGreetings[Math.floor(Math.random()*townGreetings.length)];
 npc.until=Date.now()+3800;
 npc.greetAfter=now+8500;
 if(!life.contacts[npc.name]){
   life.contacts[npc.name]=1;
   saveLife();
 }
}
function socialize(npc,gift){
 const previous=life.friends[npc.name]||0;
 npc.text=gift?'ขอบคุณสำหรับอาหารนะ!':npc.lines[previous%npc.lines.length];
 npc.until=Date.now()+6000;
 life.contacts[npc.name]=1;
 life.friends[npc.name]=Math.min(999,previous+(gift?3:1));
 changeNeed('mood',gift?15:8);
 saveLife();lifeHud();
 if(lifeDialog.open&&lifeTarget===npc)drawLifeDialog();
}

function drawCat(now){
 const t=now/1000;const x=550+Math.sin(t*.7)*27,y=293+Math.cos(t*.7)*17;
 ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.7)*.18);
 circle(0,0,12,'#efb981');circle(-8,-8,6,'#efb981');circle(8,-8,6,'#efb981');
 circle(-4,-1,1.5,'#584c45');circle(4,-1,1.5,'#584c45');circle(0,4,2,'#a35b64');
 ctx.strokeStyle='#db976b';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(9,8);ctx.quadraticCurveTo(22+Math.sin(t*3)*6,14,18,0);ctx.stroke();ctx.restore();
}

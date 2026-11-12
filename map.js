'use strict';

const townMapKey='thai2d_town_map_v1';
const townMapLimit=650000;
const mapDialog=document.getElementById('mapDialog');
const mapEditor=document.getElementById('mapEditor');
const mapFile=document.getElementById('mapFile');
const mapMessage=document.getElementById('mapMessage');

function mapAssert(condition,field){
 if(!condition)throw new Error('ตรวจสอบข้อมูล '+field);
}
function buildTownLayout(map){
 const {size,city,landmarks,neighborhood,backyard:yard}=map;
 const {districts,buildingSlots,lakes,roads}=city;
 const cityBuildings=districts.flatMap((district,i)=>district.names.map((label,j)=>{
   const [dx,dy]=buildingSlots[j];
   return {x:district.x+dx+(j%3)*15,y:district.y+dy,w:150+(j*29+i*11)%100,
     h:89+(j*17+i*13)%37,roof:district.roofs[(i+j)%3],
     wall:['#f0d9b8','#f1ddc3','#e0e7c9','#f0d2b2'][(j+i)%4],label};
 }));
 const cityPaths=districts.flatMap(({x,y,w,h})=>[
   [x,y+299,w,38],[x+37,y+1020,w-74,38],[x+76,y+198,30,h-228],
   [x+470,y+330,34,690],[x+1855,y+330,34,690],[x+29,y+h-142,w-58,42]
 ]);
 const citySigns=districts.map(d=>({x:d.x+1160,y:d.y+374,label:d.label}));
 const cityTrees=districts.flatMap(({x,y,h},district)=>Array.from({length:47},(_,i)=>{
   const spread=i%2===0?111+(i*63)%500:1950+(i*127)%626;
   return [x+spread+(district*7)%28,y+367+(i*137)%Math.max(500,h-430)];
 }));
 const gateLeft=yard.gateX-yard.gateHalf,gateRight=yard.gateX+yard.gateHalf;
 const south=yard.y+yard.h-6,east=yard.x+yard.w;
 const yardFences=[
   {x:yard.x,y:yard.y,w:yard.w,h:6},{x:yard.x,y:yard.y,w:6,h:yard.h},
   {x:east-6,y:yard.y,w:6,h:yard.h},
   {x:yard.x,y:south,w:gateLeft-yard.x,h:6},{x:gateRight,y:south,w:east-gateRight,h:6}
 ];
 const homeGarage={...landmarks.garage,kind:'garage'};
 const townShop={...landmarks.shop,kind:'shop'};
 const townBuildings=[...cityBuildings,landmarks.home,homeGarage,townShop,...neighborhood.buildings];
 const farmRoute=[yard.desk,{x:yard.gateX,y:south-20},{x:yard.gateX,y:south+27},...yard.deliveryVia,landmarks.shopDoor];
 return {
   cityMapSize:size,TOWN:size,cityDistricts:districts,cityRoads:roads,cityLakes:lakes,
   homeBuilding:landmarks.home,homeDoor:landmarks.homeDoor,homeGarage,
   garagePosition:landmarks.garageSpawn,townShop,townShopDoor:landmarks.shopDoor,
   stallCounterBlock:landmarks.stall,backyard:yard,gardenDesk:yard.desk,gardenPlots:yard.plots,
   farmRoute,yardFences,townBuildings,
   townLakes:[...lakes,...neighborhood.lakes],townPaths:[...cityPaths,...neighborhood.paths],
   townDistricts:[...citySigns,...neighborhood.signs],townTreeSpots:[...cityTrees,...neighborhood.trees],
   townFlowerBeds:neighborhood.flowerBeds,townTraffic:neighborhood.traffic,
   streetLights:neighborhood.streetLights,mainRoad:neighborhood.mainRoad,outdoorWorkoutMat:neighborhood.workoutMat,
   outsideBlocks:[...townBuildings,landmarks.stall,...yardFences]
 };
}
function validateTownMap(map){
 mapAssert(map&&map.version===1,'version (ต้องเป็น 1)');
 const {size,city,landmarks,neighborhood,backyard:yard}=map;
 const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 mapAssert(size&&number(size.w,2700,25000)&&number(size.h,1800,25000),'size');
 mapAssert(city&&landmarks&&neighborhood&&yard,'city, landmarks, neighborhood, backyard');
 const point=p=>p&&number(p.x,0,size.w)&&number(p.y,0,size.h);
 const rect=r=>point(r)&&number(r.w,2,size.w-r.x)&&number(r.h,2,size.h-r.y);
 const tuple=(value,count)=>Array.isArray(value)&&value.length===count;
 const box=v=>tuple(v,4)&&rect({x:v[0],y:v[1],w:v[2],h:v[3]});
 const label=s=>typeof s==='string'&&s.length>0&&s.length<=80;
 const color=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
 const building=b=>rect(b)&&label(b.label)&&color(b.roof)&&color(b.wall);
 const lake=l=>rect(l)&&number(l.r,2,Math.min(l.w,l.h)/2);
 const list=(values,limit,check,field)=>{
   mapAssert(Array.isArray(values)&&values.length<=limit,field);
   for(let i=0;i<values.length;i++)mapAssert(check(values[i]),field+'['+i+']');
 };
 list(city.buildingSlots,24,v=>tuple(v,2)&&v.every(n=>number(n,0,10000)),'city.buildingSlots');
 list(city.districts,8,d=>rect(d)&&d.w>=2400&&d.h>=1250&&label(d.key)&&label(d.label)&&color(d.grass)&&color(d.path)&&
   tuple(d.roofs,3)&&d.roofs.every(color)&&Array.isArray(d.names)&&d.names.length<=city.buildingSlots.length&&d.names.every(label),'city.districts');
 mapAssert(city.districts.length===8,'city.districts ต้องมี 8 ย่าน');
 list(city.lakes,40,lake,'city.lakes');
 list(city.roads,50,box,'city.roads');
 for(const key of ['home','garage','shop'])mapAssert(building(landmarks[key]),'landmarks.'+key);
 for(const key of ['homeDoor','garageSpawn','shopDoor'])mapAssert(point(landmarks[key]),'landmarks.'+key);
 mapAssert(rect(landmarks.stall),'landmarks.stall');
 mapAssert(Math.abs(landmarks.homeDoor.x-landmarks.home.x-landmarks.home.w/2)<36&&
   landmarks.homeDoor.y>=landmarks.home.y+landmarks.home.h+21,'landmarks.homeDoor ต้องอยู่หน้าบ้าน');
 mapAssert(landmarks.shopDoor.y>landmarks.shop.y+landmarks.shop.h+15,'landmarks.shopDoor ต้องอยู่หน้าร้าน');
 list(neighborhood.buildings,180,building,'neighborhood.buildings');
 list(neighborhood.lakes,40,lake,'neighborhood.lakes');
 list(neighborhood.paths,200,box,'neighborhood.paths');
 list(neighborhood.flowerBeds,100,box,'neighborhood.flowerBeds');
 list(neighborhood.trees,350,p=>tuple(p,2)&&point({x:p[0],y:p[1]}),'neighborhood.trees');
 list(neighborhood.signs,120,p=>point(p)&&label(p.label),'neighborhood.signs');
 list(neighborhood.streetLights,150,point,'neighborhood.streetLights');
 list(neighborhood.traffic,60,v=>v&&number(v.y,0,size.h)&&number(v.offset,0,size.w)&&number(v.speed,0,650)&&
   [-1,1].includes(v.direction)&&[0,1].includes(v.kind)&&color(v.color),'neighborhood.traffic');
 const road=neighborhood.mainRoad;
 mapAssert(road&&number(road.y,20,size.h)&&number(road.h,26,size.h-road.y),'neighborhood.mainRoad');
 list(road.crosswalks,50,x=>number(x,35,size.w-35),'neighborhood.mainRoad.crosswalks');
 mapAssert(point(neighborhood.workoutMat),'neighborhood.workoutMat');
 mapAssert(rect(yard)&&yard.w>=120&&yard.h>=100&&number(yard.gateHalf,23,yard.w/2-12)&&
   number(yard.gateX,yard.x+yard.gateHalf+10,yard.x+yard.w-yard.gateHalf-10),'backyard และประตูสวน');
 const inside=(p,pad=20)=>point(p)&&p.x>yard.x+pad&&p.x<yard.x+yard.w-pad&&p.y>yard.y+pad&&p.y<yard.y+yard.h-pad;
 mapAssert(inside(yard.desk),'backyard.desk ต้องอยู่ในสวน');
 list(yard.plots,120,p=>inside(p,25)&&typeof p.id==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(p.id),'backyard.plots');
 mapAssert(yard.plots.length>0&&new Set(yard.plots.map(p=>p.id)).size===yard.plots.length,'backyard.plots ต้องมีแปลงและ id ไม่ซ้ำ');
 list(yard.deliveryVia,30,point,'backyard.deliveryVia');
 const layout=buildTownLayout(map);
 const clear=(p,pad=15)=>p.x-pad>=24&&p.y-pad>=24&&p.x+pad<=size.w-24&&p.y+pad<=size.h-24&&
   !layout.outsideBlocks.some(r=>p.x+pad>r.x&&p.x-pad<r.x+r.w&&p.y+pad>r.y&&p.y-pad<r.y+r.h)&&
   !layout.townLakes.some(r=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h);
 mapAssert(clear(landmarks.homeDoor)&&clear(landmarks.shopDoor)&&clear(landmarks.garageSpawn,37),'จุดเข้าบ้าน จุดเข้าร้าน หรือจุดเกิดรถชนสิ่งกีดขวาง');
 for(const plot of yard.plots)mapAssert(clear(plot)&&clear({x:plot.x,y:plot.y+16}),'แปลง '+plot.id+' ชนสิ่งกีดขวาง');
 for(let i=1;i<layout.farmRoute.length;i++){
   const a=layout.farmRoute[i-1],b=layout.farmRoute[i];
   const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(distance/12);
   mapAssert(steps>0,'เส้นทางส่งผลผลิตมีจุดซ้ำ');
   for(let n=0;n<=steps;n++){
     const t=n/steps;
     mapAssert(clear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),'เส้นทางส่งผลผลิตช่วง '+i+' ชนสิ่งกีดขวาง');
   }
 }
 return map;
}

function parseTownMap(text){
 mapAssert(typeof text==='string'&&text.length<=townMapLimit,'ไฟล์ใหญ่เกินขนาดที่รองรับ');
 const clean=text.trim();
 const wrapper=/^const\s+DEFAULT_TOWN_MAP\s*=\s*([\s\S]+?);?$/u.exec(clean);
 return validateTownMap(JSON.parse(wrapper?wrapper[1]:clean));
}
function defaultTownMap(){
 try{return validateTownMap(DEFAULT_TOWN_MAP)}
 catch(error){
   document.getElementById('toast').textContent='เปิดแผนที่ไม่ได้ · '+error.message;
   throw error;
 }
}
let townMapSource='แผนที่จาก maps/town.js';
const presetTownMap=defaultTownMap();
let activeTownMap=presetTownMap;
try{
 const saved=localStorage.getItem(townMapKey);
 if(saved){activeTownMap=parseTownMap(saved);townMapSource='แผนที่ที่บันทึกไว้ในเบราว์เซอร์'}
}catch{townMapSource='โหลดแผนที่ที่บันทึกไว้ไม่ได้ · ใช้ maps/town.js'}

const {cityMapSize,TOWN,cityDistricts,cityRoads,cityLakes,homeBuilding,homeDoor,homeGarage,garagePosition,
 townShop,townShopDoor,stallCounterBlock,backyard,gardenDesk,gardenPlots,farmRoute,yardFences,
 townBuildings,townLakes,townPaths,townDistricts,townTreeSpots,townFlowerBeds,townTraffic,
 streetLights,mainRoad,outdoorWorkoutMat,outsideBlocks}=buildTownLayout(activeTownMap);

function editTownMap(){
 keys.clear();
 pauseWalking();
 stopMineHold();
 clearInterval(mineSpaceInterval);
 mapEditor.value=JSON.stringify(activeTownMap,null,2);
 mapMessage.textContent=townMapSource;
 mapDialog.showModal();
}
function saveTownMapDownload(asScript){
 try{
   const json=JSON.stringify(parseTownMap(mapEditor.value),null,2);
   const body=asScript?'const DEFAULT_TOWN_MAP = '+json+';\n':json+'\n';
   const url=URL.createObjectURL(new Blob([body],{type:asScript?'text/javascript':'application/json'}));
   const link=document.createElement('a');
   link.href=url;
   link.download=asScript?'town.js':'town.json';
   document.body.append(link);
   link.click();
   link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   mapMessage.textContent='ส่งออก '+link.download+' แล้ว';
 }catch(error){mapMessage.textContent='ส่งออกไม่ได้ · '+error.message}
}
function activateTownMap(usePreset=false){
 try{
   if(usePreset)localStorage.removeItem(townMapKey);
   else localStorage.setItem(townMapKey,JSON.stringify(parseTownMap(mapEditor.value)));
   saveLife();
   saveMine();
   location.reload();
 }catch(error){mapMessage.textContent='ใช้แผนที่ไม่ได้ · '+error.message}
}
document.getElementById('openMapEditor').onclick=editTownMap;
document.getElementById('closeMapEditor').onclick=()=>mapDialog.close();
document.getElementById('applyTownMap').onclick=()=>activateTownMap();
document.getElementById('resetTownMap').onclick=()=>activateTownMap(true);
document.getElementById('exportTownJson').onclick=()=>saveTownMapDownload(false);
document.getElementById('exportTownJs').onclick=()=>saveTownMapDownload(true);
mapDialog.addEventListener('close',()=>keys.clear());
mapFile.onchange=async()=>{
 const [file]=mapFile.files;
 if(!file)return;
 try{
   mapAssert(file.size<=townMapLimit,'ไฟล์ใหญ่เกินขนาดที่รองรับ');
   const parsed=parseTownMap(await file.text());
   mapEditor.value=JSON.stringify(parsed,null,2);
   mapMessage.textContent='เปิด '+file.name+' แล้ว · กดใช้แผนที่เพื่อโหลดเข้าเกม';
 }catch(error){mapMessage.textContent='เปิดไฟล์ไม่ได้ · '+error.message}
 finally{mapFile.value=''}
};

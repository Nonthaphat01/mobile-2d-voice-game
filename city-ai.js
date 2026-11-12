'use strict';

// One active project at a time. The planner chooses a use for each open lot.
const developmentPlans={
 home:{roof:'#b16750',wall:'#f5d6a0',label:'บ้านใหม่'},
 workshop:{roof:'#5a7c86',wall:'#e6d7b3',label:'โรงช่างชุมชน'},
 market:{roof:'#54826a',wall:'#f2dda0',label:'ตลาดชุมชน',kind:'shop'}
};
const developmentLots=[
 {x:780,y:537,w:132,h:91},{x:1208,y:474,w:142,h:88},
 {x:1495,y:484,w:140,h:95},{x:846,y:863,w:141,h:93},
 {x:1120,y:927,w:145,h:90},{x:1475,y:950,w:151,h:102}
];
function developmentOverlap(a,b,pad=0){
 return a.x-pad<b.x+b.w&&a.x+a.w+pad>b.x&&a.y-pad<b.y+b.h&&a.y+a.h+pad>b.y;
}
const reservedLand=[backyard,...townLakes,...outsideBlocks,
 ...townFlowerBeds.map(([x,y,w,h])=>({x,y,w,h})),
 ...townPaths.map(([x,y,w,h])=>({x,y,w,h})),...cityRoads.map(([x,y,w,h])=>({x,y,w,h}))];
const developmentSites=developmentLots.filter(lot=>lot.x+lot.w<TOWN.w&&lot.y+lot.h<TOWN.h&&
 !reservedLand.some(area=>developmentOverlap(lot,area,7)))
 .map(lot=>({...lot,id:lot.x+'-'+lot.y,stage:'empty'}));

let developmentHash=2166136261;
for(const ch of JSON.stringify(activeTownMap))developmentHash=Math.imul(developmentHash^ch.charCodeAt(0),16777619);
const developmentSaveKey='thai2d_development_'+(developmentHash>>>0).toString(36);
let nextDevelopmentAt=0,activeDevelopment=null;
function completeDevelopment(site){
 if(site.stage==='done')return;
 site.stage='done';
 const building={x:site.x,y:site.y,w:site.w,h:site.h,...developmentPlans[site.plan],developed:true};
 townBuildings.push(building);
 outsideBlocks.push(building);
}
try{
 const saved=JSON.parse(localStorage.getItem(developmentSaveKey)||'{}');
 for(const site of developmentSites){
   if(Object.hasOwn(developmentPlans,saved?.[site.id])){
     site.plan=saved[site.id];
     completeDevelopment(site);
   }
 }
}catch{}
function saveDevelopment(){
 const completed=Object.fromEntries(developmentSites.filter(site=>site.stage==='done').map(site=>[site.id,site.plan]));
 try{localStorage.setItem(developmentSaveKey,JSON.stringify(completed))}catch{}
}
function chooseDevelopmentPlan(){
 const finished=developmentSites.filter(site=>site.stage==='done');
 if(finished.filter(site=>site.plan==='home').length<2)return 'home';
 return finished.some(site=>site.plan==='workshop')?'market':'workshop';
}
function tickDevelopment(now){
 if(!nextDevelopmentAt)nextDevelopmentAt=now+3500;
 if(activeDevelopment){
   const site=activeDevelopment;
   if(now<site.finishAt)return;
   const people=[me,...[...others.values()].filter(p=>p.scene==='outside'),...townResidentsNow()];
   if(people.some(p=>developmentOverlap({x:p.x-30,y:p.y-30,w:60,h:60},site)))return;
   completeDevelopment(site);
   saveDevelopment();
   activeDevelopment=null;
   nextDevelopmentAt=now+6500;
   return;
 }
 if(now<nextDevelopmentAt)return;
 const available=developmentSites.filter(site=>site.stage==='empty');
 if(!available.length)return;
 const site=available.reduce((nearest,lot)=>Math.hypot(me.x-lot.x,me.y-lot.y)<Math.hypot(me.x-nearest.x,me.y-nearest.y)?lot:nearest);
 Object.assign(site,{stage:'building',plan:chooseDevelopmentPlan(),started:now,finishAt:now+13000});
 activeDevelopment=site;
}
function queueDevelopmentDrawing(drawList,visible,now){
 const site=activeDevelopment;
 if(!site||!visible(site.x+site.w/2,site.y+site.h/2,170))return;
 drawList.push([site.y+site.h,()=>{
   const {x,y,w,h}=site;
   const progress=Math.min(1,(now-site.started)/(site.finishAt-site.started));
   rect(x,y,w,h,7,'#ad8a5b');
   rect(x+7,y+8,w-14,h-16,5,'#d3b88b');
   if(progress>.25)rect(x+11,y+12,w-22,h-23,5,'#a9a498');
   if(progress>.55)rect(x+13,y+13,w-26,h-29,4,developmentPlans[site.plan].wall);
   for(let i=12;i<w;i+=24)rect(x+i,y+5,4,h-10,1,'#735537');
   rect(x+3,y+h-9,w-6,5,2,'#e3ba67');
   if(personTextNearby({x:x+w/2,y:y+h/2})){
     mapLabel('กำลังสร้าง'+developmentPlans[site.plan].label,x+w/2,y-10,'#394a34');
     rect(x+12,y+h+6,w-24,5,2,'#71816a');
     rect(x+12,y+h+6,(w-24)*progress,5,2,'#e8be68');
   }
 }]);
}

'use strict';

// Local game ambience and effects.

// Game audio has its own volume and never uses the microphone.
const gameSoundButton=$('gameSound');
const gameSoundKey='thai2d_game_sound';
let gameSoundEnabled=true;
try{gameSoundEnabled=localStorage.getItem(gameSoundKey)!=='off'}catch{}
let gameAudio=null;
let lastAudibleStep=0,nextAmbientSound=0,lastSoundSetting='';
const stepSamples=new Map();
const stepAssets={step:'wood',grass:'grass',stone:'stone'};
const vehicleSoundProfiles={
 car:{pitch:34,rev:61,motor:.16,roll:.115,filter:330},
 motorcycle:{pitch:53,rev:112,motor:.14,roll:.089,filter:570},
 bicycle:{pitch:24,rev:23,motor:0,roll:.10,filter:720}
};
let vehicleSound=null;

function stopStepSamples(){
 for(const sample of stepSamples.values())sample.pause();
}

function updateSoundButton(){
 gameSoundButton.setAttribute('aria-pressed',String(gameSoundEnabled));
 $('gameSoundLabel').textContent=gameSoundEnabled?'♪ เสียงเกม':'♪ ปิดเสียง';
}
updateSoundButton();

async function startGameAudio(){
 if(!gameSoundEnabled||document.hidden)return;
 const Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)return;
 try{
   if(!gameAudio){
     const context=new Audio();
     const noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
     const samples=noise.getChannelData(0);
     for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
     const master=context.createGain();
     master.gain.value=.56;
     master.connect(context.destination);
     const wind=context.createBufferSource();
     wind.buffer=noise;
     wind.loop=true;
     const filter=context.createBiquadFilter();
     filter.type='lowpass';
     filter.frequency.value=220;
     const ambience=context.createGain();
     ambience.gain.value=0;
     wind.connect(filter).connect(ambience).connect(master);
     wind.start();
     gameAudio={context,noise,master,filter,ambience};
   }
   if(gameAudio.context.state!=='running')await gameAudio.context.resume();
 }catch{}
}
function unlockGameAudio(event){
 if(!gameSoundButton.contains(event.target))startGameAudio();
}
document.addEventListener('pointerup',unlockGameAudio);
document.addEventListener('keydown',unlockGameAudio);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
   stopStepSamples();
   stopVehicleSound();
   gameAudio?.context.suspend().catch(()=>{});
 }else startGameAudio();
});
gameSoundButton.addEventListener('click',()=>{
 gameSoundEnabled=!gameSoundEnabled;
 updateSoundButton();
 try{localStorage.setItem(gameSoundKey,gameSoundEnabled?'on':'off')}catch{}
 if(gameSoundEnabled)startGameAudio();
 else{
   stopStepSamples();
   stopVehicleSound();
   gameAudio?.context.suspend().catch(()=>{});
 }
});

const gameSoundEffects={
 step: [145,.09,.19,520,.06],
 grass:[115,.12,.13,1250,.10],
 stone:[160,.10,.16,1300,.12],
 splash:[335,.17,.11,1650,.18],
 door:[105,.20,.23,830,.08],
 cook:[0,.65,0,2700,.10],
 done:[490,.15,.085],
 rock:[136,.13,.21,2150,.12],
 break:[83,.23,.22,1850,.18],
 bird:[1730,.12,.044],
 cricket:[2800,.09,.024],
 drip:[565,.19,.06]
};
function playFootstep(kind,effort){
 const asset=stepAssets[kind];
 if(!asset){playGameSound(kind);return}
 let sample=stepSamples.get(kind);
 if(!sample){
   sample=new Audio('assets/audio/step-'+asset+'.wav');
   stepSamples.set(kind,sample);
 }
 sample.volume=.27+effort*.18;
 sample.playbackRate=.96+Math.random()*.08;
 sample.currentTime=0;
 sample.play().catch(()=>playGameSound(kind));
}
function playGameSound(kind,delay=0){
 if(!gameSoundEnabled||gameAudio?.context.state!=='running'||document.hidden)return;
 const {context,noise,master}=gameAudio;
 const [pitch,duration,volume,cutoff,texture]=gameSoundEffects[kind];
 const start=context.currentTime+delay;
 const end=start+duration;
 const envelope=(source,level)=>{
   const gain=context.createGain();
   gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(level,start+.014);
   gain.gain.exponentialRampToValueAtTime(.0001,end);
   source.connect(gain).connect(master);
 };
 if(pitch){
   const tone=context.createOscillator();
   tone.type=kind==='door'||kind==='rock'||kind==='break'?'triangle':'sine';
   tone.frequency.setValueAtTime(pitch,start);
   const bend=kind==='bird'||kind==='done'?1.4:kind==='drip'?1.85:.55;
   tone.frequency.exponentialRampToValueAtTime(pitch*bend,end);
   envelope(tone,volume);
   tone.start(start);
   tone.stop(end);
 }
 if(texture){
   const hiss=context.createBufferSource();
   hiss.buffer=noise;
   const band=context.createBiquadFilter();
   band.type=kind==='step'?'lowpass':'bandpass';
   band.frequency.value=cutoff;
   band.Q.value=.8;
   hiss.connect(band);
   envelope(band,texture);
   hiss.start(start,Math.random()*(noise.duration-duration));
   hiss.stop(end);
 }
}
function openVehicleSound(vehicle,now){
 const {context,noise,master}=gameAudio;
 const profile=vehicleSoundProfiles[vehicle.key];
 const volume=context.createGain();
 volume.gain.value=0;
 volume.connect(master);
 const engine=context.createOscillator();
 engine.type=vehicle.key==='motorcycle'?'sawtooth':'triangle';
 engine.frequency.value=profile.pitch;
 const engineFilter=context.createBiquadFilter();
 engineFilter.type='lowpass';
 engineFilter.frequency.value=profile.filter;
 const engineVolume=context.createGain();
 engineVolume.gain.value=0;
 engine.connect(engineFilter).connect(engineVolume).connect(volume);
 const road=context.createBufferSource();
 road.buffer=noise;
 road.loop=true;
 const roadFilter=context.createBiquadFilter();
 roadFilter.type='bandpass';
 roadFilter.frequency.value=profile.filter;
 roadFilter.Q.value=.75;
 const roadVolume=context.createGain();
 roadVolume.gain.value=0;
 road.connect(roadFilter).connect(roadVolume).connect(volume);
 engine.start();
 road.start();
 volume.gain.setTargetAtTime(1,context.currentTime,.045);
 return {id:vehicle.id,profile,engine,engineFilter,engineVolume,road,roadFilter,roadVolume,volume,
   x:me.x,y:me.y,now,speed:0};
}
function stopVehicleSound(){
 if(!vehicleSound)return;
 const {engine,road,volume}=vehicleSound;
 vehicleSound=null;
 const now=gameAudio.context.currentTime;
 volume.gain.cancelScheduledValues(now);
 volume.gain.setTargetAtTime(0,now,.036);
 road.onended=()=>volume.disconnect();
 engine.stop(now+.18);
 road.stop(now+.18);
}
function tickVehicleSound(now){
 const vehicle=scene==='outside'&&(drivingVehicle||ridingVehicle);
 if(!vehicle){stopVehicleSound();return}
 if(vehicleSound?.id!==vehicle.id){
   stopVehicleSound();
   vehicleSound=openVehicleSound(vehicle,now);
 }
 const sound=vehicleSound;
 const elapsed=Math.max(.001,(now-sound.now)/1000);
 const distance=Math.hypot(me.x-sound.x,me.y-sound.y);
 const speed=distance>100?0:Math.min(1,distance/elapsed/vehicleModels[vehicle.key].speed);
 sound.speed+=(speed-sound.speed)*(1-Math.exp(-elapsed*9));
 Object.assign(sound,{x:me.x,y:me.y,now});
 const rpm=sound.speed;
 const clock=gameAudio.context.currentTime;
 const profile=sound.profile;
 sound.engine.frequency.setTargetAtTime(profile.pitch+profile.rev*rpm,clock,.085);
 sound.engineFilter.frequency.setTargetAtTime(profile.filter+540*rpm,clock,.09);
 sound.engineVolume.gain.setTargetAtTime(profile.motor*(.45+.55*rpm),clock,.085);
 sound.roadFilter.frequency.setTargetAtTime(profile.filter+750*rpm,clock,.10);
 sound.roadVolume.gain.setTargetAtTime(profile.roll*rpm,clock,.09);
}
function tickGameSound(now){
 const motion=avatarMotion.get(me);
 const footfall=motion&&motion.steps!==lastAudibleStep;
 if(motion)lastAudibleStep=motion.steps;
 if(!gameSoundEnabled||gameAudio?.context.state!=='running'||document.hidden)return;
 tickVehicleSound(now);
 const outdoors=scene==='outside';
 const night=outdoors&&isTownNight();
 const setting=night?'night':scene;
 if(setting!==lastSoundSetting){
   lastSoundSetting=setting;
   const {context,filter,ambience}=gameAudio;
   filter.frequency.setTargetAtTime(outdoors?530:scene==='mine'?270:140,context.currentTime,.25);
   ambience.gain.setTargetAtTime(outdoors?.125:scene==='mine'?.08:.035,context.currentTime,.25);
   nextAmbientSound=now+900;
 }
 if(now>=nextAmbientSound){
   if(outdoors){
     const call=night?'cricket':'bird';
     playGameSound(call);playGameSound(call,night?.13:.19);
   }else if(scene==='mine')playGameSound('drip');
   nextAmbientSound=now+2600+Math.random()*3100;
 }
 if(footfall&&me.walking&&!isInVehicle()){
   const surface=me.swimming?'splash':outdoors?'grass':scene==='mine'?'stone':'step';
   playFootstep(surface,motion.blend);
 }
}

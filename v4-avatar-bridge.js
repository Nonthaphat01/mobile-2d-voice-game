/**
 * V4->V5 avatar adapter. The model/animation is imported verbatim from the user's V4 game.js.
 * The bridge retains stable actors across Firebase updates and provides an accessible appearance editor.
 */
import {renderClassicAvatar,V4_APPEARANCE_OPTIONS} from './v4-character.js?v=v5-neighbors-1';
import {sanitizeAppearance} from './shared/rules.js?v=v5-hud-1';

const actors=new Map();
const STORAGE='v5_v4_appearance';
let chosen=sanitizeAppearance();
let touched=false;
try{chosen=sanitizeAppearance(JSON.parse(localStorage.getItem(STORAGE)||localStorage.getItem('thai2d_appearance_v5')||'null'))}catch{}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(chosen))}catch{}}
export function getChosenAppearance(){return sanitizeAppearance(chosen)}
export function hasChosenAppearance(){return touched}
export function useSavedAppearance(value){if(!touched){chosen=sanitizeAppearance(value);persist()}}
export function resetAvatarMotion(){actors.clear()}

export function drawClassicActor(ctx,p,now,local,profileName,localAppearance){
 const x=Number(p.x)||0,y=Number(p.y)||0;
 const id=local?'__me__':String(p.id??p.uid??'slot:'+p.slot);
 let actor=actors.get(id);
 if(!actor){actor={x,y,scene:'outside',pose:'stand',face:Math.PI/2,lastTravel:-1e9};actors.set(id,actor)}
 const dx=x-actor.x,dy=y-actor.y,travel=Math.hypot(dx,dy);
 if(travel>.1)actor.lastTravel=now;
 const face=p.pose==='sit'&&Number.isFinite(p.restAngle)?Math.PI/2+p.restAngle:(local||p.id?.startsWith('gardener-'))?(Number.isFinite(p.face)?p.face:Math.PI/2):
   travel>.25?Math.atan2(dy,dx):actor.face;
 Object.assign(actor,p,{x,y,face,scene:local?(p.scene||'outside'):(p.scene||'outside'),
  pose:p.pose||'stand',onBed:p.pose==='sleep',walking:local||p.positionInterpolated?!!p.walking:(now-actor.lastTravel<340),
  name:local?profileName:(p.name||'ผู้เล่น'),
  appearance:(local?sanitizeAppearance(localAppearance):
     p.appearance?sanitizeAppearance(p.appearance):undefined)});
 return renderClassicAvatar(ctx,actor,now,{speaking:p.voiceTalking===true||!!(p.text&&p.until>Date.now())});
}

function appearancePreview(canvas){
 if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#1e354b';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#55755a';ctx.beginPath();
 ctx.ellipse(canvas.width/2,canvas.height-17,canvas.width*.38,12,0,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.translate(canvas.width/2,canvas.height*.65);ctx.scale(2.35,2.35);
 // One-off actor avoids preview's motion state from leaking into game models.
 renderClassicAvatar(ctx,{x:0,y:0,scene:'preview',face:Math.PI/2,
   pose:'stand',walking:false,appearance:chosen},performance.now());
 ctx.restore();
}
export function buildAppearanceEditor(host,onApply,{lobby=false}={}){
 if(!host)return;
 host.replaceChildren();
 const preview=document.createElement('canvas');
 preview.width=150;preview.height=146;
 preview.className='avatar-model-preview';
 preview.setAttribute('aria-label','ตัวอย่างโมเดลตัวละครจากเกม V4');
 host.append(preview);
 const grid=document.createElement('div');grid.className='avatar-fields';
 const titles={gender:'รูปร่าง',skin:'สีผิว',hair:'สีผม',style:'ทรงผม',outfit:'สีเสื้อผ้า',accessory:'เครื่องประดับ'};
 for(const [key,names] of Object.entries(V4_APPEARANCE_OPTIONS)){
   const label=document.createElement('label');const title=document.createElement('span');
   title.textContent=titles[key]||key;label.append(title);
   const select=document.createElement('select');
   select.setAttribute('aria-label',title.textContent);
   names.forEach((name,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;select.append(option)});
   select.value=String(chosen[key]);
   select.onchange=()=>{
     chosen=sanitizeAppearance({...chosen,[key]:Number(select.value)});
     touched=true;persist();appearancePreview(preview);
   };
   label.append(select);grid.append(label);
 }
 host.append(grid);
 const button=document.createElement('button');button.type='button';
 button.className=lobby?'mini avatar-apply':'dialog-action avatar-apply';
 button.textContent=lobby?'💾 ใช้ตัวละครนี้':'💾 บันทึกรูปลักษณ์ตัวละคร';
 button.onclick=()=>{touched=true;persist();onApply?.(getChosenAppearance())};
 host.append(button);
 appearancePreview(preview);
}

/* Ambient light and cursor magic for the lobby. Never affects game state. */
(() => {
  "use strict";
  const lobby = document.getElementById("lobby");
  const canvas = document.getElementById("lobbyLights");
  const brand = lobby?.querySelector(".entry-brand");
  if (!lobby || !canvas || !brand) return;
  const ctx = canvas.getContext("2d", {alpha:true});
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width:720px), (pointer:coarse)");
  const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let W=1,H=1,D=1,raf=0,last=0,lastTrail=0;
  const motes=[],sparks=[],rings=[];
  function glow(core, halo) {
    const image=document.createElement("canvas");image.width=image.height=64;
    const g=image.getContext("2d"),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,core);r.addColorStop(.13,halo);r.addColorStop(.42,"rgba(255,220,155,.14)");r.addColorStop(1,"rgba(255,220,155,0)");
    g.fillStyle=r;g.fillRect(0,0,64,64);return image;
  }
  const sprites=[
    glow("rgba(255,250,211,1)","rgba(255,191,82,.68)"),
    glow("rgba(246,255,210,1)","rgba(160,233,147,.64)"),
    glow("rgba(255,255,239,1)","rgba(255,221,151,.65)")
  ];
  function mote(anywhere=false){
    return {x:rand(-25,W+25),y:anywhere?rand(-25,H+25):H+rand(0,40),
      vx:rand(-10,10),vy:rand(10,30),radius:rand(9,27),
      phase:rand(0,7),rate:rand(.65,1.85),kind:Math.floor(rand(0,3)),opacity:rand(.45,.97)};
  }
  function resize(){
    W=Math.max(1,innerWidth);H=Math.max(1,innerHeight);D=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(W*D);canvas.height=Math.round(H*D);
    ctx.setTransform(D,0,0,D,0,0);
    const count=compact.matches?48:96;
    while(motes.length<count)motes.push(mote(true));
    motes.length=count;
  }
  function scatter(x,y,n=3,burst=false){
    for(let i=0;i<n&&sparks.length<120;i++){
      const a=rand(0,Math.PI*2),speed=burst?rand(40,160):rand(10,45),life=burst?rand(.5,1):rand(.35,.75);
      sparks.push({x:x+rand(-3,3),y:y+rand(-3,3),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-18,
        life,total:life,r:rand(1.3,burst?4.2:3.1),kind:Math.floor(rand(0,3))});
    }
  }
  function frame(now){
    raf=0;
    if(lobby.hidden||document.hidden||reduced.matches)return;
    if(now-last<25){raf=requestAnimationFrame(frame);return;}
    const dt=Math.min((now-(last||now))/1000,.06);last=now;
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation="lighter";
    for(let i=0;i<motes.length;i++){
      let m=motes[i];
      m.x+=(m.vx+Math.sin(now*.0009*m.rate+m.phase)*10)*dt;
      m.y-=m.vy*dt;
      if(m.y< -50||m.x< -65||m.x>W+65){motes[i]=mote();m=motes[i];}
      const pulse=.62+Math.sin(now*.0017*m.rate+m.phase)*.32;
      ctx.globalAlpha=m.opacity*pulse;
      const r=m.radius;ctx.drawImage(sprites[m.kind],m.x-r,m.y-r,r*2,r*2);
      if(r>19){
        ctx.globalAlpha=m.opacity*pulse*.34;
        ctx.strokeStyle=m.kind===1?"#b7ffb9":"#ffe1a3";
        ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(m.x-2,m.y+r*.55);ctx.lineTo(m.x+1,m.y-r*.48);ctx.stroke();
      }
    }
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i];s.life-=dt;if(s.life<=0){sparks.splice(i,1);continue;}
      const ox=s.x,oy=s.y;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=20*dt;
      const f=s.life/s.total;
      ctx.globalAlpha=Math.min(1,f*1.2);
      ctx.lineWidth=Math.max(.6,s.r*f*.65);
      ctx.strokeStyle=s.kind===1?"#d1ffc7":"#ffe2ac";
      ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(s.x,s.y);ctx.stroke();
      const r=s.r*(7+(1-f)*4);ctx.drawImage(sprites[s.kind],s.x-r,s.y-r,r*2,r*2);
    }
    for(let i=rings.length-1;i>=0;i--){
      const r=rings[i];r.age+=dt;if(r.age>.85){rings.splice(i,1);continue;}
      const t=r.age/.85;ctx.globalAlpha=(1-t)*.7;ctx.strokeStyle="#fff0bf";ctx.lineWidth=(1-t)*2;
      ctx.beginPath();ctx.arc(r.x,r.y,6+80*t,0,Math.PI*2);ctx.stroke();
    }
    ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
    raf=requestAnimationFrame(frame);
  }
  function sync(){
    if(lobby.hidden||document.hidden||reduced.matches){
      if(raf)cancelAnimationFrame(raf);raf=0;last=0;ctx.clearRect(0,0,W,H);return;
    }
    resize();if(!raf)raf=requestAnimationFrame(frame);
  }
  function pointer(e){
    const x=clamp(e.clientX,0,W),y=clamp(e.clientY,0,H);
    lobby.style.setProperty("--pointer-x",x+"px");
    lobby.style.setProperty("--pointer-y",y+"px");
    const b=brand.getBoundingClientRect(),bx=x-b.left,by=y-b.top;
    brand.style.setProperty("--glow-x",bx+"px");
    brand.style.setProperty("--glow-y",by+"px");
    brand.style.setProperty("--land-x",clamp((bx/Math.max(1,b.width)-.5)*-18,-11,11).toFixed(1)+"px");
    brand.style.setProperty("--land-y",clamp((by/Math.max(1,b.height)-.5)*-12,-8,8).toFixed(1)+"px");
    return {x,y};
  }
  lobby.addEventListener("pointermove",e=>{
    if(reduced.matches||lobby.hidden||e.pointerType==="touch")return;
    const p=pointer(e);
    if(performance.now()-lastTrail>25){
      lastTrail=performance.now();scatter(p.x,p.y,3);
    }
  },{passive:true});
  lobby.addEventListener("pointerdown",e=>{
    if(reduced.matches||lobby.hidden)return;
    const p=pointer(e);scatter(p.x,p.y,compact.matches?9:18,true);
    if(rings.length<8)rings.push({x:p.x,y:p.y,age:0});
  },{passive:true});
  lobby.addEventListener("pointerleave",()=>{
    brand.style.setProperty("--land-x","0px");brand.style.setProperty("--land-y","0px");
    brand.style.setProperty("--glow-x","-1000px");
  });
  addEventListener("resize",sync,{passive:true});
  document.addEventListener("visibilitychange",sync);
  new MutationObserver(sync).observe(lobby,{attributes:true,attributeFilter:["hidden"]});
  reduced.addEventListener?.("change",sync);
  sync();
})();

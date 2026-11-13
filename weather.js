const rain = Array.from({length:150}, (_,i) => ({
  x: ((i*619) % 997)/997, y: ((i*307) % 991)/991, speed: .65+(i%8)/14
}));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cycle = [
  {name:'☀️ ฟ้าโปร่ง', wind:.35, rain:0},
  {name:'🍃 ลมแรง', wind:1, rain:0},
  {name:'🌦️ ฝนโปรย', wind:.55, rain:.55},
  {name:'🌧️ ฝนตก', wind:.9, rain:1}
];

export function weatherAt(now) {
  return cycle[Math.floor(now/35_000)%cycle.length];
}
export function sway(now, seed, weather) {
  return reducedMotion.matches ? 0 : Math.sin(now/360+seed)*weather.wind*4;
}
export function drawWeather(ctx, width, height, now, weather) {
  if (weather.rain) {
    ctx.fillStyle = weather.rain>.7 ? '#3048653b' : '#46648123';
    ctx.fillRect(0,0,width,height);
  }
  if (reducedMotion.matches) return;
  ctx.save();
  if (weather.rain) {
    ctx.strokeStyle = '#cfecff80';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const drop of rain.slice(0,Math.ceil(rain.length*weather.rain))) {
      const y=(drop.y*height+now*.64*drop.speed)%(height+35)-20;
      const x=(drop.x*width+now*.16*weather.wind*drop.speed)%(width+45)-25;
      ctx.moveTo(x,y);
      ctx.lineTo(x+6*weather.wind,y+14*drop.speed);
    }
    ctx.stroke();
    ctx.strokeStyle='#c3e5f844';
    ctx.beginPath();
    for(let i=0;i<22;i++){
      const phase=((now+i*173)%1900)/1900;
      if(phase>.5)continue;
      const x=(i*431)%width, y=(i*179)%height, r=1+phase*13;
      ctx.moveTo(x+r,y);
      ctx.ellipse(x,y,r,r*.38,0,0,Math.PI*2);
    }
    ctx.stroke();
  } else if (weather.wind>.6) {
    ctx.strokeStyle = '#f2f8c65e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for(let i=0;i<26;i++){
      const x=(i*277+now*.12)%(width+55)-30;
      const y=(i*127)%height+Math.sin(now/510+i)*8;
      ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+15,y-7,x+30,y-2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

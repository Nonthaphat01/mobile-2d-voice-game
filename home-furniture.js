import {HOME_GRID, furnitureFootprint, FURNITURE_TYPES} from './shared/rules.js?v=v5-neighbors-1';

export function furnitureRect(item) {
  const size = furnitureFootprint(item);
  const {x, y, tile} = HOME_GRID;
  return {x: x + item.col * tile, y: y + item.row * tile, w: size.w * tile, h: size.h * tile};
}

export function drawFurniture(ctx, item) {
  const rect = furnitureRect(item);
  const angle = item.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2 + 4;
  const wood = ['#bc8559', '#8e5b3d', '#68432e'];
  const linen = ['#fff4dd', '#ded1ba', '#b5a997'];
  const quilt = ['#6ba7a1', '#478581', '#376864'];
  const seat = ['#d4aa78', '#a6754e', '#825538'];
  const point = (x, y, z) => [cx + x * cos - y * sin, cy + x * sin + y * cos - z * .64];
  const polygon = (points, fill) => {
    ctx.beginPath();
    for (const [i, [x, y]] of points.entries()) {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const box = (x, y, w, h, bottom, top, palette) => {
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const upper = corners.map(([px, py]) => point(px, py, top));
    const lower = corners.map(([px, py]) => point(px, py, bottom));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (upper[i][0] - upper[j][0] < .01) continue;
      polygon([upper[i], upper[j], lower[j], lower[i]], palette[i % 2 + 1]);
    }
    polygon(upper, palette[0]);
  };
  const bed = item.type === 'bed';
  ctx.save();
  ctx.fillStyle = '#35251d35';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, rect.w / 2 - 5, rect.h / 2 - 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const legs = (xs, ys, height) => {
    const feet = xs.flatMap(x => ys.map(y => [x, y]));
    feet.sort((a, b) => point(...a, 0)[1] - point(...b, 0)[1]);
    for (const [x, y] of feet) box(x, y, 4, 4, 0, height, wood);
  };
  if (bed) {
    const headboard = () => box(-40, -15, 5, 30, 4, 18, wood);
    const footboard = () => box(34, -15, 5, 30, 4, 10, wood);
    const headInFront = sin < -.01;
    legs([-38, 34], [-13, 9], 6);
    box(-40, -15, 79, 30, 4, 8, wood);
    if (!headInFront) headboard();
    if (headInFront) footboard();
    box(-35, -13, 69, 26, 8, 13, linen);
    box(-31, -10, 14, 20, 13, 16, ['#fffaed', '#e4d9c7', '#c7bba9']);
    box(-12, -14, 46, 28, 10, 14, quilt);
    box(-12, -14, 5, 28, 14, 15, ['#9bd0c6', '#70ada3', '#518d84']);
    for (const x of [0, 13, 26]) {
      polygon([point(x,-12,14), point(x+1,-12,14), point(x+1,12,14), point(x,12,14)], '#e3f9e643');
    }
    if (headInFront) headboard();
    else footboard();
  } else if(item.type==='chair') {
    const back = () => {
      for (const x of [-13, 9]) box(x, -13, 4, 4, 8, 22, wood);
      box(-13, -14, 26, 5, 17, 23, wood);
    };
    const backInFront = cos < -.01;
    legs([-13, 9], [-12, 9], 9);
    if (!backInFront) back();
    box(-14, -12, 28, 26, 8, 12, wood);
    box(-11, -8, 22, 18, 12, 14, seat);
    if (backInFront) back();
  } else {
    const def=FURNITURE_TYPES[item.type];
    const w=def.width*HOME_GRID.tile-13,h=def.height*HOME_GRID.tile-15;
    const x=-w/2,y=-h/2;
    const colors=[def.color,'#786455','#58493e'];
    const block=(z,depth=0)=>box(x,y,w,h,depth,z,colors);
    switch(def.model){
      case 'table':
        legs([x+3,-x-7],[y+3,-y-7],13);block(17,12);break;
      case 'seat':
        block(12,2);
        box(x+5,y+7,w-10,h-10,12,16,[def.color,'#697a6e','#596c61']);
        box(x,y,w,7,8,24,colors);
        for(const dx of [x,-x-6])box(dx,y,6,h,8,19,colors);
        break;
      case 'rug':
        block(1);
        for(const dy of [y+3,-y-6])box(x+3,dy,w-6,3,1,1,['#e7ceac','#e7ceac','#e7ceac']);
        break;
      case 'plant':
      case 'flowers': {
        box(-9,-8,18,16,0,10,wood);
        for(const [dx,dy,z,r] of [[-7,2,15,6],[6,-5,21,7],[0,1,28,7]]){
          const [px,py]=point(dx,dy,z);
          ctx.fillStyle=def.color;ctx.beginPath();ctx.ellipse(px,py,r,r*.72,0,0,Math.PI*2);ctx.fill();
        }
        break;
      }
      case 'lamp': {
        box(-10,-8,20,16,0,3,wood);
        box(-2,-2,4,4,3,25,wood);
        box(-10,-8,20,16,23,33,colors);break;
      }
      case 'books':
        block(27);
        for(let i=0;i<5;i++)box(x+4+i*13,y+5,8,12,27,30,[['#ca916b','#9aa88b','#c3a4ac'][i%3],'#a79885','#80716a']);
        break;
      case 'mirror':
        block(10);box(x+4,y+4,w-8,h-8,10,11,['#a6ccd0','#9db7b6','#747e85']);break;
      case 'piano':
        block(23,8);box(x+5,y+h-10,w-10,8,19,21,['#f4efdd','#bfa891','#bfa891']);
        for(let i=0;i<10;i++)box(x+7+i*7,y+h-9,2,4,21,22,['#29272e','#29272e','#29272e']);
        break;
      case 'counter':
        block(22);box(x+8,y+6,16,14,22,23,['#657971','#667872','#52615b']);break;
      case 'clock':
      case 'radio': {
        block(def.model==='clock'?27:12);
        const [px,py]=point(0,2,def.model==='clock'?27:12);
        ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fillStyle='#f0d9a7';ctx.fill();
        ctx.beginPath();ctx.moveTo(px,py-4);ctx.lineTo(px,py);ctx.lineTo(px+4,py+1);ctx.strokeStyle='#5d493b';ctx.stroke();
        break;
      }
      default:
        block(item.type==='chest'?12:25);
        box(-2,y+h-8,4,5,16,18,['#f0d393','#b39565','#9d8056']);
    }
  }
  ctx.restore();
}

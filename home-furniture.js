import {HOME_GRID, furnitureFootprint} from './shared/rules.js?v=v5-build-mode-1';

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
  } else {
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
  }
  ctx.restore();
}

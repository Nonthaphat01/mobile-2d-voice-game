import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estatePlotRect,estatePlotIndex} from '../shared/estate-layout.js';
import {plotCount} from '../shared/estate.js';
import {gardenerPosition} from '../shared/farming.js';

test('all purchased plots fit and resolve to their original save index',()=>{
  const lot={x:130,y:105,w:495,h:425};
  for(let tier=0;tier<=5;tier++){
    const rects=Array.from({length:plotCount(tier)},(_,i)=>estatePlotRect(lot,i,tier));
    for(const [i,r] of rects.entries()){
      assert.ok(r.x>=lot.x+258&&r.x+r.w<lot.x+lot.w);
      assert.ok(r.y>=lot.y+47&&r.y+r.h<lot.y+lot.h);
      assert.equal(estatePlotIndex(lot,r.x+r.w/2,r.y+r.h/2,tier),i);
      assert.ok(rects.slice(0,i).every(q=>q.x+q.w<=r.x||r.x+r.w<=q.x||q.y+q.h<=r.y||r.y+r.h<=q.y));
    }
    assert.equal(estatePlotIndex(lot,lot.x+150,lot.y+100,tier),-1);
    const last=rects.at(-1);
    const worker=gardenerPosition(lot,{phase:'garden',plot:rects.length-1,fromPlot:-1,startedAt:0},3000,tier);
    assert.equal(estatePlotIndex(lot,worker.x,worker.y,tier),rects.length-1);
  }
});


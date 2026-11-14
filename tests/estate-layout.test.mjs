import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estateBounds,estateFenceBlocks,estatePlotRect,estatePlotIndex} from '../shared/estate-layout.js';
import {plotCount} from '../shared/estate.js';
import {gardenerPosition} from '../shared/farming.js';

test('all purchased plots fit and resolve to their original save index',()=>{
  const lot={x:130,y:105,w:495,h:425,slot:0};
  for(let tier=0;tier<=5;tier++){
    const bounds=estateBounds(lot,tier);
    const rects=Array.from({length:plotCount(tier)},(_,i)=>estatePlotRect(lot,i,tier));
    for(const [i,r] of rects.entries()){
      assert.ok(r.x>=lot.x+258&&r.x+r.w<bounds.x+bounds.w);
      assert.ok(r.y>=bounds.y+47&&r.y+r.h<bounds.y+bounds.h);
      assert.equal(estatePlotIndex(lot,r.x+r.w/2,r.y+r.h/2,tier),i);
      assert.ok(rects.slice(0,i).every(q=>q.x+q.w<=r.x||r.x+r.w<=q.x||q.y+q.h<=r.y||r.y+r.h<=q.y));
    }
    assert.equal(estatePlotIndex(lot,lot.x+150,lot.y+100,tier),-1);
    const last=rects.at(-1);
    const worker=gardenerPosition(lot,{phase:'garden',plot:rects.length-1,fromPlot:-1,startedAt:0},3000,tier);
    assert.equal(estatePlotIndex(lot,worker.x,worker.y,tier),rects.length-1);
  }
});


test('each purchase moves the fence out while keeping the road gates and neighbor lanes clear',()=>{
  const lots=Array.from({length:8},(_,slot)=>({slot,x:130+(slot%4)*555,y:slot<4?105:755,w:495,h:425}));
  for(const lot of lots){
    const base=estateBounds(lot,0);
    for(let tier=1;tier<=5;tier++){
      const previous=estateBounds(lot,tier-1),current=estateBounds(lot,tier);
      assert.ok(current.w*current.h>previous.w*previous.h);
      assert.equal(current.gateY,base.gateY);
      assert.ok(!estateFenceBlocks(lot,current.gateX+21,current.gateY,tier));
      assert.ok(estateFenceBlocks(lot,current.gateX,current.gateY,tier));
      const back=lot.slot<4?current.y:current.y+current.h;
      assert.ok(estateFenceBlocks(lot,current.gateX+21,back,tier));
      const oldBack=lot.slot<4?base.y:base.y+base.h;
      assert.ok(!estateFenceBlocks(lot,current.gateX+21,oldBack,tier));
      assert.ok(current.y>22&&current.y+current.h<1268);
      const neighbor=lots[lot.slot+1];
      if(lot.slot%4!==3)assert.ok(estateBounds(neighbor,5).x-(current.x+current.w)>=20);
    }
  }
});

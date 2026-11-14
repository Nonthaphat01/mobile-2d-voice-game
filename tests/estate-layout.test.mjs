import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  estateBounds, estateFenceBlocks, estateFenceSegments, estateGardenFields, estatePlotIndex, estatePlotRect,
  estateFromWire, estateToWire, estateWorld, mapEstateLot
} from '../shared/estate-layout.js';
import {plotCount} from '../shared/estate.js';
import {gardenerPosition} from '../shared/farming.js';

const originalLots=Array.from({length:8},(_,slot)=>({
  slot,x:130+(slot%4)*555,y:slot<4?105:755,w:495,h:425
}));
const lots=originalLots.map(mapEstateLot);

test('every tier adds beds behind the house without resizing or moving previously purchased beds',()=>{
  for(const lot of lots){
    for(let tier=0;tier<=5;tier++){
      const bounds=estateBounds(lot,tier);
      const rects=Array.from({length:plotCount(tier)},(_,i)=>estatePlotRect(lot,i));
      for(const [i,r] of rects.entries()){
        assert.deepEqual([r.w,r.h],[78,53]);
        assert.ok(r.x>bounds.x+11&&r.x+r.w<bounds.x+bounds.w-11);
        assert.ok(r.y>bounds.y+11&&r.y+r.h<bounds.y+bounds.h-11);
        if(i>=10)assert.ok(lot.slot<4?r.y+r.h<lot.y:r.y>lot.y+lot.h);
        assert.equal(estatePlotIndex(lot,r.x+r.w/2,r.y+r.h/2,tier),i);
        assert.ok(rects.slice(0,i).every(q=>q.x+q.w<=r.x||r.x+r.w<=q.x||q.y+q.h<=r.y||r.y+r.h<=q.y));
      }
      const lastIndex=rects.length-1;
      const worker=gardenerPosition(lot,{phase:'garden',plot:lastIndex,fromPlot:-1,startedAt:0},3000);
      assert.equal(estatePlotIndex(lot,worker.x,worker.y,tier),lastIndex);
      if(tier<5){
        const next=estatePlotRect(lot,rects.length);
        assert.equal(estatePlotIndex(lot,next.x+1,next.y+1,tier),-1);
      }
    }
  }
});

test('the expanded fences keep their road frontage and leave access to the rear garden',()=>{
  for(const lot of lots){
    for(let tier=1;tier<=5;tier++){
      const previous=estateBounds(lot,tier-1),current=estateBounds(lot,tier);
      assert.ok(current.w>previous.w&&current.h>previous.h);
      assert.deepEqual(estateFenceSegments(lot,tier).slice(0,2),estateFenceSegments(lot,0).slice(0,2));
      assert.ok(!estateFenceBlocks(lot,current.gateX+21,current.gateY,tier));
      assert.ok(estateFenceBlocks(lot,current.gateX,current.gateY,tier));
      const formerRear=lot.slot<4?previous.y:previous.y+previous.h;
      const newRear=lot.slot<4?current.y:current.y+current.h;
      assert.ok(!estateFenceBlocks(lot,current.gateX+21,formerRear,tier));
      assert.ok(estateFenceBlocks(lot,current.gateX+21,newRear,tier));
      assert.ok(current.y>estateWorld.top+22&&current.y+current.h<estateWorld.bottom-22);
      assert.ok(current.x>estateWorld.left+22&&current.x+current.w<estateWorld.right-22);
      if(lot.slot%4!==3)assert.ok(estateBounds(lots[lot.slot+1],5).x-(current.x+current.w)>22);
    }
  }
});

test('larger map positions round-trip within the existing Firebase movement limits',()=>{
  assert.deepEqual(estateToWire(1200,640),{x:1200,y:640});
  for(const [i,lot] of lots.entries()){
    const base=originalLots[i];
    assert.deepEqual(estateToWire(lot.x+247,lot.y+50),{x:base.x+247,y:base.y+50});
    const bounds=estateBounds(lot,5);
    for(const x of [bounds.x,bounds.x+bounds.w]){
      for(const y of [bounds.y,bounds.y+bounds.h]){
        const encoded=estateToWire(x,y);
        assert.ok(encoded.x>=0&&encoded.x<=2400&&encoded.y>=0&&encoded.y<=1290);
        const decoded=estateFromWire(encoded.x,encoded.y);
        assert.ok(Math.abs(x-decoded.x)<1e-8&&Math.abs(y-decoded.y)<1e-8);
      }
    }
  }
});


test('each garden bank mirrors its partner across an uninterrupted walking aisle',()=>{
  for(const lot of lots){
    const centre=lot.x+lot.w/2;
    const fields=estateGardenFields(lot,5);
    assert.equal(fields.length,5);
    for(let tier=1;tier<=5;tier++){
      const field=fields[tier-1];
      const beds=Array.from({length:plotCount(tier-1)},(_,i)=>estatePlotRect(lot,plotCount(tier-1)+i));
      for(const bed of beds){
        assert.ok(bed.x>=field.x&&bed.x+bed.w<=field.x+field.w);
        assert.ok(bed.y>=field.y&&bed.y+bed.h<=field.y+field.h);
        assert.ok(beds.some(other=>other.y===bed.y&&other.x===2*centre-bed.x-bed.w));
        assert.equal(estatePlotIndex(lot,centre,bed.y+bed.h/2,tier),-1);
      }
    }
  }
});


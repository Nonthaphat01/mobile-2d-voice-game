import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction, GROW_MS, lots, sanitizeState, starter} from '../shared/rules.js';
import {gardenerPosition, gradeOf, marketPrice, rollGrade} from '../shared/farming.js';
import {LISTING_DURATION, trade} from '../shared/market-trade.js';

test('old tomatoes migrate to C and all grade bands respect the requested multipliers',()=>{
  const old=starter();
  delete old.inventory.tomatoGrades;
  old.inventory.tomato=8;
  assert.deepEqual(sanitizeState(old).inventory.tomatoGrades,{100:8});
  for(const [roll, low, high, name] of [[.1,100,100,'C'],[.8,150,150,'B'],[.95,500,500,'A'],[.99,1000,5000,'S'],[.999,10000,99900,'SS']]){
    for(const [fraction,value] of [[0,low],[.999999,high]]){
      const results=[roll,fraction];
      assert.equal(rollGrade(()=>results.shift()),value);
      assert.equal(gradeOf(value).name,name);
    }
  }
});

test('gardener grows, walks to the market, sells once, then returns',()=>{
  const state=starter();
  state.inventory.tomato_seed=1;
  assert.equal(applyAction(state,{type:'hireGardener',slot:0},1000).ok,true);
  const step=(now)=>applyAction(state,{type:'gardenerStep',slot:0},now,()=>.1);
  const worker=state.home.gardener;
  step(1000);
  step(worker.nextAt);
  step(1000+GROW_MS);
  assert.equal(state.inventory.tomato,3);
  step(worker.nextAt);
  assert.equal(worker.phase,'outbound');
  const arrival=worker.nextAt;
  assert.equal(gardenerPosition(lots[0],worker,arrival).x,1200);
  assert.equal(step(arrival-1).ok,false);
  step(arrival);
  assert.equal(worker.phase,'return');
  assert.equal(state.inventory.tomato,0);
  assert.equal(state.money,65+3*marketPrice(100,arrival));
  assert.equal(step(arrival).ok,false);
  step(worker.nextAt);
  assert.equal(worker.phase,'garden');
});

test('listing escrows stock, locks price, and transfers once to the buyer',()=>{
  const root={profiles:{seller:starter(),buyer:starter(),other:starter()}};
  root.profiles.seller.inventory.tomato=3;
  root.profiles.seller.inventory.tomatoGrades={500:3};
  const id='0'.repeat(36);
  assert.equal(trade(root,'seller',{type:'list',id,key:500,quantity:2},0).ok,true);
  assert.equal(root.profiles.seller.inventory.tomato,1);
  assert.equal(trade(root,'seller',{type:'buy',id},600000).ok,false);
  assert.equal(trade(root,'buyer',{type:'buy',id},600000).ok,true);
  assert.equal(root.profiles.buyer.money,30);
  assert.equal(root.profiles.seller.money,170);
  assert.deepEqual(root.profiles.buyer.inventory.tomatoGrades,{500:2});
  assert.equal(trade(root,'other',{type:'buy',id},600000).ok,false);
  assert.equal(root.profiles.other.money,100);
});

test('expired stock remains reclaimable and failed sales retain money and items',()=>{
  const root={profiles:{seller:starter(),buyer:starter()}};
  root.profiles.seller.inventory.tomato=1;
  root.profiles.seller.inventory.tomatoGrades={99900:1};
  const id='a'.repeat(36);
  assert.equal(trade(root,'seller',{type:'list',id,key:99900,quantity:1},0).ok,true);
  assert.equal(trade(root,'buyer',{type:'buy',id},10).ok,false);
  assert.equal(trade(root,'buyer',{type:'buy',id},LISTING_DURATION).ok,false);
  assert.equal(trade(root,'seller',{type:'cancel',id},LISTING_DURATION).ok,true);
  assert.deepEqual(root.profiles.seller.inventory.tomatoGrades,{99900:1});
  assert.equal(root.profiles.buyer.money,100);
});

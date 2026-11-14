import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction, GROW_MS, lots, sanitizeState, starter} from '../shared/rules.js';
import {gardenBoxPosition, gardenerPosition, gradeOf, rollGrade} from '../shared/farming.js';
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

test('gardener grows and brings the harvest to the garden box without selling',()=>{
  const state=starter();
  state.money=200;
  state.inventory.tomato_seed=1;
  assert.equal(applyAction(state,{type:'hireGardener',slot:0,plan:'short'},1000).ok,true);
  const step=(now)=>applyAction(state,{type:'gardenerStep',slot:0},now,()=>.1);
  const worker=state.home.gardener;
  step(1000);
  step(worker.nextAt);
  const ripeAt=1000+GROW_MS;
  for(let time=worker.lastSeenAt+10000;time<ripeAt;time+=10000)step(time);
  step(ripeAt);
  assert.equal(state.inventory.tomato,0);
  assert.deepEqual(state.home.gardenBox,{tomato:3,tomatoGrades:{100:3}});
  assert.equal(worker.phase,'deposit');
  const arrival=worker.nextAt;
  assert.equal(gardenerPosition(lots[0],worker,arrival).x,gardenBoxPosition(lots[0]).x);
  step(arrival-1);
  assert.equal(worker.phase,'deposit');
  step(arrival);
  assert.equal(worker.phase,'garden');
  assert.equal(state.money,100);
  assert.equal(applyAction(state,{type:'collectGardenBox'},arrival).ok,true);
  assert.equal(state.inventory.tomato,3);
  assert.equal(state.home.gardenBox.tomato,0);
  assert.equal(applyAction(state,{type:'collectGardenBox'},arrival).ok,false);
});

test('contract options charge once and reject invalid plans or insufficient funds',()=>{
  for(const [plan,cost,minutes] of [['short',100,10],['hour',500,60],['day',3000,1440]]){
    const state=starter();
    state.money=cost-1;
    assert.equal(applyAction(state,{type:'hireGardener',slot:0,plan},10000).ok,false);
    state.money++;
    assert.equal(applyAction(state,{type:'hireGardener',slot:0,plan},10000).ok,true);
    assert.equal(state.money,0);
    assert.equal(state.home.gardener.contractUntil,10000+minutes*60000);
    assert.equal(applyAction(state,{type:'hireGardener',slot:0,plan},11000).ok,false);
  }
  assert.equal(applyAction(starter(),{type:'hireGardener',slot:0,plan:'constructor'},10000).ok,false);
});

test('offline catch-up stores crops up to expiry and survives reload without duplication',()=>{
  const state=starter();
  state.inventory.tomato_seed=1;
  const now=10_000;
  applyAction(state,{type:'hireGardener',slot:0,plan:'short'},now);
  const end=state.home.gardener.contractUntil;
  const reloaded=sanitizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(applyAction(reloaded,{type:'gardenerResume',slot:2},end+60000,()=>.1).ok,true);
  assert.deepEqual(reloaded.home.gardenerReceipt,{at:end+60000,gross:0,paid:0,stored:3,ended:true});
  assert.equal(reloaded.money,0);
  assert.deepEqual(sanitizeState(reloaded).home.gardenBox,{tomato:3,tomatoGrades:{100:3}});
  assert.equal(reloaded.home.gardener,undefined);
  assert.equal(applyAction(reloaded,{type:'gardenerResume',slot:2},end+70000,()=>.1).ok,false);
  assert.equal(reloaded.home.gardenBox.tomato,3);
});

test('old permanent hires migrate without a fee and a long absence does not extend the contract',()=>{
  const state=starter();
  state.home.gardener={phase:'garden',slot:0,startedAt:0,nextAt:0,plot:-1,fromPlot:-1};
  state.inventory.tomato_seed=0;
  const reloaded=sanitizeState(state);
  applyAction(reloaded,{type:'gardenerResume',slot:0},1000000,()=>.1);
  assert.equal(reloaded.home.gardener.contractUntil,1600000);
  applyAction(reloaded,{type:'gardenerResume',slot:0},90000000,()=>.1);
  assert.equal(reloaded.home.gardener,undefined);
  assert.equal(reloaded.home.gardenerReceipt.paid,0);
  assert.equal(reloaded.money,100);
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

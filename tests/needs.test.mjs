import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction, sanitizeState, starter} from '../shared/rules.js';
import {advanceNeeds, fatigueOpacity, hungerOffset, NEEDS_STEP_MS} from '../shared/needs.js';

test('legacy saves start with full needs and values stay within the meter range',()=>{
  const save=starter();
  delete save.needs;
  assert.deepEqual(sanitizeState(save).needs,{happiness:100,energy:100,fullness:100});
  assert.deepEqual(advanceNeeds({happiness:0,energy:0,fullness:0},'stand'),{happiness:0,energy:0,fullness:0});
});

test('needs ticks are limited and sitting or sleeping restores the right needs',()=>{
  const save=starter();
  save.needs={happiness:50,energy:50,fullness:50};
  const now=10000;
  assert.equal(applyAction(save,{type:'needsTick',pose:'sit'},now).ok,true);
  assert.equal(save.needs.happiness,54);
  assert.equal(applyAction(save,{type:'needsTick',pose:'sleep'},now+100).ok,false);
  assert.equal(applyAction(save,{type:'needsTick',pose:'sleep'},now+NEEDS_STEP_MS).ok,true);
  assert.equal(save.needs.energy,57.5);
  assert.ok(save.needs.fullness<50);
});

test('eating consumes one tomato and restores fullness without charging money',()=>{
  const save=starter();
  save.inventory.tomato=2;
  save.inventory.tomatoGrades={100:1,150:1};
  save.needs.fullness=20;
  assert.equal(applyAction(save,{type:'eat'}).ok,true);
  assert.equal(save.needs.fullness,48);
  assert.equal(save.inventory.tomato,1);
  assert.deepEqual(save.inventory.tomatoGrades,{150:1});
  assert.equal(save.money,100);
});

test('fatigue is gentle and periodic while hunger movement occurs in short bursts',()=>{
  assert.equal(fatigueOpacity(7625,40),0);
  assert.equal(fatigueOpacity(6900,0),0);
  assert.ok(Math.abs(fatigueOpacity(7625,0)-.28)<1e-10);
  assert.equal(fatigueOpacity(9000,0),0);
  assert.ok(hungerOffset(100,10)!==0);
  assert.equal(hungerOffset(450,10),0);
  assert.equal(hungerOffset(100,50),0);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starter,applyAction,lots,PLOT_COUNT,GROW_MS,sanitizeState} from '../shared/rules.js';

test('starter home: 100 baht, empty home, ten plots, starter tools',()=>{
 const s=starter('นนท์');assert.equal(s.money,100);assert.equal(s.home.furniture.length,0);assert.equal(s.home.plots.length,PLOT_COUNT);assert.equal(s.inventory.hoe,1);assert.equal(s.inventory.tomato_seed,3);
});
test('garden cycle: plant, water, harvest after 60s and gain EXP',()=>{
 const s=starter();const t=1700000000000;
 assert.equal(applyAction(s,{type:'harvest',plot:0},t).ok,false);
 assert.equal(applyAction(s,{type:'plant',plot:0},t).ok,true);
 assert.equal(s.inventory.tomato_seed,2);
 assert.equal(applyAction(s,{type:'plant',plot:0},t).ok,false);
 assert.equal(applyAction(s,{type:'water',plot:0},t+1).ok,true);
 assert.equal(applyAction(s,{type:'harvest',plot:0},t+1000).ok,false);
 assert.equal(applyAction(s,{type:'harvest',plot:0},t+GROW_MS+1).ok,true);
 assert.equal(s.inventory.tomato,3);assert.equal(s.xp,10);
});
test('money, shop and furniture purchase protect funds',()=>{
 const s=starter();assert.equal(applyAction(s,{type:'buy',item:'bed'}).ok,true);assert.equal(s.money,55);assert.equal(s.home.furniture[0],'bed');assert.equal(applyAction(s,{type:'seed'}).ok,true);assert.equal(s.money,50);
 for(let i=0;i<10;i++)applyAction(s,{type:'seed'});assert.equal(s.money,0);assert.equal(applyAction(s,{type:'buy',item:'chair'}).ok,false);
});
test('8 distinct plot slots, valid sanitization',()=>{
 assert.equal(lots.length,8);assert.equal(new Set(lots.map(l=>l.slot)).size,8);
 const s=sanitizeState({money:-500,home:{furniture:['bed','EXPLOIT'],plots:[{crop:'tomato',plantedAt:100,watered:true}]}});
 assert.equal(s.money,0);assert.deepEqual(s.home.furniture,['bed']);assert.equal(s.home.plots.length,10);
});

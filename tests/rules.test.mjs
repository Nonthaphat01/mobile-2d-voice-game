import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starter,applyAction,lots,PLOT_COUNT,GROW_MS,sanitizeState,HOME_GRID} from '../shared/rules.js';

test('starter home: 100 baht, empty home, ten plots, starter tools',()=>{
 const s=starter('นนท์');
 assert.equal(s.money,100);assert.deepEqual(s.home.furniture,[]);
 assert.equal(Object.keys(s.inventory.furniture).length,27);
 assert.ok(Object.values(s.inventory.furniture).every(count=>count===0));
 assert.equal(s.home.plots.length,PLOT_COUNT);assert.equal(s.inventory.hoe,1);assert.equal(s.inventory.tomato_seed,3);
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
test('buying furniture only changes inventory and protects funds',()=>{
 const s=starter();
 assert.equal(applyAction(s,{type:'buy',item:'bed'}).ok,true);
 assert.equal(s.money,55);assert.deepEqual(s.home.furniture,[]);assert.equal(s.inventory.furniture.bed,1);
 assert.equal(applyAction(s,{type:'buy',item:'chair'}).ok,true);
 assert.equal(s.money,30);assert.equal(s.inventory.furniture.chair,1);
});
test('build mode places, rotates, moves and removes without losing ownership',()=>{
 const s=starter();applyAction(s,{type:'buy',item:'bed'});applyAction(s,{type:'buy',item:'chair'});
 const bed={id:'bed-1',item:'bed',col:0,row:0,rotation:0};
 assert.equal(applyAction(s,{type:'placeFurniture',...bed}).ok,true);
 assert.equal(s.inventory.furniture.bed,0);assert.equal(s.home.furniture.length,1);
 assert.equal(applyAction(s,{type:'placeFurniture',id:'chair-1',item:'chair',col:2,row:0,rotation:0}).ok,true);
 assert.equal(applyAction(s,{type:'moveFurniture',id:'chair-1',col:3,row:0}).ok,true);
 assert.equal(applyAction(s,{type:'rotateFurniture',id:'bed-1'}).ok,true);
 assert.equal(applyAction(s,{type:'moveFurniture',id:'chair-1',col:0,row:0}).ok,false);
 assert.equal(applyAction(s,{type:'removeFurniture',id:'chair-1'}).ok,true);
 assert.equal(s.inventory.furniture.chair,1);assert.equal(s.home.furniture.length,1);
});
test('save draft keeps total ownership and rejects overlap/out-of-bounds',()=>{
 const s=starter();applyAction(s,{type:'buy',item:'bed'});applyAction(s,{type:'buy',item:'chair'});
 const draft=[{id:'bed-1',type:'bed',col:HOME_GRID.cols-2,row:HOME_GRID.rows-1,rotation:0}];
 assert.equal(applyAction(s,{type:'saveHome',furniture:draft,inventoryFurniture:{bed:0,chair:1}}).ok,true);
 assert.equal(s.home.furniture[0].col,HOME_GRID.cols-2);
 const bad=[{id:'a',type:'chair',col:0,row:0,rotation:0},{id:'b',type:'chair',col:0,row:0,rotation:0}];
 assert.equal(applyAction(s,{type:'saveHome',furniture:bad,inventoryFurniture:{bed:0,chair:0}}).ok,false);
 assert.equal(s.inventory.furniture.chair,1);
});
test('legacy saves migrate placed furniture and keep invalid state safe',()=>{
 const s=sanitizeState({money:-500,home:{furniture:['bed','chair','EXPLOIT'],plots:[{crop:'tomato',plantedAt:100,watered:true}]}});
 assert.equal(s.money,0);assert.equal(s.home.furniture.length,2);
 assert.deepEqual(s.home.furniture.map(item=>item.type),['bed','chair']);
 assert.equal(s.home.furniture[0].col>=0,true);assert.equal(s.home.furniture[0].row>=0,true);
 assert.equal(s.home.plots.length,PLOT_COUNT);
});
test('8 distinct outdoor lots remain unchanged',()=>{
 assert.equal(lots.length,8);assert.equal(new Set(lots.map(l=>l.slot)).size,8);
});

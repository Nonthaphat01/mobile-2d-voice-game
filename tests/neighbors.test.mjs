import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {applyAction, sanitizeState, starter} from '../shared/rules.js';
import {groupListings, messagePair, playerCard} from '../shared/social.js';
import {CROPS, EXPANSION_PRICES, workersOf} from '../shared/estate.js';
import {trade} from '../shared/market-trade.js';

test('seller identity groups listings and keeps sellers with the same name separate',()=>{
 const items=[{id:'first',sellerKey:'seller_1',name:'A',own:false},
   {id:'second',sellerKey:'seller_1',name:'A',own:false},
   {id:'third',sellerKey:'seller_2',name:'A',own:false},
   {id:'mine',sellerKey:'me',name:'A',own:true}];
 assert.deepEqual(groupListings(items).map(group=>[group.id,group.items.length]),[['own',1],['seller_1',2],['seller_2',1]]);
});

test('conversation path is stable across participants and rejects invalid paths',()=>{
 assert.equal(messagePair('Bob','Ada'),messagePair('Ada','Bob'));
 assert.throws(()=>messagePair('Ada','Ada'));
 assert.throws(()=>messagePair('Ada','../Bob'));
 assert.equal(playerCard({uid:'Ada',name:'Ada',level:3,money:123,playSeconds:30}).playSeconds,30);
 assert.equal(playerCard({uid:'Bob'}).playSeconds,null);
});

test('all five expansions preserve existing plants and unlock more furniture and plots',()=>{
 const s=starter();s.money=2000000;
 applyAction(s,{type:'plant',plot:0},100);
 const planted={...s.home.plots[0]};
 assert.equal(applyAction(s,{type:'expandEstate',level:1}).ok,false);
 for(const [level,price] of EXPANSION_PRICES.entries()){
   const money=s.money;
   assert.equal(applyAction(s,{type:'expandEstate',level}).ok,true);
   assert.equal(s.money,money-price);
   assert.equal(s.home.plots.length,10*2**(level+1));
   assert.deepEqual(s.home.plots[0],planted);
 }
 assert.equal(applyAction(s,{type:'expandEstate',level:5}).ok,false);
 applyAction(s,{type:'buy',item:'chair'});
 assert.equal(applyAction(s,{type:'placeFurniture',id:'far',item:'chair',col:21,row:10}).ok,true);
 assert.equal(sanitizeState(JSON.parse(JSON.stringify(s))).home.furniture[0].col,21);
});

test('new crops keep their identity through harvest, reload, partial sale and cancellation',()=>{
 const seller=starter('Seller'), buyer=starter('Buyer');buyer.money=100000;seller.money=100000;
 for(const [i,crop] of ['banana','rice','watermelon'].entries()){
   assert.equal(applyAction(seller,{type:'seed',crop,quantity:10}).ok,true);
   assert.equal(applyAction(seller,{type:'plant',crop,plot:i},1000).ok,true);
   applyAction(seller,{type:'water',plot:i},1000);
   assert.equal(applyAction(seller,{type:'harvest',plot:i},1000+CROPS[crop].grow,()=>.1).ok,true);
 }
 const root={profiles:{seller:sanitizeState(seller),buyer}},id='0'.repeat(36);
 assert.equal(trade(root,'seller',{type:'list',id,crop:'banana',key:100,quantity:3},1000).ok,true);
 assert.equal(trade(root,'buyer',{type:'buy',id,quantity:100},1001).ok,false);
 assert.equal(trade(root,'buyer',{type:'buy',id,quantity:1},1001).ok,true);
 assert.equal(root.marketListings[id].quantity,2);
 assert.equal(root.profiles.buyer.inventory.crops.banana.tomato,1);
 assert.equal(trade(root,'seller',{type:'cancel',id},1002).ok,true);
 assert.equal(root.profiles.seller.inventory.crops.banana.tomato,2);
 assert.equal(root.profiles.seller.inventory.crops.rice.tomato,3);
});

test('five independent gardeners can tend and store other crops through offline catch-up',()=>{
 const s=starter();s.money=1000;s.inventory.tomato_seed=0;s.inventory.rice_seed=10;
 for(let i=0;i<5;i++)assert.equal(applyAction(s,{type:'hireGardener',slot:0,plan:'short'},1000).ok,true);
 assert.equal(applyAction(s,{type:'hireGardener',slot:0,plan:'short'},1000).ok,false);
 const saved=sanitizeState(s);
 assert.equal(workersOf(saved.home).length,5);
 assert.equal(applyAction(saved,{type:'gardenerResume',slot:0},601000,()=>.1).ok,true);
 assert.equal(workersOf(saved.home).length,0);
 assert.equal(saved.home.gardenBox.crops.rice.tomato,30);
 assert.equal(applyAction(saved,{type:'collectGardenBox'}).ok,true);
 assert.equal(saved.inventory.crops.rice.tomato,30);
 assert.equal(saved.money,500);
});

test('new display furniture survives a full save and Apps Script trade',()=>{
 const state=starter('Owner');
 assert.equal(applyAction(state,{type:'buy',item:'bookshelf'}).ok,true);
 assert.equal(applyAction(state,{type:'placeFurniture',item:'bookshelf',id:'shelf',col:3,row:1}).ok,true);
 state.inventory.tomato=3;state.inventory.tomatoGrades={100:3};
 state.home.gardenBox={tomato:9,tomatoGrades:{150:9}};
 state.playSeconds=1235;
 const script=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
 const app=runInNewContext(script+'\n;({marketOperation_,sanitizeState})');
 const view=JSON.parse(JSON.stringify(app.sanitizeState(state)));
 assert.deepEqual(view,sanitizeState(state));
 const uid='seller',room='001',slot=0;
 const root={rooms:{[room]:{slots:[{uid,x:1200,y:650,scene:'outside'}]}},profiles:{[uid]:state}};
 const db={read:()=>({root,etag:'version'}),put:()=>true};
 const id='f'.repeat(36);
 assert.equal(app.marketOperation_(db,uid,{type:'list',room,slot,id,key:100,quantity:2},100).ok,true);
 const market=app.marketOperation_(db,uid,{type:'browse',room,slot,marketSchema:3},100);
 assert.equal(market.marketSchema,3);
 assert.equal(market.listings[0].sellerKey,uid);
 assert.equal(market.profile.home.furniture[0].type,'bookshelf');
 assert.equal(market.profile.home.gardenBox.tomato,9);
 assert.equal(market.profile.playSeconds,1235);
});

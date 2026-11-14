import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {applyAction, sanitizeState, starter} from '../shared/rules.js';
import {groupListings, messagePair, playerCard} from '../shared/social.js';

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
 const market=app.marketOperation_(db,uid,{type:'browse',room,slot},100);
 assert.equal(market.marketSchema,2);
 assert.equal(market.listings[0].sellerKey,uid);
 assert.equal(market.profile.home.furniture[0].type,'bookshelf');
 assert.equal(market.profile.home.gardenBox.tomato,9);
 assert.equal(market.profile.playSeconds,1235);
});

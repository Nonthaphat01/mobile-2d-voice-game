import {test} from 'node:test';
import assert from 'node:assert/strict';
import {firestoreMarket,MARKET_PATH} from '../firestore-market.js';
import {starter} from '../shared/rules.js';

// Lightweight Firestore interface double to check document paths and grouped writes.
function database(){
  const rows=new Map();
  const commits=[];
  const ref=path=>({
    path,
    id:path.split('/').at(-1),
    collection:name=>ref(path+'/'+name),
    doc:name=>ref(path+'/'+name),
    get:async()=>path.split('/').length%2===0?snapshot(path):{
      docs:[...rows.keys()].filter(key=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(snapshot)
    }
  });
  const snapshot=path=>({...ref(path),exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
  let queue=Promise.resolve();
  return {rows,commits,doc:ref,runTransaction:fn=>{
    const result=queue.then(async()=>{
      const writes=[];
      const value=await fn({
        get:r=>r.get(),
        create:(r,data)=>{assert.equal(rows.has(r.path),false);writes.push([r.path,data])},
        set:(r,data)=>writes.push([r.path,data]),
        delete:r=>writes.push([r.path,undefined])
      });
      for(const [path,data] of writes){
        if(data===undefined)rows.delete(path);
        else rows.set(path,structuredClone(data));
      }
      commits.push(writes.map(([path])=>path));
      return value;
    });
    queue=result.catch(()=>{});
    return result;
  }};
}

test('initial load preserves old save and subsequent loads use Firestore',async()=>{
  const db=database();
  let reads=0;
  const market=firestoreMarket(db,async()=>{reads++;return {...starter('เดิม'),money:630}});
  assert.equal((await market.load('member','ใหม่')).money,630);
  await market.action('member',profile=>{profile.money+=7;return {ok:true}});
  assert.equal((await market.load('member','ใหม่')).money,637);
  assert.equal(reads,1);
  assert.equal(db.rows.get(MARKET_PATH+'/profiles/member').displayName,'เดิม');
});

test('listing is in HOODGAME and purchase writes both profiles and listing together',async()=>{
  const db=database();
  const old=starter('เจ้าของ');
  old.inventory.tomato=2;
  old.inventory.tomatoGrades={500:2};
  const market=firestoreMarket(db,async uid=>uid==='seller'?old:null);
  for(const uid of ['seller','buyer','another'])await market.load(uid,uid);
  const id='0'.repeat(36);
  assert.equal((await market.transact('seller',{type:'list',id,key:500,quantity:2},0)).ok,true);
  const listing=MARKET_PATH+'/listings/'+id;
  assert.equal(db.rows.get(listing).unitPrice,35);
  assert.deepEqual((await market.browse('buyer',1000)).listings,[{id,own:false,name:'เจ้าของ',sellerKey:'seller',key:500,quantity:2,unitPrice:35,expired:false}]);
  const results=await Promise.all(['buyer','another'].map(uid=>market.transact(uid,{type:'buy',id},600000)));
  assert.equal(results.filter(x=>x.ok).length,1);
  assert.equal(db.rows.has(listing),false);
  assert.equal((await market.load('seller')).money,170);
  assert.equal((await market.load('buyer')).inventory.tomato,2);
  assert.deepEqual(db.commits.find(paths=>paths.length===3),[MARKET_PATH+'/profiles/buyer',listing,MARKET_PATH+'/profiles/seller']);
});

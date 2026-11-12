import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateRemoteMotion,sampleRemoteMotion} from '../shared/remote-motion.js';

const player=(x,y=40,scene='outside',pose='stand')=>({x,y,scene,pose});

test('remote avatar crosses the gap between two network updates and stops at the last position',()=>{
  let motion=updateRemoteMotion(null,player(0),0);
  motion=updateRemoteMotion(motion,player(20,50),100);
  motion=updateRemoteMotion(motion,player(40,60),200);
  assert.deepEqual(sampleRemoteMotion(motion,210),{x:10,y:45,walking:true});
  assert.deepEqual(sampleRemoteMotion(motion,235),{x:15,y:47.5,walking:true});
  assert.deepEqual(sampleRemoteMotion(motion,410),{x:40,y:60,walking:false});
  assert.equal(updateRemoteMotion(motion,player(40,60),450),motion);
});

test('new movement after standing still blends from the last visible position',()=>{
  let motion=updateRemoteMotion(null,player(20),0);
  motion=updateRemoteMotion(motion,player(40),1000);
  assert.deepEqual(sampleRemoteMotion(motion,1020),{x:20,y:40,walking:false});
  assert.deepEqual(sampleRemoteMotion(motion,1110),{x:30,y:40,walking:true});
});

test('uneven packet arrivals still advance on every rendered frame during steady movement',()=>{
  const arrivals=[0,124,201,333,410,522,604,733,800];
  let motion,received=0,lastX=-1;
  for(let frame=0;frame<=800;frame+=16){
    while(received<arrivals.length&&arrivals[received]<=frame){
      motion=updateRemoteMotion(motion,player(received*17),arrivals[received]);
      received++;
    }
    const {x,walking}=sampleRemoteMotion(motion,frame);
    if(frame>160){assert.ok(x>lastX);assert.equal(walking,true)}
    lastX=x;
  }
});

test('scene changes, pose changes and large jumps reset the movement buffer',()=>{
  let motion=updateRemoteMotion(null,player(20),0);
  motion=updateRemoteMotion(motion,player(330,300,'inside'),20);
  assert.deepEqual(sampleRemoteMotion(motion,20),{x:330,y:300,walking:false});
  motion=updateRemoteMotion(motion,player(330,305,'inside','sit'),30);
  assert.deepEqual(sampleRemoteMotion(motion,30),{x:330,y:305,walking:false});
  motion=updateRemoteMotion(motion,player(1100,300,'inside','sit'),40);
  assert.deepEqual(sampleRemoteMotion(motion,40),{x:1100,y:300,walking:false});
});

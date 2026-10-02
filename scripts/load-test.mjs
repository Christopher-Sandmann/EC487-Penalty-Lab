/** Algorithm stress test only: no cloud sign-ins, no generated classroom records. */
import {Engine} from '../build/lib/engine.js';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const sizes=[31,60,100],output=[];
for(const n of sizes){let now=Date.now();const e=new Engine(()=>now);e.create('host','LOAD',true);for(let i=0;i<n;i++)e.join('u'+i,'LOAD','Load '+i,i%2?'macro':'micro');
 const start=performance.now();e.host('host','LOAD','start');
 for(let iteration=0;iteration<500&&!e.store.players.every(p=>p.kicks===6&&p.keeps===6);iteration++){
  now+=6000;for(const p of e.store.players){p.lastSeen=now;if(p.pendingResult){e.seen(p.uid,p.pendingResult);p.feedbackSince=now-5000;e.ready(p.uid,'LOAD');}}
  e.tick();now+=2500;for(const p of e.store.players)p.lastSeen=now;
  for(const m of e.store.matches.filter(m=>m.status==='briefing')){for(const id of [m.kicker,m.keeper])e.prepare(e.store.players.find(p=>p.id===id).uid,m.id);}
  for(const m of e.store.matches.filter(m=>m.status==='locked'))for(const id of [m.kicker,m.keeper])e.submit(e.store.players.find(p=>p.id===id).uid,m.id,id===m.kicker?'micro':'macro',crypto.randomUUID());
 }
 assert.ok(e.store.players.every(p=>p.kicks===6&&p.keeps===6),`${n}-player roster did not finish`);assert.equal(e.store.drawCount,n*6);assert.equal(e.store.matches.length,n*6);
 output.push({players:n,validPenalties:e.store.drawCount,allSixPlusSix:true,algorithmMs:Math.round(performance.now()-start)});
}
console.log(JSON.stringify({localAlgorithmOnly:true,networkOrCloudCapacityClaim:false,results:output},null,2));

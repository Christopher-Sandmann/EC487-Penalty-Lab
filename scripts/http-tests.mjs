import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'penalty-http-test-')),state=path.join(dir,'state.json'),host='test-only-host-'+crypto.randomUUID();
const proc=spawn(process.execPath,['scripts/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',PENALTY_STATE_FILE:state,PENALTY_LOCAL_HOST_TOKEN:host},stdio:['ignore','pipe','pipe']});
let output='';const base=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Server startup timed out')),5000);proc.stdout.on('data',b=>{output+=b;const m=output.match(/Address: (http:\/\/[^\s]+)/);if(m){clearTimeout(t);resolve(m[1]);}});proc.stderr.on('data',b=>{output+=b;});proc.on('exit',code=>reject(new Error('Server failed '+code+' '+output)));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(action,token,args={},instructor=false){const r=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(instructor?{'X-Local-Host-Token':host}:{})},body:JSON.stringify(args)});return {status:r.status,data:await r.json()};}
const check=[];const pass=label=>{check.push(label);console.log('PASS '+label);};
try{
 const tokens=await Promise.all(Array.from({length:3},()=>request('session').then(x=>x.data.token)));
 const [t1,t2,t3]=tokens;const room='WIRE';
 assert.equal((await request('host/create',t1,{code:room})).status,403);pass('room code and ordinary session cannot create or control rooms');
 assert.equal((await request('host/create',t1,{code:room,value:true},true)).status,200);
 let a=(await request('join',t1,{code:room,username:'Human A',preference:'micro'})).data;
 let b=(await request('join',t2,{code:room,username:'Human B',preference:'macro'})).data;
 assert.equal(a.me.kicks,0);assert.equal(b.match,null);
 const retry=(await request('join',t1,{code:room,username:'Forged',preference:'macro'})).data;assert.equal(retry.me.id,a.me.id);assert.equal(retry.me.preference,'micro');pass('registration retries preserve one identity and one immutable preference');
 assert.equal((await request('snapshot',t3,{code:room})).status,403);
 for(const endpoint of ['score','submissions','resolve','change-profile'])assert.equal((await request(endpoint,t1,{code:room,score:999})).status,404);pass('direct unauthorized read/write endpoints reject attempts');
 await request('host',t1,{code:room,action:'start'},true);
 for(let i=0;i<100;i++){a=(await request('snapshot',t1,{code:room})).data;if(a.match)break;await request('heartbeat',t1,{code:room});await request('heartbeat',t2,{code:room});await wait(150);}
 assert.ok(a.match,'Role-feasible players should match immediately');b=(await request('snapshot',t2,{code:room})).data;assert.equal(a.match.id,b.match.id);assert.equal(a.match.kicker,b.match.kicker);
 assert.equal(a.match.status,'briefing');assert.equal(a.match.choiceStartsAt,null);
 const mid=a.match.id;const tokenK=a.match.kicker===a.me.id?t1:t2,tokenG=tokenK===t1?t2:t1;
 assert.equal((await request('submit',tokenK,{match:mid,choice:'micro',requestId:crypto.randomUUID()})).status,400);
 await wait(2500);await request('prepare',tokenK,{match:mid});assert.equal((await request('snapshot',tokenG,{code:room})).data.match.status,'briefing');await request('prepare',tokenG,{match:mid});const chosen=(await request('snapshot',tokenK,{code:room})).data.match;assert.equal(chosen.status,'locked');assert.equal(chosen.deadline-chosen.choiceStartsAt,12000);pass('both probability reminders must be acknowledged before the private twelve-second clock begins');
 const first=await request('submit',tokenK,{code:room,match:mid,choice:'micro',requestId:crypto.randomUUID()});assert.equal(first.status,200);
 const hidden=(await request('snapshot',tokenG,{code:room})).data.match;assert.equal(hidden.result,null);assert.equal(hidden.ownChoice,null);assert.equal(hidden.kickerReady,true);
 const statBefore=(await request('statistics',tokenG,{code:room})).data;assert.equal(statBefore.matches[0].result,null);assert.ok(!JSON.stringify(statBefore).includes('kickerChoice'));pass('opponent direction stays inaccessible in snapshot and statistics until both commit');
 const concurrent=await Promise.all(Array.from({length:60},(_,i)=>request('submit',i%2?tokenK:tokenG,{code:room,match:mid,choice:i%2?'micro':'macro',requestId:crypto.randomUUID()})));
 assert.ok(concurrent.every(x=>x.status===200));a=(await request('snapshot',t1,{code:room})).data;b=(await request('snapshot',t2,{code:room})).data;assert.deepEqual(a.match.result,b.match.result);assert.equal(a.me.kicks+a.me.keeps,1);assert.equal(b.me.kicks+b.me.keeps,1);
 await wait(250);let stored=JSON.parse(await fs.readFile(state,'utf8'));assert.equal(stored.store.drawCount,1);assert.equal(stored.store.matches.filter(m=>m.status==='resolved').length,1);pass('60 simultaneous retries release one result, make one draw, increment each participant once');
 assert.equal((await request('submit',tokenK,{match:mid,choice:'macro',requestId:crypto.randomUUID()})).status,400);pass('first choice remains immutable after reveal');
 assert.equal((await request('ready',t1,{code:room})).status,400);await request('seen',t1,{match:mid});await request('seen',t2,{match:mid});assert.equal((await request('ready',t1,{code:room})).status,400);pass('reading interval cannot be bypassed by calling the API');
 const recovered=(await request('snapshot',t1,{code:room})).data;assert.equal(recovered.me.pendingResult,mid);assert.deepEqual(recovered.match.result,a.match.result);pass('independent repeat requests recover pending feedback and the same result');
 assert.equal((await request('export',t1,{code:room})).status,403);const csv=(await request('export',t1,{code:room},true)).data.csv;assert.ok(csv.includes('kicker_preference'));assert.ok(csv.includes('resolved'));pass('audit export is host-only and includes roles, labels, probabilities and timing');
 await wait(5050);await Promise.all([request('ready',t1,{code:room}),request('ready',t2,{code:room})]);
 // Add a third independent human session; the test supplies no automated live bot.
 await request('join',t3,{code:room,username:'Human C',preference:'micro'});
 for(let i=0;i<100;i++){await Promise.all(tokens.map(t=>request('heartbeat',t,{code:room})));stored=JSON.parse(await fs.readFile(state,'utf8'));const next=stored.store.matches.find(m=>m.status==='briefing');if(next){
  const snap=await Promise.all(tokens.map(t=>request('snapshot',t,{code:room})));const responsive=snap.findIndex(x=>x.data.match?.id===next.id);await wait(2500);await Promise.all(snap.map((x,i)=>x.data.match?.id===next.id?request('prepare',tokens[i],{match:next.id}):Promise.resolve()));await request('submit',tokens[responsive],{match:next.id,choice:'micro',requestId:crypto.randomUUID()});
  await wait(12250);const stats=(await request('statistics',t1,{code:room})).data;const cancelled=stats.matches.find(m=>m.id===next.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.result,null);const st=JSON.parse(await fs.readFile(state,'utf8'));assert.equal(st.store.drawCount,1);assert.equal(st.store.players.reduce((s,p)=>s+p.kicks+p.keeps,0),2);pass('server clock cancels a silent opponent without a draw or progress, independently of client polling');break;
 }await wait(150);}
 if(!check.some(x=>x.startsWith('server clock')))throw new Error('Timeout test did not reach a locked match');
 console.log(JSON.stringify({transport:'local HTTP',tests:check.length,passed:true,cloud_tested:false}));
}finally{proc.kill('SIGTERM');await wait(150);await fs.rm(dir,{recursive:true,force:true});}

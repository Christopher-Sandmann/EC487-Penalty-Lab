/** EXTERNAL CHECK: not run at handoff. Uses only explicitly supplied TEST identities.
 * Never put these access tokens in a frontend configuration or a public report. */
import assert from 'node:assert/strict';
import {randomUUID, randomBytes} from 'node:crypto';
const env=process.env;
if(env.PENALTY_ALLOW_TEST_ROOM!=='true')throw new Error('Set PENALTY_ALLOW_TEST_ROOM=true to authorize creation of an isolated test room.');
const required=['PENALTY_SUPABASE_URL','PENALTY_SUPABASE_PUBLISHABLE_KEY','PENALTY_HOST_ACCESS_TOKEN','PENALTY_TEST_TOKEN_A','PENALTY_TEST_TOKEN_B','PENALTY_TEST_TOKEN_C'];
for(const name of required)if(!env[name])throw new Error(`Missing ${name}`);
const base=new URL(env.PENALTY_SUPABASE_URL);if(base.protocol!=='https:')throw new Error('Use an HTTPS Supabase project.');
const key=env.PENALTY_SUPABASE_PUBLISHABLE_KEY,H=env.PENALTY_HOST_ACCESS_TOKEN,A=env.PENALTY_TEST_TOKEN_A,B=env.PENALTY_TEST_TOKEN_B,C=env.PENALTY_TEST_TOKEN_C;
if(key.startsWith('sb_secret_'))throw new Error('Supply the public publishable key, not a secret key.');
function uid(jwt){const p=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));assert.ok(p.sub&&p.exp*1000>Date.now()+90000,'Use fresh test JWTs with at least 90 seconds remaining.');return p.sub;}
assert.equal(new Set([H,A,B,C].map(uid)).size,4,'Host and all three test identities must be distinct.');
const code='T'+randomBytes(4).toString('hex').slice(0,7).toUpperCase(),passed=[];let created=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(name,token,body={}){const response=await fetch(new URL('/rest/v1/rpc/'+name,base),{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});let data;try{data=await response.json();}catch{data=null;}return {ok:response.ok,status:response.status,data};}
async function yes(name,token,body){const r=await rpc(name,token,body);assert.ok(r.ok,`${name} failed (${r.status}); inspect the private project logs, without publishing tokens.`);return r.data;}
async function no(name,token,body){const r=await rpc(name,token,body);assert.ok(!r.ok,`Unauthorized ${name} unexpectedly succeeded.`);}
const pass=name=>{passed.push(name);console.log('PASS '+name);};
try{
 await no('host_create_room',A,{p_code:code,p_practice:true});await no('host_create_room',null,{p_code:code,p_practice:true});pass('student and unauthenticated requests cannot create a room');
 const room=await yes('host_create_room',H,{p_code:code,p_practice:true});created=true;assert.equal(room.practice,true);
 const join=(token,name,pref)=>yes('join_room',token,{p_code:code,p_username:name,p_preference:pref});
 const a=await join(A,'Cloud Test A','micro'),b=await join(B,'Cloud Test B','macro');
 const retry=await join(A,'Changed alias','macro');assert.equal(a.me.id,retry.me.id);assert.equal(retry.me.preference,'micro');pass('registration is idempotent and preferences are immutable');
 await no('room_snapshot',C,{p_code:code});await no('room_statistics',C,{p_code:code});await no('host_room_action',A,{p_code:code,p_action:'start'});await no('host_export',A,{p_code:code});pass('outsider reads and student host/export escalation are rejected');
 for(const table of ['submissions','participants','matches']){const r=await fetch(new URL('/rest/v1/'+table+'?select=*',base),{headers:{apikey:key,Authorization:'Bearer '+A,'Accept-Profile':'penalty_private'},signal:AbortSignal.timeout(10000)});assert.ok(!r.ok,`Private ${table} unexpectedly exposed.`);}pass('private tables are not exposed through the Data API');
 await yes('host_room_action',H,{p_code:code,p_action:'start'});
 let sa;const until=Date.now()+16000;
 while(Date.now()<until){await Promise.all([A,B].map(token=>yes('player_heartbeat',token,{p_code:code})));sa=await yes('room_snapshot',A,{p_code:code});if(sa.match)break;await pause(250);}
 assert.ok(sa?.match?.status==='briefing','No feasible match appeared. Check Cron and SQL logs.');
 const sb=await yes('room_snapshot',B,{p_code:code}),mid=sa.match.id;assert.equal(mid,sb.match.id);
 await pause(2600);await Promise.all([A,B].map(token=>yes('prepare_match',token,{p_match:mid})));
 const K=sa.match.kicker===sa.me.id?A:B,G=K===A?B:A;
 const submit=(token,choice)=>yes('submit_choice',token,{p_match:mid,p_choice:choice,p_request_id:randomUUID()});
 await submit(K,'micro');const before=await yes('room_snapshot',G,{p_code:code});assert.equal(before.match.result,null);assert.equal(before.match.ownChoice,null);assert.equal(before.match.kickerReady,true);
 const stats=await yes('room_statistics',G,{p_code:code});assert.equal(stats.matches.find(m=>m.id===mid).result,null);assert.ok(!JSON.stringify(stats).includes('kickerChoice'));pass('locked opponent choice is absent from snapshots and aggregates');
 const submissions=await Promise.all(Array.from({length:20},(_,i)=>submit(i%2?K:G,i%2?'micro':'macro')));assert.ok(submissions.every(r=>r.ok===true));
 const [afterA,afterB]=await Promise.all([A,B].map(token=>yes('room_snapshot',token,{p_code:code})));assert.deepEqual(afterA.match.result,afterB.match.result);assert.equal(afterA.me.kicks+afterA.me.keeps,1);assert.equal(afterB.me.kicks+afterB.me.keeps,1);
 const audit=await yes('host_export',H,{p_code:code});const rows=audit.filter(r=>r.record_type==='penalty-attempt'&&r.match_id===mid);assert.equal(rows.length,1);assert.equal(rows[0].status,'resolved');assert.equal(rows[0].draw_count,1);pass('concurrent submissions and retries produce one shared result and one committed draw');
 await no('submit_choice',K,{p_match:mid,p_choice:'macro',p_request_id:randomUUID()});await no('ready_player',A,{p_code:code});await yes('feedback_seen',A,{p_match:mid});await no('ready_player',A,{p_code:code});pass('immutable choices and the reading gate are enforced through direct RPCs');
 console.log(JSON.stringify({passed:passed.length,test_room:code,cloud_tested:true,limitations:['Not a native-device, campus-load, browser-storage or independent-Cron timeout test.','Run the manual three-human timeout, reconnect and full 12-penalty checks.']},null,2));
}finally{
 if(created){const ended=await rpc('host_room_action',H,{p_code:code,p_action:'end'});console.log(ended.ok?`Ended isolated test room ${code}; its audit data remains for review.`:`ATTENTION: ending test room ${code} failed. End it in the host UI or trusted SQL Editor.`);}
}

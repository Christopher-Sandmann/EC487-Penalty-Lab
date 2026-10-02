/** Disposable PostgreSQL integration test, run automatically by GitHub Actions.
 * Exercises the ACTUAL production SQL, not a reimplementation. auth.uid() and
 * auth.users are minimal test fixtures; Supabase Auth, Realtime and the Cron
 * scheduler still require the separate hosted-project rehearsal.
 * Never run against an existing Supabase project or a database with user data.
 */
import fs from 'node:fs';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
if(process.env.PENALTY_TEST_DATABASE!=='true'||!/^penalty_ci/.test(process.env.PGDATABASE??''))throw new Error('Use a DISPOSABLE, empty penalty_ci* database and set PENALTY_TEST_DATABASE=true.');
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'];
const sql=s=>execFileSync('psql',[...args,'-c',s],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const asyncSql=async s=>(await exec('psql',[...args,'-c',s],{encoding:'utf8',maxBuffer:16*1024*1024})).stdout.trim();
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
assert.equal(sql("select count(*) from pg_namespace where nspname in ('auth','penalty_private')"),'0','Database must be empty; nothing is automatically dropped.');
sql(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean not null);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const file of ['202610020101_game.sql','202610020103_live.sql','202610020104_classroom_indexes.sql'])sql(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const host=randomUUID(),outsider=randomUUID();
sql(`insert into auth.users values(${lit(host)},false),(${lit(outsider)},true);insert into penalty_private.hosts(uid) values(${lit(host)});`);
const request=(uid,name,params=[],role='authenticated')=>`begin;set local role ${role};set local "request.jwt.claim.sub"=${lit(uid)};select public.${name}(${params.map(lit).join(',')});commit;`;
const rpc=(uid,name,params=[])=>JSON.parse(sql(request(uid,name,params)));
const asyncRpc=async(uid,name,params=[])=>JSON.parse(await asyncSql(request(uid,name,params)));
const reject=(uid,name,params,role)=>assert.throws(()=>sql(request(uid,name,params,role)));
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
function identities(n){const users=Array.from({length:n},()=>randomUUID());if(users.length)sql('insert into auth.users values '+users.map(uid=>`(${lit(uid)},true)`).join(','));return users;}
function room(code,n=2,practice=true){rpc(host,'host_create_room',[code,String(practice)]);const users=identities(n),players=users.map((u,i)=>rpc(u,'join_room',[code,'Player '+i,i%2?'macro':'micro']).me);return {code,users,players};}
function actor(x,id){return x.players.find(p=>p.id===id).uid;}
function current(x,uid=x.users[0]){return rpc(uid,'room_snapshot',[x.code]);}
function prepare(x,m){sql(`update penalty_private.matches set locked_at=locked_at-interval '3 seconds' where id=${lit(m.id)}`);rpc(actor(x,m.kicker),'prepare_match',[m.id]);rpc(actor(x,m.keeper),'prepare_match',[m.id]);}
function close(x){rpc(host,'host_room_action',[x.code,'end']);}
reject(outsider,'host_create_room',['EVIL','true']);reject(outsider,'host_create_room',['EVIL','true'],'anon');pass('anonymous-key-only and student callers cannot create rooms');
const x=room('SQLTEST',2);rpc(host,'host_room_action',[x.code,'start']);const first=current(x),m=first.match;
assert.equal(m.status,'briefing');assert.deepEqual(new Set([m.kickerPlayer.username,m.keeperPlayer.username]),new Set(['Player 0','Player 1']));
reject(actor(x,m.kicker),'prepare_match',[m.id]);assert.equal(current(x).match.choiceStartsAt,null);pass('real usernames are released on pairing; briefing blocks early choices');
const again=rpc(x.users[0],'join_room',[x.code,'Different','macro']);assert.equal(again.me.id,x.players[0].id);assert.equal(again.me.preference,'micro');
reject(outsider,'join_room',[x.code,'player 0','micro']);reject(outsider,'room_statistics',[x.code]);reject(x.users[0],'host_export',[x.code]);reject(x.users[0],'host_room_action',[x.code,'start']);pass('idempotent join, unique aliases, immutable preference and host-only export');
for(const table of ['participants','matches','submissions','hosts'])assert.throws(()=>sql(`begin;set local role authenticated;select * from penalty_private.${table};commit;`));
assert.throws(()=>sql(`begin;set local role authenticated;select penalty_private.random_int(10000);commit;`));pass('private rows and privileged helpers are inaccessible to authenticated students');
prepare(x,m);const K=actor(x,m.kicker),G=actor(x,m.keeper);
rpc(K,'submit_choice',[m.id,'micro',randomUUID()]);const secret=current(x,G);
assert.equal(secret.match.ownChoice,null);assert.equal(secret.match.result,null);assert.equal(secret.match.kickerReady,true);
assert.ok(!JSON.stringify(rpc(G,'room_statistics',[x.code])).includes('kickerChoice'));
pass('the first submitted direction is hidden from opponent and all live statistics');
await Promise.all(Array.from({length:60},(_,i)=>asyncRpc(i%2?K:G,'submit_choice',[m.id,i%2?'micro':'macro',randomUUID()])));
const a=current(x,K),b=current(x,G);assert.deepEqual(a.match.result,b.match.result);assert.equal(a.me.kicks+a.me.keeps,1);assert.equal(b.me.kicks+b.me.keeps,1);
assert.equal(sql(`select draw_count from penalty_private.matches where id=${lit(m.id)}`),'1');
assert.equal(sql(`select count(*) from penalty_private.submissions where match_id=${lit(m.id)}`),'2');
assert.equal(a.history.length,1);reject(K,'submit_choice',[m.id,'macro',randomUUID()]);pass('60 concurrent submissions/retries: exactly one draw, one result and one appearance each');
const readRows=(uid,table)=>JSON.parse(sql(`begin;set local role authenticated;set local "request.jwt.claim.sub"=${lit(uid)};select coalesce(json_agg(t),'[]'::json) from public.${table} t;commit;`));
const own=readRows(K,'player_events');assert.equal(own.length,1);assert.equal(own[0].uid,K);
assert.equal(readRows(outsider,'player_events').length,0);assert.equal(readRows(outsider,'room_events').length,0);
assert.ok(!JSON.stringify(own).includes('choice'));pass('targeted Realtime signal rows obey owner RLS and contain no choices');
reject(K,'ready_player',[x.code]);rpc(K,'feedback_seen',[m.id]);reject(K,'ready_player',[x.code]);close(x);pass('feedback reading minimum is server enforced');
const t=room('TIMEOUT',3);rpc(host,'host_room_action',[t.code,'start']);const timed=rpc(host,'room_statistics',[t.code]).matches.find(m=>m.status==='briefing');prepare(t,timed);
const responsive=actor(t,timed.kicker),missing=actor(t,timed.keeper);rpc(responsive,'submit_choice',[timed.id,'micro',randomUUID()]);
sql(`update penalty_private.matches set deadline=clock_timestamp()-interval '1 millisecond' where id=${lit(timed.id)};select penalty_private.sweep();`);
assert.equal(current(t,missing).me.status,'away');assert.equal(current(t,missing).me.kicks+current(t,missing).me.keeps,0);
const next=current(t,responsive);assert.ok(next.match&&next.match.id!==timed.id);assert.ok(![next.match.kicker,next.match.keeper].includes(timed.keeper));
assert.equal(sql(`select draw_count from penalty_private.matches where id=${lit(timed.id)}`),'0');close(t);pass('independent sweep cancels late attempts without a draw and rematches the responsive player');
const teaching=room('HEALTH',0,false);sql('update penalty_private.runtime set clock_seen_at=null');reject(host,'host_room_action',[teaching.code,'start']);
sql('select penalty_private.sweep()');const health=rpc(host,'host_preflight',[teaching.code]);assert.equal(health.clockHealthy,true);assert.equal(health.apiVersion,3);rpc(host,'host_room_action',[teaching.code,'start']);close(teaching);pass('teaching start checks a fresh server clock; host preflight reports measured health');
// Fast-forward timestamps ONLY in this disposable test DB, not in shipped game config.
const roster=room('ODDROOM',15);rpc(host,'host_room_action',[roster.code,'start']);
const step=()=>{
 sql("update penalty_private.participants set last_seen=clock_timestamp();update penalty_private.matches set locked_at=least(locked_at,clock_timestamp()-interval '3 seconds') where status='briefing';update penalty_private.participants set feedback_since=clock_timestamp()-interval '6 seconds' where pending_result is not null;");
 const data=rpc(host,'room_statistics',[roster.code]);let statements=[];
 for(const p of data.players)if(p.status==='feedback')statements.push(request(actor(roster,p.id),'ready_player',[roster.code]));
 if(statements.length)sql(statements.join('\n'));
 const matches=rpc(host,'room_statistics',[roster.code]).matches.filter(m=>m.status==='briefing');
 sql("update penalty_private.matches set locked_at=least(locked_at,clock_timestamp()-interval '3 seconds') where status='briefing'");
 statements=[];for(const match of matches){const k=actor(roster,match.kicker),g=actor(roster,match.keeper);for(const uid of [k,g])statements.push(request(uid,'prepare_match',[match.id]));for(const [uid,choice]of[[k,'micro'],[g,'macro']])statements.push(request(uid,'submit_choice',[match.id,choice,randomUUID()]));}
 if(statements.length)sql(statements.join('\n'));
};
for(let i=0;i<100;i++){step();if(rpc(host,'room_statistics',[roster.code]).players.every(p=>p.kicks===6&&p.keeps===6))break;}
const completed=rpc(host,'room_statistics',[roster.code]);assert.ok(completed.players.every(p=>p.kicks===6&&p.keeps===6));assert.equal(completed.matches.filter(m=>m.status==='resolved').length,90);assert.ok(completed.matches.every(m=>m.kicker!==m.keeper));
close(roster);pass('15-player asynchronous odd roster completes six kicks and six keeps per player');
console.log(JSON.stringify({passed,engine:'Actual PostgreSQL SQL/RLS; test auth fixture',hostedSupabaseTested:false,cronSchedulerTested:false},null,2));

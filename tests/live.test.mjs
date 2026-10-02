import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicConfig} from '../scripts/public-config.mjs';
import {countdownCue} from '../build/lib/effects.js';
import {Engine} from '../build/lib/engine.js';
test('a live build cannot silently become practice when the keys are missing',()=>{assert.throws(()=>publicConfig({PENALTY_MODE:'supabase'}),/Live deployment needs/);assert.equal(publicConfig({}, {mode:'supabase'},undefined,true).mode,'supabase');});
test('only public Supabase keys can enter a live build',()=>{
 const env={PENALTY_MODE:'supabase',PENALTY_SUPABASE_URL:'https://project.supabase.co'};
 for(const key of ['sb_secret_abc','sbp_management_token','password',`a.${Buffer.from('{"role":"service_role"}').toString('base64url')}.c`])assert.throws(()=>publicConfig({...env,PENALTY_SUPABASE_PUBLISHABLE_KEY:key}));
 assert.equal(publicConfig({...env,PENALTY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}).mode,'supabase');
 assert.equal(publicConfig({...env,PENALTY_SUPABASE_PUBLISHABLE_KEY:`a.${Buffer.from('{"role":"anon"}').toString('base64url')}.c`}).mode,'supabase');
});
test('configuration strips credentials from isolated practice and validates live origins',()=>{
 assert.equal(publicConfig({PENALTY_SUPABASE_PUBLISHABLE_KEY:'sb_secret_should_not_be_used'}, {},'practice').supabaseKey,'');
 for(const url of ['http://x.supabase.co','https://name:pass@x.supabase.co','https://x.supabase.co/path','https://x.supabase.co/?secret=x'])assert.throws(()=>publicConfig({PENALTY_MODE:'supabase',PENALTY_SUPABASE_URL:url,PENALTY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}));
});
test('all twelve countdown seconds have a cue, only the final three are urgent',()=>{for(let i=1;i<=12;i++)assert.equal(countdownCue(i),i<=3?'urgent':'tick');for(const x of [-1,0,13,1.1,NaN])assert.equal(countdownCue(x),null);});
test('human match views contain the real usernames, never the simulated label',()=>{
 const e=new Engine();e.create('host','NAME');e.join('a','NAME','Micro Alice','micro');e.join('b','NAME','Macro Bob','macro');e.host('host','NAME','start');
 const a=e.snapshot('a','NAME'),b=e.snapshot('b','NAME');assert.equal(a.match.id,b.match.id);
 assert.deepEqual(new Set([a.match.kickerPlayer.username,a.match.keeperPlayer.username]),new Set(['Micro Alice','Macro Bob']));assert.ok(!JSON.stringify(a).includes('Practice partner'));
 assert.deepEqual(a.history,[]);assert.deepEqual(b.history,[]);
});
test('v3 patch preserves the payoff technology and adds least-privilege private signals',()=>{
 const s=fs.readFileSync(new URL('../supabase/migrations/202610020103_live.sql',import.meta.url),'utf8');
 assert.ok(s.includes('using(uid=auth.uid())'));assert.ok(s.includes('grant select on public.player_events to authenticated'));
 assert.ok(s.includes("h.status='resolved' and p.id in(h.kicker,h.keeper)"));
 assert.ok(!/update penalty_private.config|delete from penalty_private|drop table/i.test(s));
 assert.ok(s.includes("clock_seen_at>clock_timestamp()-interval '10 seconds'"));
});

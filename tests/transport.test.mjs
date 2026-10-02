import test from 'node:test';
import assert from 'node:assert/strict';
const sessions=new Map();
globalThis.localStorage={getItem:k=>sessions.get(k)??null,setItem:(k,v)=>sessions.set(k,v)};
globalThis.window={PENALTY_CONFIG:{supabaseUrl:'https://project.supabase.co',supabaseKey:'sb_publishable_test'},setTimeout,clearTimeout,setInterval,clearInterval};
const {SupabaseTransport,SupabaseAuth,transport}=await import('../build/lib/api.js');
test('live socket listens to the owner-specific player signal as well as room controls',async()=>{
 let socket;
 globalThis.WebSocket=class {static OPEN=1;readyState=1;sent=[];constructor(){socket=this;}send(data){this.sent.push(JSON.parse(data));}close(){this.readyState=3;this.onclose?.();}};
 const api=new SupabaseTransport('TEST');api.auth.ensure=async()=>({access_token:'test-session'});
 api.rpc=async()=>({room:{id:'room-id'},me:{id:'player-id'}});await api.join('Alice','micro');
 let updates=0;const stop=api.subscribe(()=>updates++);await new Promise(r=>setImmediate(r));socket.onopen();
 const join=socket.sent[0];assert.equal(join.event,'phx_join');
 assert.deepEqual(join.payload.config.postgres_changes.map(x=>[x.table,x.filter]),[['room_events','room_id=eq.room-id'],['player_events','participant_id=eq.player-id']]);
 socket.onmessage({data:JSON.stringify({event:'postgres_changes',payload:{}})});assert.equal(updates,1);
 stop();assert.equal(socket.readyState,3);
});
test('Auth retains a valid in-memory session when browser storage is unavailable',async()=>{
 const original=globalThis.localStorage;globalThis.localStorage={getItem:()=>{throw new Error('disabled');},setItem:()=>{throw new Error('disabled');}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_,fn)=>fn()}}});
 const auth=new SupabaseAuth('https://project.supabase.co','sb_publishable_test');
 auth.session={access_token:'kept',refresh_token:'kept-too',expires_at:Math.floor(Date.now()/1000)+3600};
 assert.equal((await auth.ensure()).access_token,'kept');globalThis.localStorage=original;
});

test('a missing live config never instantiates a simulated practice engine',async()=>{
 const c=window.PENALTY_CONFIG,u=c.supabaseUrl,k=c.supabaseKey;delete c.supabaseUrl;delete c.supabaseKey;
 try{const api=transport('supabase','TEST');assert.equal(api.mode,'supabase');assert.equal(api.engine,undefined);await assert.rejects(()=>api.join('Alice','micro'),/settings are missing/);api.close();}finally{c.supabaseUrl=u;c.supabaseKey=k;}
});

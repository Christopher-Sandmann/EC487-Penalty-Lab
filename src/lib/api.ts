import { Engine } from './engine.js';
import {CONFIG} from '../generated.js';
import { BENCHMARKS, secureInt, uuid } from './math.js';
import type {Transport,Snapshot,Statistics,Side} from './types.js';
export interface ClientConfig {mode?:'practice'|'local'|'supabase';supabaseUrl?:string;supabaseKey?:string;turnstileSiteKey?:string;defaultRoom?:string;}
declare global {interface Window {PENALTY_CONFIG?:ClientConfig;PENALTY_ASSETS?:Record<string,string>;PENALTY_CAPTCHA?:string;turnstile?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;reset:(id?:string)=>void;remove?:(id:string)=>void};}}
export const config=window.PENALTY_CONFIG??{};
const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const write=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* Storage may be disabled; identity then lasts only in this tab. */}};
export const asset=(path:string)=>window.PENALTY_ASSETS?.[path]??`./${path}`;
export function clearPractice(){try{localStorage.removeItem('penalty:practice:v1');}catch{}}
export class PracticeTransport implements Transport {
 mode='practice' as const;code='PRACTICE';engine:Engine;private timer=0;private listeners=new Set<()=>void>();private stopped=false;
 constructor(){let stored;try{stored=JSON.parse(read('penalty:practice:v1')??'null')??undefined;}catch{}this.engine=new Engine(Date.now,secureInt,stored);if(!this.engine.store.rooms.length)this.engine.create('sim-host',this.code,true);this.timer=window.setInterval(()=>this.step(),180);}
 private save(){write('penalty:practice:v1',JSON.stringify(this.engine.store));}
 private step(){if(this.stopped)return;const before=this.engine.room(this.code).version;const now=Date.now();
  const bot=this.engine.store.players.find(p=>p.uid==='simulated-partner');
  if(bot){bot.lastSeen=now;const m=bot.activeMatch?this.engine.store.matches.find(m=>m.id===bot.activeMatch):null;
   if(m&&m.status==='briefing'&&!(bot.id===m.kicker?m.kickerPrepared:m.keeperPrepared)&&now-m.lockedAt>=CONFIG.briefing_min_ms){try{this.engine.prepare(bot.uid,m.id);}catch{}}
   if(m&&m.status==='locked'&&now-(m.choiceStartsAt??now)>800&&!this.engine.store.submissions[m.id][bot.id]){
    const k=this.engine.store.players.find(p=>p.id===m.kicker)!;const rate=bot.id===m.kicker?BENCHMARKS.kicker:BENCHMARKS.keeper;
    const n=secureInt(1000000)<rate*1000000;const side=n?k.preference:(k.preference==='micro'?'macro':'micro');
    try{this.engine.submit(bot.uid,m.id,side,uuid());}catch{}
   }
   if(bot.pendingResult){this.engine.seen(bot.uid,bot.pendingResult);if(now-(bot.feedbackSince??now)>=5000)this.engine.ready(bot.uid,this.code);}
   if(bot.status==='away')this.engine.ready(bot.uid,this.code);
  }
  this.engine.tick(this.code);if(this.engine.room(this.code).version!==before){this.save();this.listeners.forEach(f=>f());}
 }
 async join(name:string,preference:Side){
  this.engine.join('practice-player',this.code,name,preference);
  const r=this.engine.room(this.code);if(!this.engine.store.players.some(p=>p.uid==='simulated-partner')){
   this.engine.join('simulated-partner',this.code,'Practice partner',preference==='micro'?'macro':'micro');
   this.engine.host('sim-host',this.code,'start');
  }this.save();return this.snapshot();
 }
 async snapshot(){return this.engine.snapshot('practice-player',this.code);}
 async statistics(){return this.engine.statistics('practice-player',this.code);}
 async prepare(match:string){this.engine.prepare('practice-player',match);this.save();this.listeners.forEach(f=>f());}
 async submit(match:string,side:Side){this.engine.submit('practice-player',match,side,uuid());this.save();this.listeners.forEach(f=>f());}
 async seen(match:string){this.engine.seen('practice-player',match);this.save();}
 async ready(){this.engine.ready('practice-player',this.code);this.save();this.listeners.forEach(f=>f());}
 async heartbeat(){try{this.engine.heartbeat('practice-player',this.code);}catch{}}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 async host(){throw new Error('Practice controls do not manage real classrooms.');}
 async export(){return this.engine.export('sim-host',this.code);}
 close(){this.stopped=true;clearInterval(this.timer);this.listeners.clear();}
}
interface AuthSession {access_token:string;refresh_token:string;expires_at:number;expires_in?:number;user?:{id:string};}
export class SupabaseAuth {
 session:AuthSession|null=null;private key:string;
 constructor(public url:string,public apikey:string,private hostMode=false){this.key=`penalty:auth:${url}:${hostMode?'host':'player'}`;this.load();}
 private load(){const saved=read(this.key);if(saved)try{const parsed=JSON.parse(saved);if(parsed?.access_token&&parsed?.refresh_token)this.session=parsed;}catch{/* Keep a valid in-memory identity if storage is unavailable or corrupt. */}}
 private async send(path:string,body:unknown):Promise<AuthSession>{
  const r=await fetch(`${this.url}/auth/v1/${path}`,{method:'POST',headers:{apikey:this.apikey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok){if(r.status===429)throw new Error(path==='signup'?'Anonymous sign-in rate limit reached for this network. Ask the instructor to check Anonymous sign-ins in Supabase → Authentication → Rate Limits. Keep this page open; do not clear browser data or repeatedly retry.':'Authentication is temporarily rate limited on this network. Keep this page open and ask the instructor to check the relevant Supabase Authentication rate limit. Do not clear browser data or repeatedly retry.');throw new Error(d.msg??d.error_description??d.message??'Authentication failed.');}
  if(!d.access_token||!d.refresh_token)throw new Error('Authentication did not return a session.');
  this.session={...d,expires_at:d.expires_at??Math.floor(Date.now()/1000)+(d.expires_in??3600)};write(this.key,JSON.stringify(this.session));return this.session!;
 }
 async ensure(){
  const operation=async()=>{this.load();if(this.session&&this.session.expires_at*1000>Date.now()+60000)return this.session;
   if(this.session)return this.send('token?grant_type=refresh_token',{refresh_token:this.session.refresh_token});
   if(this.hostMode)throw new Error('Sign in with your instructor account first.');
   if(config.turnstileSiteKey&&!window.PENALTY_CAPTCHA)throw new Error('Complete the security check before joining.');
   return this.send('signup',{data:{},gotrue_meta_security:{captcha_token:window.PENALTY_CAPTCHA}});
  };
  // Prevent duplicate anonymous users or competing refresh-token use across tabs.
  if(navigator.locks)return navigator.locks.request(`auth:${this.key}`,operation);
  throw new Error('This browser needs Web Locks for safe cross-tab sign-in. Use an up-to-date Safari, Chrome, Firefox or Edge.');
 }
 async password(email:string,password:string){return this.send('token?grant_type=password',{email,password,gotrue_meta_security:{captcha_token:window.PENALTY_CAPTCHA}});}
}
export class SupabaseTransport implements Transport {
 mode='supabase' as const;auth:SupabaseAuth;roomId='';private participantId='';private generation=0;private ws:WebSocket|null=null;private timer=0;private retry=0;private attempts=0;private closed=false;private listener:(()=>void)|null=null;private ref=0;
 constructor(public code:string,hostMode=false){if(!config.supabaseUrl||!config.supabaseKey)throw new Error('Supabase is not configured. Use isolated practice or follow the deployment guide.');this.auth=new SupabaseAuth(config.supabaseUrl.replace(/\/$/,''),config.supabaseKey,hostMode);}
 async rpc(name:string,args:Record<string,unknown>={}){
  const session=await this.auth.ensure();const r=await fetch(`${this.auth.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:this.auth.apikey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('Unexpected backend response.');}
  if(!r.ok)throw new Error(data?.message??'The server could not complete that action.');return data;
 }
 async join(name:string,preference:Side){const s=await this.rpc('join_room',{p_code:this.code,p_username:name,p_preference:preference});this.roomId=s.room.id;this.participantId=s.me?.id??'';return s as Snapshot;}
 async snapshot(){const s=await this.rpc('room_snapshot',{p_code:this.code});this.roomId=s.room.id;this.participantId=s.me?.id??'';return s as Snapshot;}
 async statistics(){return await this.rpc('room_statistics',{p_code:this.code}) as Statistics;}
 async prepare(match:string){const response=await this.rpc('prepare_match',{p_match:match});if(response?.ok===false)throw new Error('This reminder has expired. No penalty was counted.');}
 async submit(match:string,side:Side){const response=await this.rpc('submit_choice',{p_match:match,p_choice:side,p_request_id:uuid()});if(response?.ok===false)throw new Error('This attempt is already closed. No late choice was counted.');}
 async seen(match:string){await this.rpc('feedback_seen',{p_match:match});}
 async ready(){await this.rpc('ready_player',{p_code:this.code});}
 async heartbeat(){await this.rpc('player_heartbeat',{p_code:this.code});}
 subscribe(fn:()=>void){this.close();this.listener=fn;this.closed=false;void this.connect();return()=>this.close();}
 private async connect(){
  if(this.closed||!this.roomId)return;const generation=++this.generation;
  try{
   const session=await this.auth.ensure();if(this.closed||generation!==this.generation)return;
   const u=this.auth.url.replace(/^http/,'ws')+`/realtime/v1/websocket?apikey=${encodeURIComponent(this.auth.apikey)}&vsn=1.0.0`;
   const ws=this.ws=new WebSocket(u),topic=`realtime:room:${this.roomId}`,joinRef=String(++this.ref);
   const send=(event:string,payload:unknown,channel=topic)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({topic:channel,event,payload,ref:event==='phx_join'?joinRef:String(++this.ref),join_ref:channel==='phoenix'?null:joinRef}));};
   ws.onopen=()=>{if(this.closed||generation!==this.generation){ws.close();return;}
    send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'*',schema:'public',table:'room_events',filter:`room_id=eq.${this.roomId}`},...(this.participantId?[{event:'*',schema:'public',table:'player_events',filter:`participant_id=eq.${this.participantId}`}]:[])]},access_token:session.access_token});
    clearInterval(this.timer);this.timer=window.setInterval(()=>{send('heartbeat',{},'phoenix');void this.auth.ensure().then(s=>send('access_token',{access_token:s.access_token})).catch(()=>ws.close());},20000);
   };
   ws.onmessage=event=>{if(generation!==this.generation)return;try{const d=JSON.parse(event.data);if(d.event==='phx_reply'&&d.ref===joinRef&&d.payload?.status==='ok'){this.attempts=0;this.listener?.();}if(d.event==='postgres_changes')this.listener?.();if(d.event==='phx_error'||(d.event==='phx_reply'&&d.payload?.status==='error')||(d.event==='system'&&d.payload?.status==='error'))ws.close();}catch{/* Reject malformed events; persistent state is still authoritative. */}};
   ws.onerror=()=>ws.close();ws.onclose=()=>{if(generation!==this.generation)return;clearInterval(this.timer);if(!this.closed)this.schedule();};
  }catch{if(!this.closed&&generation===this.generation)this.schedule();}
 }
 private schedule(){clearTimeout(this.retry);this.retry=window.setTimeout(()=>void this.connect(),Math.min(30000,1000*2**Math.min(this.attempts++,5))+secureInt(500));}
 async host(action:string,value?:unknown){if(action==='preflight')return this.rpc('host_preflight',{p_code:this.code});if(action==='create')return this.rpc('host_create_room',{p_code:this.code,p_practice:Boolean(value)});return this.rpc('host_room_action',{p_code:this.code,p_action:action,p_value:value??null});}
 async export(){const rows=await this.rpc('host_export',{p_code:this.code}) as Record<string,unknown>[];return jsonCsv(rows);}
 close(){this.closed=true;this.generation++;clearInterval(this.timer);clearTimeout(this.retry);this.ws?.close();this.ws=null;this.listener=null;}
}
export function jsonCsv(rows:Record<string,unknown>[]){if(!rows.length)return 'room,status\r\n';const keys=Object.keys(rows[0]);const q=(x:unknown)=>{const raw=String(x??'');return `"${(/^[=+@\t\r]/.test(raw)?"'"+raw:raw).replaceAll('"','""')}"`;};return [keys.join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\r\n');}
export class LocalTransport implements Transport {
 mode='local' as const;private token='';private abort:AbortController|null=null;private closed=false;private reconnect=0;hostToken='';
 constructor(public code:string){this.token=read('penalty:local:token')??'';}
 async call(action:string,args:Record<string,unknown>={}){
  if(!this.token){const acquire=async()=>{this.token=read('penalty:local:token')??'';if(this.token)return;const r=await fetch('./api/session',{method:'POST'});if(!r.ok)throw new Error('Local server unavailable. Start npm run dev.');const d=await r.json();this.token=d.token;write('penalty:local:token',this.token);};if(navigator.locks)await navigator.locks.request('penalty:local:session',acquire);else await acquire();}
  const r=await fetch('./api/'+action,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...(this.hostToken?{'X-Local-Host-Token':this.hostToken}:{})},body:JSON.stringify({code:this.code,...args}),signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok)throw new Error(d.error??'Local request failed');return d;
 }
 async join(name:string,preference:Side){return this.call('join',{username:name,preference}) as Promise<Snapshot>;}
 async snapshot(){return this.call('snapshot') as Promise<Snapshot>;}
 async statistics(){return this.call('statistics') as Promise<Statistics>;}
 async prepare(match:string){await this.call('prepare',{match});}
 async submit(match:string,side:Side){await this.call('submit',{match,choice:side,requestId:uuid()});}
 async seen(match:string){await this.call('seen',{match});}
 async ready(){await this.call('ready');}
 async heartbeat(){await this.call('heartbeat');}
 subscribe(fn:()=>void){this.closed=false;const connect=async()=>{if(this.closed)return;this.abort=new AbortController();try{
   const r=await fetch(`./api/events?code=${encodeURIComponent(this.code)}`,{headers:{Authorization:`Bearer ${this.token}`},signal:this.abort.signal});if(!r.ok||!r.body)throw new Error('SSE unavailable');const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';
   while(!this.closed){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let i;while((i=pending.indexOf('\n\n'))>=0){const event=pending.slice(0,i);pending=pending.slice(i+2);if(event.startsWith('data:'))fn();}}
  }catch{}if(!this.closed)this.reconnect=window.setTimeout(connect,2500);};void connect();return()=>this.close();}
 async host(action:string,value?:unknown){return this.call(action==='create'?'host/create':'host',{action,value});}
 async export(){return (await this.call('export')).csv as string;}
 close(){this.closed=true;this.abort?.abort();clearTimeout(this.reconnect);}
}
class UnconfiguredTransport implements Transport {
 mode='supabase' as const;
 constructor(public code:string){}
 private unavailable():never {throw new Error('Live Supabase settings are missing. Configure the project URL and publishable key, then rebuild.');}
 async join(){return this.unavailable();}async snapshot(){return this.unavailable();}async statistics(){return this.unavailable();}
 async prepare(){this.unavailable();}async submit(){this.unavailable();}async seen(){this.unavailable();}async ready(){this.unavailable();}async heartbeat(){this.unavailable();}
 async host(){return this.unavailable();}async export(){return this.unavailable();}
 subscribe(){return ()=>{};}close(){}
}
export function transport(mode:string,code:string):Transport{return mode==='supabase'?(!config.supabaseUrl||!config.supabaseKey?new UnconfiguredTransport(code):new SupabaseTransport(code)):mode==='local'?new LocalTransport(code):new PracticeTransport();}

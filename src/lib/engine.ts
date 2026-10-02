/** Isolated local/test authority. Production uses the SQL functions, not this client code.
 * All mutations are synchronous: a Node event loop commits each operation atomically.
 * Private submissions never occur in snapshot/statistics output.
 */
import { CONFIG } from '../generated.js';
import { secureInt, goalUnits, canonical, uuid } from './math.js';
import { visualOutcome } from './visual.js';
import { GameError } from './types.js';
import type { Room,Player,Match,Side,Snapshot,Statistics,PublicPlayer,MatchView } from './types.js';
interface Submission {choice:Side;at:number;requestId:string;}
export interface Store {rooms:Room[];players:Player[];matches:Match[];submissions:Record<string,Record<string,Submission>>;drawCount:number;}
const publicPlayer=(p:Player):PublicPlayer=>({id:p.id,username:p.username,preference:p.preference,kicks:p.kicks,keeps:p.keeps,status:p.status});
export class Engine {
 store:Store;
 constructor(private clock:()=>number=Date.now,private rand:(n:number)=>number=secureInt,store?:Store){this.store=store??{rooms:[],players:[],matches:[],submissions:{},drawCount:0};}
 private fail(code:string,message:string):never{throw new GameError(code,message);}
 room(code:string){return this.store.rooms.find(r=>r.code===code.toUpperCase())??this.fail('room','Room not found. Check the code.');}
 player(uid:string,roomId:string){return this.store.players.find(p=>p.uid===uid&&p.roomId===roomId)??this.fail('membership','Join this room first.');}
 private touch(r:Room){r.version++;}
 create(host:string,code:string,practice=true){
  code=code.toUpperCase();if(!/^[A-Z0-9]{4,8}$/.test(code))this.fail('code','Use 4–8 letters or numbers.');
  if(this.store.rooms.some(r=>r.code===code))this.fail('duplicate','That room code already exists.');
  const r:Room={id:uuid(),code,host,phase:'lobby',entryOpen:true,showBenchmarks:true,practice,createdAt:this.clock(),nextSerial:1,version:1};this.store.rooms.push(r);return r;
 }
 join(uid:string,code:string,username:string,preference:Side):Snapshot {
  const r=this.room(code);const existing=this.store.players.find(p=>p.uid===uid&&p.roomId===r.id);
  if(existing)return this.snapshot(uid,code);
  if(!r.entryOpen||r.phase==='ended')this.fail('closed','This room is not accepting new entrants.');
  username=username.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,17}$/u.test(username))this.fail('username','Use 2–18 letters, numbers, spaces, dots, underscores or hyphens.');
  if(!['micro','macro'].includes(preference))this.fail('preference','Choose Micro or Macro.');
  if(this.store.players.some(p=>p.roomId===r.id&&p.username.toLocaleLowerCase('en')===username.toLocaleLowerCase('en')))this.fail('username','That username is already in this room.');
  const now=this.clock();const p:Player={id:uuid(),uid,roomId:r.id,username,preference,kicks:0,keeps:0,status:r.phase==='lobby'?'lobby':'waiting',readyAt:now,lastSeen:now,activeMatch:null,pendingResult:null,feedbackSince:null,registeredAt:now};
  this.store.players.push(p);this.touch(r);this.tick(code);return this.snapshot(uid,code);
 }
 host(host:string,code:string,action:string,value?:unknown){
  const r=this.room(code);if(r.host!==host)this.fail('host','Instructor authorization required.');
  if(action==='start'&&r.phase==='lobby'){r.phase='playing';for(const p of this.store.players.filter(p=>p.roomId===r.id&&p.status==='lobby')){p.status='waiting';p.readyAt=this.clock();}}
  else if(action==='pause'&&r.phase==='playing')r.phase='paused';
  else if(action==='resume'&&r.phase==='paused')r.phase='playing';
  else if(action==='entry'&&r.phase!=='ended')r.entryOpen=Boolean(value);
  else if(action==='benchmarks')r.showBenchmarks=Boolean(value);
  else if(action==='end'){r.phase='ended';r.entryOpen=false;for(const m of this.store.matches.filter(m=>m.roomId===r.id&&['briefing','locked'].includes(m.status)))this.cancel(m,'session-ended');}
  else this.fail('phase','That action is unavailable in the current phase.');
  this.touch(r);this.tick(code);return r;
 }
 heartbeat(uid:string,code:string){const r=this.room(code),p=this.player(uid,r.id);p.lastSeen=this.clock();this.tick(code);}
 private candidates(p:Player,q:Player):Array<[Player,Player]>{
  const pairs:Array<[Player,Player]>=[];if(p.kicks<6&&q.keeps<6)pairs.push([p,q]);if(q.kicks<6&&p.keeps<6)pairs.push([q,p]);return pairs;
 }
 tick(code?:string){
  const rooms=code?[this.room(code)]:this.store.rooms,now=this.clock();
  for(const r of rooms){
   for(const m of this.store.matches.filter(m=>m.roomId===r.id&&['briefing','locked'].includes(m.status)&&m.deadline<=now))this.cancel(m,m.status==='briefing'?'briefing-timeout':'decision-timeout');
   if(r.phase!=='playing')continue;
   for(;;){
    const pool=this.store.players.filter(p=>p.roomId===r.id&&p.status==='waiting'&&now-p.lastSeen<CONFIG.presence_ms&&(p.kicks<6||p.keeps<6));
    // Directed residual degree feasibility: remaining kicks of i plus remaining
    // keeps of i cannot exceed all remaining penalties (no self-matches).
    // Reserve already locked appearances. While unfinished students are present,
    // do not strand one by finishing everyone else during their feedback screen.
    const unfinished=this.store.players.filter(p=>p.roomId===r.id&&p.kicks+p.keeps<12);
    const remaining=unfinished.reduce((n,p)=>n+6-p.kicks,0)-this.store.matches.filter(m=>m.roomId===r.id&&['briefing','locked'].includes(m.status)).length;
    const critical=unfinished.every(p=>now-p.lastSeen<CONFIG.presence_ms)?unfinished.filter(p=>12-p.kicks-p.keeps-Number(!!p.activeMatch)>=remaining):[];

    const edges:Array<{a:Player;b:Player;repeat:number;forced:number}> = [];
    for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){
     const a=pool[i],b=pool[j];if(!this.candidates(a,b).length||critical.some(p=>p.id!==a.id&&p.id!==b.id))continue;
     const repeat=Number(this.store.matches.some(m=>m.roomId===r.id&&m.status==='resolved'&&((m.kicker===a.id&&m.keeper===b.id)||(m.kicker===b.id&&m.keeper===a.id))));
     const forced=Number(a.kicks===6||a.keeps===6)+Number(b.kicks===6||b.keeps===6);
     edges.push({a,b,repeat,forced});
    }
    if(!edges.length)break;
    edges.sort((x,y)=>x.repeat-y.repeat||y.forced-x.forced);
    const best=edges[0];const tied=edges.filter(x=>x.repeat===best.repeat&&x.forced===best.forced);const e=tied[this.rand(tied.length)];
    const options=this.candidates(e.a,e.b),[k,g]=options[this.rand(options.length)];
    const m:Match={id:uuid(),roomId:r.id,serial:r.nextSerial++,kicker:k.id,keeper:g.id,kickerPrepared:false,keeperPrepared:false,choiceStartsAt:null,lockedAt:now,deadline:now+CONFIG.briefing_timeout_ms,status:'briefing',result:null,reason:null,closedAt:null};
    this.store.matches.push(m);this.store.submissions[m.id]={};k.status=g.status='matched';k.activeMatch=g.activeMatch=m.id;this.touch(r);
   }
  }
 }
 prepare(uid:string,matchId:string){
  const m=this.store.matches.find(m=>m.id===matchId)??this.fail('match','Match not found.');
  const p=this.player(uid,m.roomId);if(![m.kicker,m.keeper].includes(p.id))this.fail('membership','You are not in this match.');
  if(m.status==='locked'||m.status==='resolved')return;
  if(m.status!=='briefing')this.fail('closed','This attempt is already closed.');
  const now=this.clock();if(now>=m.deadline){this.cancel(m,'briefing-timeout');this.tick();this.fail('timeout','The reminder window has closed. No penalty was counted.');}
  if(now-m.lockedAt<CONFIG.briefing_min_ms)this.fail('briefing','Take a moment to read the scoring probabilities.');
  p.lastSeen=now;if(p.id===m.kicker?m.kickerPrepared:m.keeperPrepared)return;
  if(p.id===m.kicker)m.kickerPrepared=true;else m.keeperPrepared=true;
  if(m.kickerPrepared&&m.keeperPrepared){m.status='locked';m.choiceStartsAt=now;m.deadline=now+CONFIG.decision_ms;}
  this.touch(this.store.rooms.find(r=>r.id===m.roomId)!);
 }
 submit(uid:string,matchId:string,choice:Side,requestId:string){
  const m=this.store.matches.find(m=>m.id===matchId)??this.fail('match','Match not found.');
  const p=this.player(uid,m.roomId);if(![m.kicker,m.keeper].includes(p.id))this.fail('membership','You are not in this match.');
  if(!['micro','macro'].includes(choice))this.fail('choice','Choose Micro or Macro.');
  const submissions=this.store.submissions[m.id],previous=submissions[p.id];
  if(previous){if(previous.choice!==choice)this.fail('locked','Your first choice is locked.');return;}
  if(m.status!=='locked')this.fail('closed','This attempt is already closed.');
  const now=this.clock();if(now>=m.deadline){this.cancel(m,'decision-timeout');this.tick();this.fail('timeout','The decision window has closed. No penalty was counted.');}
  submissions[p.id]={choice,at:now,requestId};p.lastSeen=now;this.touch(this.store.rooms.find(r=>r.id===m.roomId)!);
  if(submissions[m.kicker]&&submissions[m.keeper]){
   const k=this.store.players.find(p=>p.id===m.kicker)!,g=this.store.players.find(p=>p.id===m.keeper)!;
   const kc=submissions[m.kicker].choice,gc=submissions[m.keeper].choice;
   const units=goalUnits(kc,gc,k.preference);const draw=this.rand(CONFIG.denominator);this.store.drawCount++;
   m.result={kickerChoice:kc,keeperChoice:gc,kickerN:canonical(kc,k.preference),keeperN:canonical(gc,k.preference),probability:units/CONFIG.denominator,goal:draw<units,visualOutcome:visualOutcome(draw,units,kc===gc),resolvedAt:now};m.status='resolved';m.closedAt=now;
   k.kicks++;g.keeps++;
   for(const x of [k,g]){x.status='feedback';x.activeMatch=null;x.pendingResult=m.id;x.feedbackSince=null;}
  }
 }
 private cancel(m:Match,reason:string){
  if(!['briefing','locked'].includes(m.status))return;const wasBriefing=m.status==='briefing';const now=this.clock();m.status='cancelled';m.reason=reason;m.closedAt=now;
  for(const id of [m.kicker,m.keeper]){const p=this.store.players.find(p=>p.id===id)!;p.activeMatch=null;p.status=(this.store.submissions[m.id]?.[id]||(wasBriefing&&(id===m.kicker?m.kickerPrepared:m.keeperPrepared)))?'waiting':'away';p.readyAt=now;}
  this.touch(this.store.rooms.find(r=>r.id===m.roomId)!);
 }
 seen(uid:string,matchId:string){
  const m=this.store.matches.find(x=>x.id===matchId)??this.fail('match','Match not found.'),p=this.player(uid,m.roomId);
  if(p.pendingResult!==matchId||m.status!=='resolved')this.fail('result','No feedback is due for this match.');
  if(p.feedbackSince===null)p.feedbackSince=this.clock();
 }
 ready(uid:string,code:string){
  const r=this.room(code),p=this.player(uid,r.id),now=this.clock();p.lastSeen=now;
  if(p.status==='matched'||p.status==='waiting'||p.status==='finished')return;
  if(p.pendingResult){if(p.feedbackSince===null||now-p.feedbackSince<CONFIG.feedback_ms)this.fail('reading','Please take a moment to read the card.');p.pendingResult=null;p.feedbackSince=null;}
  p.status=p.kicks+p.keeps===12?'finished':r.phase==='lobby'?'lobby':'waiting';p.readyAt=now;this.touch(r);this.tick(code);
 }
 snapshot(uid:string,code:string):Snapshot {
  const r=this.room(code);const p=this.player(uid,r.id);const now=this.clock();let mv:MatchView|null=null;
  const mid=p.activeMatch??p.pendingResult;const m=mid?this.store.matches.find(x=>x.id===mid):null;
  if(m){const s=this.store.submissions[m.id]??{};mv={...m,kickerPlayer:publicPlayer(this.store.players.find(x=>x.id===m.kicker)!),keeperPlayer:publicPlayer(this.store.players.find(x=>x.id===m.keeper)!),kickerReady:!!s[m.kicker],keeperReady:!!s[m.keeper],ownChoice:s[p.id]?.choice??null};}
  const ps=this.store.players.filter(p=>p.roomId===r.id),counts:Record<string,number>={waiting:0,matched:0,finished:0,away:0,feedback:0,lobby:0,disconnected:0};
  for(const x of ps){counts[x.status]++;if(now-x.lastSeen>=CONFIG.presence_ms&&x.status!=='finished')counts.disconnected++;}
  const history=this.store.matches.filter(m=>m.roomId===r.id&&m.status==='resolved'&&[m.kicker,m.keeper].includes(p.id)).map(m=>({...m,kickerPlayer:publicPlayer(this.store.players.find(x=>x.id===m.kicker)!),keeperPlayer:publicPlayer(this.store.players.find(x=>x.id===m.keeper)!)}));
  return JSON.parse(JSON.stringify({history,serverNow:now,room:{...r,host:''},me:p,match:mv,waiting:counts.waiting,counts,diagnostics:{cancelled:this.store.matches.filter(m=>m.roomId===r.id&&m.status==='cancelled').length,unresolved:this.store.matches.filter(m=>m.roomId===r.id&&['briefing','locked'].includes(m.status)).length}}));
 }
 statistics(uid:string,code:string):Statistics {
  const r=this.room(code);if(uid!==r.host)this.player(uid,r.id);
  const ps=this.store.players.filter(x=>x.roomId===r.id);
  const matches=this.store.matches.filter(m=>m.roomId===r.id).map(m=>({...m,kickerPlayer:publicPlayer(ps.find(p=>p.id===m.kicker)!),keeperPlayer:publicPlayer(ps.find(p=>p.id===m.keeper)!)}));
  return JSON.parse(JSON.stringify({serverNow:this.clock(),room:{...r,host:''},players:ps.map(publicPlayer),matches,counts:{connected:ps.filter(p=>this.clock()-p.lastSeen<CONFIG.presence_ms).length,disconnected:ps.filter(p=>p.status!=='finished'&&this.clock()-p.lastSeen>=CONFIG.presence_ms).length}}));
 }
 export(host:string,code:string):string {
  const r=this.room(code);if(r.host!==host)this.fail('host','Instructor authorization required.');
  const header=['room','practice','serial','match_id','status','reason','kicker_id','keeper_id','kicker_preference','keeper_preference','kicker_label','keeper_label','kicker_N','keeper_N','goal_probability','goal','visual_outcome','choice_starts_at','locked_at','deadline','closed_at','kicker_submitted_at','keeper_submitted_at'];
  const quote=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`;
  const rows=this.store.matches.filter(m=>m.roomId===r.id).map(m=>{const k=this.store.players.find(p=>p.id===m.kicker)!,g=this.store.players.find(p=>p.id===m.keeper)!,s=this.store.submissions[m.id];const closed=['resolved','cancelled'].includes(m.status);return [r.code,r.practice,m.serial,m.id,m.status,m.reason,k.id,g.id,k.preference,g.preference,closed?s[k.id]?.choice:null,closed?s[g.id]?.choice:null,m.result?.kickerN,m.result?.keeperN,m.result?.probability,m.result?.goal,m.result?.visualOutcome,m.choiceStartsAt,m.lockedAt,m.deadline,m.closedAt,closed?s[k.id]?.at:null,closed?s[g.id]?.at:null].map(quote).join(',');});
  return [header.join(','),...rows].join('\r\n');
 }
}

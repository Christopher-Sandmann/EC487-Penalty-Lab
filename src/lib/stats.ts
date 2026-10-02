import type {Statistics,Role,Side,PublicPlayer,Observation} from './types.js';
import {BENCHMARKS,confidenceSequence,logMixture} from './math.js';
import {CONFIG} from '../generated.js';
export interface Stream {id:string;role:Role;preference:Side;opponent:Side|null;n:number;s:number;people:number;inferenceN:number;inferenceS:number;band:[number,number];benchmark:number;excluded:boolean;everExcluded:boolean;blocked:'unresolved'|'cancelled'|null;buffered:number;}
export const STREAMS = (['kicker','keeper'] as Role[]).flatMap(role=>(['micro','macro'] as Side[]).flatMap(preference=>[null,'micro','macro'].map(opponent=>({id:`${role}:${preference}:${opponent??'all'}`,role,preference,opponent:opponent as Side|null}))));
export function streams(data:Statistics):Stream[] {
 const sorted=[...data.matches].sort((a,b)=>a.serial-b.serial);
 return STREAMS.map(spec=>{
  const selected=sorted.filter(m=>{const p=spec.role==='kicker'?m.kickerPlayer:m.keeperPlayer;const o=spec.role==='kicker'?m.keeperPlayer:m.kickerPlayer;return p.preference===spec.preference&&(!spec.opponent||o.preference===spec.opponent);});
  let n=0,s=0,ni=0,si=0,blocked:Stream['blocked']=null,ever=false;const people=new Set<string>();
  const benchmark=spec.role==='kicker'?BENCHMARKS.kicker:BENCHMARKS.keeper;
  for(const m of selected){
   if(m.status==='resolved'&&m.result){
    const x=(spec.role==='kicker'?m.result.kickerN:m.result.keeperN)?1:0;n++;s+=x;people.add(spec.role==='kicker'?m.kicker:m.keeper);
    if(!blocked){ni++;si+=x;if(logMixture(si,ni,benchmark)>=Math.log(CONFIG.inference_streams/CONFIG.alpha_family))ever=true;}
   }else if(!blocked)blocked=m.status==='cancelled'?'cancelled':'unresolved';
  }
  const band=confidenceSequence(si,ni);
  return {...spec,n,s,people:people.size,inferenceN:ni,inferenceS:si,band,benchmark,excluded:ni>0&&(benchmark<band[0]||benchmark>band[1]),everExcluded:ever,blocked,buffered:n-ni};
 });
}
interface RoleSummary {n:number;expected:number|null;actual:number|null;wins:number;}
function roleSummary(ms:Observation[],role:Role):RoleSummary {
 const valid=ms.filter(m=>m.status==='resolved'&&m.result);const n=valid.length;
 const wins=valid.reduce((s,m)=>s+Number(role==='kicker'?m.result!.goal:!m.result!.goal),0);
 return {n,expected:n?valid.reduce((s,m)=>s+(role==='kicker'?m.result!.probability:1-m.result!.probability),0)/n:null,actual:n?wins/n:null,wins};
}
export function record(data:Statistics,test:(p:PublicPlayer)=>boolean){
 const kick=roleSummary(data.matches.filter(m=>test(m.kickerPlayer)),'kicker');
 const keep=roleSummary(data.matches.filter(m=>test(m.keeperPlayer)),'keeper');
 const chance=kick.n&&keep.n?(kick.expected!+keep.expected!)/2:null;
 const actual=kick.n&&keep.n?(kick.actual!+keep.actual!)/2:null;
 return {kick,keep,chance,actual,wins:kick.wins+keep.wins,losses:kick.n+keep.n-kick.wins-keep.wins,complete:kick.n===6&&keep.n===6};
}
export function rankings(data:Statistics){return data.players.map(p=>({player:p,...record(data,x=>x.id===p.id)})).sort((a,b)=>{
 if(a.chance===null&&b.chance!==null)return 1;if(a.chance!==null&&b.chance===null)return -1;
 return (b.chance??0)-(a.chance??0)||(b.actual??0)-(a.actual??0)||a.player.username.localeCompare(b.player.username,'en')||a.player.id.localeCompare(b.player.id);
});}
export function teams(data:Statistics){return {micro:record(data,p=>p.preference==='micro'),macro:record(data,p=>p.preference==='macro')};}
export function teamLead(data:Statistics):string {
 const t=teams(data);if(t.micro.chance===null||t.macro.chance===null)return 'The team contest is still taking shape.';
 const delta=t.micro.chance-t.macro.chance;
 return Math.abs(delta)<1e-10?'The teams are currently tied on average win chance.':`Team ${delta>0?'Micro':'Macro'} currently leads on average win chance.`;
}

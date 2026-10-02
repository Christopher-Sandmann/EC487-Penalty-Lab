/** Pure, testable visual specification. One server draw decides the goal; its
 * residual only decorates a non-goal. The animation never draws a second outcome.
 * All geometry uses the shared camera: Micro = screen left, Macro = screen right.
 */
import type {Result,VisualOutcome} from './types.js';
export const GOAL={left:242,right:658,top:128,bottom:293,centre:450} as const;
export function visualOutcome(draw:number,units:number,sameSide:boolean):VisualOutcome {
 if(!Number.isInteger(draw)||draw<0||draw>=10000||units<0||units>=10000)throw new RangeError('Invalid outcome draw');
 if(draw<units)return 'goal';
 const r=(draw-units)/(10000-units);
 if(sameSide){if(r<.65)return 'save';if(r<.77)return 'post';if(r<.90)return 'wide';return 'high';}
 // A keeper diving the wrong way cannot make a physically impossible save.
 return r<.34?'post':r<.67?'wide':'high';
}
export function outcomeLabel(result:Result):string {
 return {goal:'Goal!',save:'Saved!',post:'Off the post!',wide:'Wide!',high:'Over the bar!'}[result.visualOutcome];
}
export function outcomeDetail(result:Result):string {
 return {goal:'Striker scores',save:'Goalkeeper saves',post:'Striker hits the post',wide:'Striker shoots wide',high:'Striker shoots over'}[result.visualOutcome];
}
export function shotPlan(result:Result){
 const sign=result.kickerChoice==='micro'?-1:1,keeperSign=result.keeperChoice==='micro'?-1:1;
 const kind=result.visualOutcome;
 const target={goal:{x:450+sign*140,y:184},save:{x:450+sign*103.3,y:241.8},post:{x:450+sign*208,y:209},wide:{x:450+sign*288,y:216},high:{x:450+sign*128,y:73}}[kind];
 const finish=kind==='post'?{x:450+sign*246,y:331}:kind==='save'?{x:450+sign*95,y:322}:target;
 return {sign,keeperSign,kind,target,finish,keeper:{x:450+keeperSign*110,y:267}};
}
/** progress 0..1: contact at 0.72; then rebound/settle for saves and posts. */
export function shotPosition(result:Result,progress:number){
 const p=shotPlan(result),t=Math.max(0,Math.min(1,progress)),flight=Math.min(1,t/.72);
 if(t<=.72){return {x:450+(p.target.x-450)*flight,y:419+(p.target.y-419)*flight-25*Math.sin(Math.PI*flight),radius:10-4*flight,contact:false};}
 const a=(t-.72)/.28;
 return {x:p.target.x+(p.finish.x-p.target.x)*a,y:p.target.y+(p.finish.y-p.target.y)*a-((p.kind==='save'||p.kind==='post')?18*Math.sin(Math.PI*a):0),radius:6,contact:true};
}

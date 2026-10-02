import { CONFIG } from '../generated.js';
import type {Side} from './types.js';
export const MATRIX = CONFIG.matrix_units;
export const denominator = CONFIG.denominator;
const d = MATRIX.UN + MATRIX.NU - MATRIX.UU - MATRIX.NN;
export const BENCHMARKS = Object.freeze({
  kicker: (MATRIX.UN-MATRIX.UU)/d,
  keeper: (MATRIX.NU-MATRIX.UU)/d,
  goal: (MATRIX.UN*MATRIX.NU-MATRIX.UU*MATRIX.NN)/(d*denominator)
});
export function canonical(side:Side,kickerPreference:Side):boolean {return side===kickerPreference;}
export function goalUnits(kick:Side,keep:Side,kickerPreference:Side):number {
  return MATRIX[`${canonical(kick,kickerPreference)?'N':'U'}${canonical(keep,kickerPreference)?'N':'U'}` as keyof typeof MATRIX];
}
export function goalProbability(kick:Side,keep:Side,kickerPreference:Side):number {return goalUnits(kick,keep,kickerPreference)/denominator;}
/** UUID v4 using Web Crypto; works in offline preview contexts without randomUUID. */
export function uuid():string {
 const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
/** Unbiased uniform integer, with rejection rather than modulo bias. */
export function secureInt(max:number):number {
  if(!Number.isSafeInteger(max)||max<1||max>0x100000000)throw new RangeError('Invalid random bound');
  const cap=Math.floor(0x100000000/max)*max, a=new Uint32Array(1);
  do{globalThis.crypto.getRandomValues(a);}while(a[0]>=cap);
  return a[0]%max;
}
export function shuffle<T>(items:readonly T[],random=(n:number)=>secureInt(n)):T[] {
  const a=[...items];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;
}
// Lanczos log-gamma; stable for the nonnegative integer counts used here.
export function logGamma(z:number):number {
  const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(z<0.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z-=1;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
  const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
export function logMixture(s:number,n:number,p:number):number {
  if(!Number.isInteger(n)||!Number.isInteger(s)||s<0||n<s||p<0||p>1)throw new RangeError('Invalid Bernoulli counts');
  if(n===0)return 0;
  if(p===0)return s===0?-Math.log(n+1):Infinity;
  if(p===1)return s===n?-Math.log(n+1):Infinity;
  return logGamma(s+1)+logGamma(n-s+1)-logGamma(n+2)-s*Math.log(p)-(n-s)*Math.log1p(-p);
}
export function confidenceSequence(s:number,n:number,alpha=CONFIG.alpha_family/CONFIG.inference_streams):[number,number] {
  if(!(alpha>0&&alpha<1))throw new RangeError('Invalid alpha');
  logMixture(s,n,.5);if(n===0)return [0,1];
  const threshold=Math.log(1/alpha), center=s/n;
  const root=(lo:number,hi:number,lower:boolean)=>{for(let j=0;j<70;j++){const m=(lo+hi)/2;const outside=logMixture(s,n,m)>=threshold;if(outside===lower)lo=m;else hi=m;}return (lo+hi)/2;};
  return [s===0?0:root(0,center,true),s===n?1:root(center,1,false)];
}
export const pct=(x:number|null,digits=1)=>x===null?'—':`${(100*x).toFixed(digits)}%`;

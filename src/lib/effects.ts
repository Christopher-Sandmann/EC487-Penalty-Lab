/** Locally synthesized sound only: no remote audio, tracking, or gameplay randomness.
 * Audio is opt-in and unlocked on a gesture. The speaker mutes every audio cue
 * immediately. Haptics have their own switch and silently degrade when unsupported.
 */
import type {VisualOutcome} from './types.js';
const stored=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const persist=(key:string,value:boolean)=>{try{localStorage.setItem(key,String(value));}catch{}};
export function countdownCue(seconds:number):'tick'|'urgent'|null {
 return Number.isInteger(seconds)&&seconds>=1&&seconds<=12?(seconds<=3?'urgent':'tick'):null;
}
export class Effects {
 sound=stored('penalty:sound')==='true';
 haptics=stored('penalty:haptics')!=='false';
 readonly supportsHaptics=typeof navigator.vibrate==='function';
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private noise:AudioBuffer|null=null;
 private done=new Set<string>();
 private sources=new Set<AudioScheduledSourceNode>();
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 async unlock():Promise<boolean>{
  if(!this.sound)return false;
  try{
   const Audio=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Audio)return false;
   this.context??=new Audio({latencyHint:'interactive'});
   if(!this.master){this.master=this.context.createGain();this.master.gain.value=.6;this.master.connect(this.context.destination);}
   if(this.context.state!=='running')await this.context.resume();
   return this.context.state==='running';
  }catch{return false;}
 }
 async setSound(value:boolean){
  this.sound=value;persist('penalty:sound',value);
  if(!value){this.stopAudio();return;}
  if(await this.unlock())this.note(680,0,.10,.055);
 }
 setHaptics(value:boolean){this.haptics=value;persist('penalty:haptics',value);if(!value)this.cancelVibration();else this.pulse(25);}
 private report(cue:string){document.dispatchEvent(new CustomEvent('penalty:effect',{detail:{cue,audio:this.sound&&this.context?.state==='running',haptics:this.haptics&&this.supportsHaptics}}));}
 private once(key:string,fn:()=>void){if(this.done.has(key)||document.hidden)return;this.done.add(key);fn();}
 private track(node:AudioScheduledSourceNode){this.sources.add(node);node.onended=()=>{this.sources.delete(node);node.disconnect();};}
 private get ready(){return this.sound&&this.context?.state==='running'&&this.master;}
 private note(freq:number,delay:number,duration:number,volume:number,endFreq?:number,type:OscillatorType='sine'){
  if(!this.ready)return;const c=this.context!,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g);g.connect(this.master!);this.track(o);o.start(t);o.stop(t+duration+.02);
 }
 private noiseBurst(duration:number,volume:number,cutoff:number,swelling=false){
  if(!this.ready)return;const c=this.context!,t=c.currentTime;
  if(!this.noise){this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*2.5),c.sampleRate);const a=this.noise.getChannelData(0);let last=0;
   // Decorative noise, deliberately independent of the server's outcome draw.
   for(let i=0;i<a.length;i++){last=.91*last+.09*(Math.random()*2-1);a[i]=last*3;}}
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();source.buffer=this.noise;
  filter.type='lowpass';filter.frequency.value=cutoff;g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(volume,t+(swelling?.22:.012));
  if(swelling)g.gain.setValueAtTime(volume*.7,t+duration*.55);
  g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(filter);filter.connect(g);g.connect(this.master!);this.track(source);source.start(t);source.stop(t+duration+.02);
 }
 pulse(pattern:number|number[]){if(this.haptics&&this.supportsHaptics&&!document.hidden&&!this.reduced)try{navigator.vibrate(pattern);}catch{}}
 private cancelVibration(){if(this.supportsHaptics)try{navigator.vibrate(0);}catch{}}
 choice(){this.pulse(18);this.note(380,0,.045,.035);this.report('choice');}
 countdown(match:string,seconds:number){
  const cue=countdownCue(seconds);if(!cue)return;
  this.once(`${match}:clock:${seconds}`,()=>{this.note(cue==='urgent'?1100:740,0,cue==='urgent'?.085:.045,cue==='urgent'?.06:.03,undefined,'triangle');if(cue==='urgent')this.pulse(12);this.report(cue);});
 }
 reveal(match:string,elapsed:number,kind:VisualOutcome,win:boolean){
  if(elapsed>=360)this.once(`${match}:kick`,()=>{this.noiseBurst(.13,.32,500);this.note(150,0,.12,.14,55);this.report('kick');});
  if(elapsed>=1116)this.once(`${match}:result`,()=>{
   if(kind==='goal'){
    this.noiseBurst(win?1.9:1.1,win?.62:.23,2200,true);
    // Small overlapping rising crowd voices give the swell a cheering character.
    for(let i=0;i<5;i++)this.note(170+i*37,i*.04,.8+i*.12,win?.028:.010,300+i*54,'triangle');
    if(win){[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.note(f,.06+i*.10,.24,.055));this.pulse([65,45,100]);}else this.pulse(25);
   }else if(kind==='save'){
    this.noiseBurst(.22,.38,850);if(win){this.noiseBurst(.85,.26,1800,true);this.note(440,.1,.16,.055);this.note(660,.23,.24,.06);this.pulse([50,35,85]);}else this.pulse(25);
   }else if(kind==='post'){this.note(1150,0,.36,.12,920,'triangle');this.pulse(win?[40,30,60]:30);}
   else{this.noiseBurst(.32,.10,700);this.pulse(win?[35,30,55]:22);}
   this.report(kind);
  });
 }
 private stopAudio(){for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();}
 quiet(){this.stopAudio();this.cancelVibration();}
}

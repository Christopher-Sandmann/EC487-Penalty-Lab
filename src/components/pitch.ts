import type { MatchView,Side } from '../lib/types.js';
import {outcomeLabel,shotPlan,shotPosition} from '../lib/visual.js';
interface PitchState {match?:MatchView|null;revealAt?:number;hero?:boolean;win?:boolean;}
declare global {interface Window {__PENALTY_PERF__?:{deltas:number[];frames:number;};}}
/** Cached stadium + a handful of moving sprites. No layout reads inside the frame loop. */
export class Pitch {
 private ctx:CanvasRenderingContext2D;private background:HTMLCanvasElement;private bg:CanvasRenderingContext2D;private raf=0;private observer:ResizeObserver;private state:PitchState;private last=0;private disposed=false;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;private width=900;private height=540;
 constructor(private canvas:HTMLCanvasElement,state:PitchState={}){
  this.ctx=canvas.getContext('2d',{alpha:false})!;this.background=document.createElement('canvas');this.bg=this.background.getContext('2d',{alpha:false})!;this.state=state;
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();this.set(state);this.raf=requestAnimationFrame(t=>this.frame(t));
 }
 set(state:PitchState){this.state=state;}
 private resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.width=Math.max(1,Math.round(rect.width*dpr));this.height=Math.max(1,Math.round(rect.height*dpr));this.canvas.width=this.background.width=this.width;this.canvas.height=this.background.height=this.height;this.drawBackground();}
 private drawBackground(){const c=this.bg;c.setTransform(this.width/900,0,0,this.height/540,0,0);
  const sky=c.createLinearGradient(0,0,0,220);sky.addColorStop(0,'#111e25');sky.addColorStop(1,'#203b3e');c.fillStyle=sky;c.fillRect(0,0,900,540);
  // Architectural stadium tiers. All decorative details are rasterized once on resize.
  c.fillStyle='#172c32';c.beginPath();c.moveTo(0,150);c.quadraticCurveTo(450,38,900,150);c.lineTo(900,219);c.lineTo(0,219);c.fill();
  for(let row=0;row<5;row++){const y=107+row*18;c.strokeStyle='rgba(198,212,195,.08)';c.lineWidth=2;c.beginPath();c.moveTo(0,y+35);c.quadraticCurveTo(450,y-22,900,y+35);c.stroke();for(let i=0;i<65;i++){const x=12+i*14;const dip=30*Math.pow((x-450)/450,2);c.fillStyle=(i*7+row*13)%8<2?'#677b75':(i+row)%3?'#324a4b':'#465857';c.fillRect(x,y+dip,3,3);}}
  for(const x of [75,825]){c.strokeStyle='#425354';c.lineWidth=4;c.beginPath();c.moveTo(x,45);c.lineTo(x,190);c.stroke();c.fillStyle='#d4e1d4';for(let j=0;j<4;j++)c.fillRect(x-25+j*15,44,10,7);const beam=c.createLinearGradient(x,50,450,310);beam.addColorStop(0,'rgba(210,234,215,.08)');beam.addColorStop(1,'rgba(210,234,215,0)');c.fillStyle=beam;c.beginPath();c.moveTo(x-20,52);c.lineTo(450+(x<450?180:-180),360);c.lineTo(x<450?20:880,290);c.closePath();c.fill();}
  c.fillStyle='#1c3933';c.fillRect(0,215,900,325);
  for(let i=0;i<8;i++){const top=215+Math.pow(i/8,1.5)*325,bottom=215+Math.pow((i+1)/8,1.5)*325;c.fillStyle=i%2?'#23453a':'#204034';c.fillRect(0,top,900,bottom-top);}
  const vignette=c.createRadialGradient(450,265,120,450,265,580);vignette.addColorStop(0,'rgba(8,25,22,0)');vignette.addColorStop(1,'rgba(8,20,23,.5)');c.fillStyle=vignette;c.fillRect(0,180,900,360);
  c.strokeStyle='rgba(222,232,209,.27)';c.lineWidth=2;c.beginPath();c.moveTo(154,240);c.lineTo(72,428);c.lineTo(828,428);c.lineTo(746,240);c.stroke();c.beginPath();c.moveTo(241,253);c.lineTo(216,322);c.lineTo(684,322);c.lineTo(659,253);c.stroke();c.beginPath();c.ellipse(450,427,126,29,0,0,Math.PI);c.stroke();
  c.fillStyle='#afbd9f';c.beginPath();c.ellipse(450,396,4,2,0,0,Math.PI*2);c.fill();
  // Goal, with a recessed net. Identical camera orientation for both roles.
  c.fillStyle='rgba(7,20,22,.57)';c.fillRect(257,139,386,150);c.strokeStyle='rgba(215,226,216,.20)';c.lineWidth=.9;
  for(let i=0;i<=18;i++){const x=257+i*(386/18);c.beginPath();c.moveTo(x,140);c.lineTo(x,289);c.stroke();}
  for(let i=0;i<=9;i++){const y=140+i*(149/9);c.beginPath();c.moveTo(257,y);c.lineTo(643,y);c.stroke();}
  c.strokeStyle='rgba(214,226,216,.28)';c.beginPath();c.moveTo(242,128);c.lineTo(257,139);c.moveTo(658,128);c.lineTo(643,139);c.moveTo(242,290);c.lineTo(257,279);c.moveTo(658,290);c.lineTo(643,279);c.stroke();
  c.strokeStyle='#dce6d7';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(242,293);c.lineTo(242,128);c.lineTo(658,128);c.lineTo(658,293);c.stroke();
  c.fillStyle='rgba(17,28,30,.82)';c.fillRect(241,297,418,28);c.font='600 12px system-ui';c.textAlign='center';c.letterSpacing='3px';c.fillStyle='#a9d3c4';c.fillText('MICRO',340,315);c.fillStyle='#e3b1a8';c.fillText('MACRO',560,315);c.letterSpacing='0px';
  c.fillStyle='rgba(6,17,19,.45)';c.fillRect(0,193,204,23);c.fillRect(696,193,204,23);c.font='600 9px system-ui';c.fillStyle='#859a94';c.fillText('EC487  /  THE PENALTY LAB',103,209);c.fillText('TWO SIDES. ONE GOAL.',797,209);
 }
 private player(x:number,y:number,scale:number,shirt:string,angle=0,keeper=false,t=0){const c=this.ctx;c.save();c.translate(x,y);c.scale(scale,scale);c.rotate(angle);
  c.fillStyle='rgba(3,17,17,.35)';c.beginPath();c.ellipse(0,42,23,6,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#16272b';c.lineWidth=10;c.lineCap='round';c.beginPath();c.moveTo(-8,23);c.lineTo(-11-Math.sin(t)*4,40);c.moveTo(8,23);c.lineTo(13+Math.sin(t)*4,40);c.stroke();
  c.strokeStyle='#e1e7d6';c.lineWidth=5;c.beginPath();c.moveTo(-11,39);c.lineTo(-15,42);c.moveTo(13,39);c.lineTo(17,42);c.stroke();
  c.strokeStyle=shirt;c.lineWidth=9;c.beginPath();c.moveTo(-12,-2);c.lineTo(keeper?-28:-20,keeper?-9+Math.sin(t)*2:18);c.moveTo(12,-2);c.lineTo(keeper?28:20,keeper?-9-Math.sin(t)*2:18);c.stroke();
  if(keeper){c.fillStyle='#eee5d2';for(const xx of [-29,29]){c.beginPath();c.arc(xx,-10,6,0,Math.PI*2);c.fill();}}
  c.fillStyle=shirt;c.beginPath();c.roundRect(-15,-8,30,31,[7,7,3,3]);c.fill();c.fillStyle='rgba(255,255,255,.11)';c.fillRect(-3,-7,6,30);c.fillStyle='#24333a';c.fillRect(-15,22,30,9);
  c.fillStyle='#c9a384';c.beginPath();c.arc(0,-20,10,0,Math.PI*2);c.fill();c.fillStyle='#253131';c.beginPath();c.arc(0,-23,10,Math.PI,Math.PI*2);c.fill();c.fillStyle='#f2efe0';c.font='bold 11px system-ui';c.textAlign='center';c.fillText(keeper?'1':'9',0,12);c.restore();}
 private ball(x:number,y:number,r:number,rotation:number){const c=this.ctx;c.save();c.translate(x,y);c.rotate(rotation);c.fillStyle='#eeeadd';c.beginPath();c.arc(0,0,r,0,7);c.fill();c.strokeStyle='#263c3d';c.lineWidth=1;c.stroke();c.fillStyle='#263c3d';c.beginPath();for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;const xx=Math.cos(a)*r*.48,yy=Math.sin(a)*r*.48;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.closePath();c.fill();for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;c.beginPath();c.moveTo(Math.cos(a)*r*.45,Math.sin(a)*r*.45);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.stroke();}c.restore();}
 private frame(t:number){
  if(this.disposed)return;this.raf=requestAnimationFrame(v=>this.frame(v));
  if(document.hidden){this.last=0;return;}
  if(this.last){window.__PENALTY_PERF__??={deltas:[],frames:0};const p=window.__PENALTY_PERF__;p.frames++;p.deltas.push(t-this.last);if(p.deltas.length>600)p.deltas.shift();}this.last=t;
  const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.drawImage(this.background,0,0);c.setTransform(this.width/900,0,0,this.height/540,0,0);
  const result=this.state.match?.result;
  const elapsed=result?(this.state.revealAt===0?10000:Math.max(0,Date.now()-(this.state.revealAt??Date.now()))):0;
  const shot=result?(this.reduced?1:Math.min(1,Math.max(0,(elapsed-360)/1050))):0;
  const plan=result?shotPlan(result):null,flight=Math.min(1,shot/.72);
  const keepSign=plan?.keeperSign??1,keepX=450+(plan?keepSign*110*flight:0),keepY=247+20*flight;
  // No mirroring: the authoritative keeper choice alone sets the dive direction.
  this.player(keepX,keepY,.85,'#d8b194',flight*keepSign*.95,true,this.reduced?0:t*.002);
  this.player(450+(result?Math.min(1,elapsed/360)*7:0),399-(result?Math.min(1,elapsed/360)*16:0),1.12,'#8dc5b6',0,false,this.reduced?0:t*.0015);
  if(result&&shot>0){
   const ball=shotPosition(result,shot),previous=shotPosition(result,Math.max(0,shot-.08));
   c.fillStyle='rgba(2,14,14,.25)';c.beginPath();c.ellipse(ball.x,419+(290-419)*flight,11-5*flight,4-2*flight,0,0,Math.PI*2);c.fill();
   c.strokeStyle='rgba(236,230,206,.25)';c.lineWidth=3;c.beginPath();c.moveTo(previous.x,previous.y);c.lineTo(ball.x,ball.y);c.stroke();
   this.ball(ball.x,ball.y,ball.radius,shot*10);
   if(ball.contact&&!this.reduced&&elapsed<1650){
    const impact=Math.max(0,1-(elapsed-1116)/530);c.strokeStyle=`rgba(237,230,201,${impact*.55})`;c.lineWidth=2;
    if(plan!.kind==='goal'){c.beginPath();c.ellipse(plan!.target.x,plan!.target.y,9+(1-impact)*35,8+(1-impact)*20,0,0,Math.PI*2);c.stroke();}
    if(plan!.kind==='post'||plan!.kind==='save'){for(let i=0;i<8;i++){const angle=i*Math.PI/4,len=8+(1-impact)*18;c.beginPath();c.moveTo(plan!.target.x+Math.cos(angle)*8,plan!.target.y+Math.sin(angle)*8);c.lineTo(plan!.target.x+Math.cos(angle)*len,plan!.target.y+Math.sin(angle)*len);c.stroke();}}
   }
  }else this.ball(450,419,10,0);
  if(result&&(this.reduced||elapsed>1480)){
   if(!this.state.win){c.fillStyle='rgba(9,19,24,.22)';c.fillRect(0,0,900,540);}
   if(this.state.win&&!this.reduced&&elapsed<2800){const p=Math.min(1,(elapsed-1480)/1300);for(let i=0;i<28;i++){const x=450+Math.sin(i*7.12)*p*330,y=205-Math.abs(Math.cos(i*3.7))*p*130+p*p*230;c.fillStyle=i%3?'#b1d4bb':'#e1b79f';c.globalAlpha=1-p;c.fillRect(x,y,4,7);}c.globalAlpha=1;}
   c.fillStyle=this.state.win?'#f4f0de':'#dce5dc';c.textAlign='center';c.font='italic 57px Georgia';c.fillText(outcomeLabel(result),450,102);
  }
 }
 destroy(){this.disposed=true;cancelAnimationFrame(this.raf);this.observer.disconnect();}
}

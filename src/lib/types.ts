export type Side = 'micro' | 'macro';
export type VisualOutcome = 'goal'|'save'|'post'|'wide'|'high';
export type Role = 'kicker' | 'keeper';
export type PlayerStatus = 'lobby' | 'waiting' | 'matched' | 'feedback' | 'finished' | 'away';
export interface Room {id:string;code:string;host:string;phase:'lobby'|'playing'|'paused'|'ended';entryOpen:boolean;showBenchmarks:boolean;practice:boolean;createdAt:number;nextSerial:number;version:number;}
export interface Player {id:string;uid:string;roomId:string;username:string;preference:Side;kicks:number;keeps:number;status:PlayerStatus;readyAt:number;lastSeen:number;activeMatch:string|null;pendingResult:string|null;feedbackSince:number|null;registeredAt:number;}
export interface PublicPlayer {id:string;username:string;preference:Side;kicks:number;keeps:number;status:PlayerStatus;}
export interface Result {kickerChoice:Side;keeperChoice:Side;kickerN:boolean;keeperN:boolean;probability:number;goal:boolean;visualOutcome:VisualOutcome;resolvedAt:number;}
export interface Match {id:string;roomId:string;serial:number;kicker:string;keeper:string;kickerPrepared:boolean;keeperPrepared:boolean;choiceStartsAt:number|null;lockedAt:number;deadline:number;status:'briefing'|'locked'|'resolved'|'cancelled';result:Result|null;reason:string|null;closedAt:number|null;}
export interface MatchView extends Match {kickerPlayer:PublicPlayer;keeperPlayer:PublicPlayer;kickerReady:boolean;keeperReady:boolean;ownChoice:Side|null;}
export interface Observation extends Match {kickerPlayer:PublicPlayer;keeperPlayer:PublicPlayer;}
export interface Snapshot {history?:Observation[];serverNow:number;room:Room;me:Player|null;match:MatchView|null;waiting:number;counts:Record<string,number>;diagnostics:{cancelled:number;unresolved:number;};}
export interface Statistics {serverNow:number;room:Room;players:PublicPlayer[];matches:Observation[];counts?:{connected:number;disconnected:number};}
export interface TeachingCard {id:string;title:string;text:string;}
export interface Transport {mode:'practice'|'local'|'supabase';code:string;join(name:string,preference:Side):Promise<Snapshot>;snapshot():Promise<Snapshot>;statistics():Promise<Statistics>;prepare(match:string):Promise<void>;submit(match:string,side:Side):Promise<void>;seen(match:string):Promise<void>;ready():Promise<void>;heartbeat():Promise<void>;subscribe(fn:()=>void):()=>void;host(action:string,value?:unknown):Promise<unknown>;export():Promise<string>;close():void;}
export class GameError extends Error {constructor(public code:string,message:string){super(message);this.name='GameError';}}

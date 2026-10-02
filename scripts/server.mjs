/** Two-human local integration server. NOT the production deployment target.
 * No opponents are fabricated. Use two independent browser profiles/contexts.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Engine} from '../build/lib/engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT??4173),bind=process.env.HOST??'127.0.0.1';
const stateFile=process.env.PENALTY_STATE_FILE??path.join(root,'.local-state.json');
let saved;try{saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{}
const engine=new Engine(Date.now,undefined,saved?.store);const sessions=new Map(saved?.sessions??[]);
const hostToken=process.env.PENALTY_LOCAL_HOST_TOKEN??saved?.hostToken??randomBytes(24).toString('base64url');
const hostId='local-instructor';if(!engine.store.rooms.length)engine.create(hostId,'LOCAL',true);
const clients=new Set();let persistTimer=null;
function persist(){const tmp=stateFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({store:engine.store,sessions:[...sessions],hostToken}),{mode:0o600});fs.renameSync(tmp,stateFile);}
function schedulePersist(){if(!persistTimer)persistTimer=setTimeout(()=>{persistTimer=null;persist();},100);}
function versions(){return engine.store.rooms.map(r=>`${r.id}:${r.version}`).join(',');}
function notify(before){if(before===versions())return;for(const c of clients){const r=engine.store.rooms.find(r=>r.code===c.code);if(r&&!c.res.destroyed)c.res.write(`data: ${JSON.stringify({version:r.version})}\n\n`);}schedulePersist();}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function auth(req){const token=String(req.headers.authorization??'').replace(/^Bearer /,'');const uid=sessions.get(token);if(!uid)throw Object.assign(new Error('A valid local session is required.'),{http:401});return uid;}
function isHost(req){const supplied=String(req.headers['x-local-host-token']??'');const a=Buffer.from(supplied),b=Buffer.from(hostToken);return a.length===b.length&&timingSafeEqual(a,b);}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw Object.assign(new Error('Request too large'),{http:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new Error('Malformed JSON');}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://${req.headers.host}`);
 // Same-origin browser requests only; this server is intended for loopback/private rehearsals.
 const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return json(res,403,{error:'Cross-origin requests are not accepted.'});
 try{
  if(url.pathname==='/api/session'&&req.method==='POST'){const token=randomBytes(32).toString('base64url');sessions.set(token,crypto.randomUUID());schedulePersist();return json(res,200,{token});}
  if(url.pathname==='/api/events'&&req.method==='GET'){const uid=auth(req),code=(url.searchParams.get('code')??'').toUpperCase();engine.player(uid,engine.room(code).id);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('data: {"connected":true}\n\n');const c={res,code};clients.add(c);req.on('close',()=>clients.delete(c));return;}
  if(url.pathname.startsWith('/api/')&&req.method==='POST'){
   const uid=auth(req),d=await body(req),before=versions();let result;const code=String(d.code??'').toUpperCase();
   try{switch(url.pathname.slice(5)){
    case 'join':result=engine.join(uid,code,d.username,d.preference);break;
    case 'snapshot':result=engine.snapshot(uid,code);break;
    case 'statistics':result=engine.statistics(isHost(req)?hostId:uid,code);break;
    case 'prepare':engine.prepare(uid,d.match);result={ok:true};break;
    case 'submit':engine.submit(uid,d.match,d.choice,d.requestId);result={ok:true};break;
    case 'seen':engine.seen(uid,d.match);result={ok:true};break;
    case 'ready':engine.ready(uid,code);result={ok:true};break;
    case 'heartbeat':engine.heartbeat(uid,code);result={ok:true};break;
    case 'host/create':if(!isHost(req))throw Object.assign(new Error('Instructor authorization required.'),{http:403});result=engine.create(hostId,code,d.value??true);break;
    case 'host':if(!isHost(req))throw Object.assign(new Error('Instructor authorization required.'),{http:403});result=engine.host(hostId,code,d.action,d.value);break;
    case 'export':if(!isHost(req))throw Object.assign(new Error('Instructor authorization required.'),{http:403});result={csv:engine.export(hostId,code)};break;
    default:return json(res,404,{error:'No such endpoint.'});
   }}finally{notify(before);schedulePersist();}
   return json(res,200,result);
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
  if(url.pathname==='/config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(`window.PENALTY_CONFIG={mode:'local',defaultRoom:'LOCAL'};`);}
  const rel=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);const full=path.resolve(root,'dist','.'+rel);if(!full.startsWith(path.join(root,'dist')+path.sep))return json(res,403,{error:'Forbidden'});
  if(!fs.existsSync(full)||!fs.statSync(full).isFile())return json(res,404,{error:'File not found'});
  const ext=path.extname(full),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'}[ext]??'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':ext==='.html'?'no-cache':'public,max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});if(req.method==='HEAD')res.end();else fs.createReadStream(full).pipe(res);
 }catch(e){json(res,e.http??(['host','membership'].includes(e.code)?403:400),{error:e.message,code:e.code??'request'});}
});
const ticker=setInterval(()=>{const before=versions();engine.tick();notify(before);},200);
const keepAlive=setInterval(()=>{for(const c of clients)if(!c.res.destroyed)c.res.write(': heartbeat\n\n');},15000);
server.listen(port,bind,()=>{persist();console.log(`\nPenalty Lab local two-human server\nAddress: http://${bind}:${server.address().port}\nRoom: LOCAL (waiting for instructor start)\nInstructor token: ${hostToken}\nState: ${stateFile}\n\nNo bots are created. Open two independent browser profiles to test multiplayer.\n`);});
function stop(){clearInterval(ticker);clearInterval(keepAlive);if(persistTimer)clearTimeout(persistTimer);persist();for(const c of clients)c.res.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';

const SESSION='__Host-cft005-session',TRANSACTION='__Host-cft005-transaction';
const random=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookie=(name,value,age,mode='Lax')=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${mode}; Max-Age=${age}`;
function cookies(req){
  const result=new Map();
  for(const part of (req.headers.cookie??'').split(';')) {
    const [name,...value]=part.trim().split('=');
    if(result.has(name)) throw new Error('E_COOKIE');
    result.set(name,value.join('='));
  }
  return result;
}
function send(res,status,body,extra={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",...extra});
  res.end(typeof body==='string'?body:JSON.stringify(body));
}
async function read(req,limit=16384) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('E_BODY');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
const PAGE='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>CFT-005 — Backend de teste</title><h1>Backend isolado de teste</h1><p>Somente contas e dados sintéticos autorizados.</p><a href="/auth/login">Entrar</a><button id="read">Ler registro de teste</button><button id="leave">Sair apenas daqui</button><pre id="status" role="status">Verificando…</pre><script src="/client.js" defer></script></html>';
const SCRIPT=`let session;const status=document.getElementById('status');async function check(){const r=await fetch('/session');session=r.ok?await r.json():null;status.textContent=session?'Produto '+session.product+' · '+session.user:'Sem sessão local';}document.getElementById('read').onclick=async()=>{if(!session)return;const r=await fetch('/api/products/'+session.product+'/records/'+session.user);status.textContent=JSON.stringify(await r.json());};document.getElementById('leave').onclick=async()=>{if(!session)return;await fetch('/logout',{method:'POST',headers:{'X-CFT005-CSRF':session.csrf}});await check();};check().catch(()=>{status.textContent='Falha na verificação';});`;

/** Single-instance test BFF. Resource data and credential-bearing sessions stay private. */
export async function startBackend(cfg,provider,{host='127.0.0.1',port=0}={}) {
  const sessions=new Map(),transactions=new Map(),records=new Map();
  for(const label of Object.values(cfg.subjects)) records.set(label,`synthetic-${label}-${cfg.product}`);
  const server=createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:16384},async(req,res)=>{
    const fail=(status,error)=>send(res,status,{error});
    try {
      if(req.headers.host!==new URL(cfg.origin).host)return fail(400,'invalid_host');
      // Browser-provided bearer tokens are never a way to create or select a BFF session.
      if(req.headers.authorization)return fail(401,'browser_bearer_forbidden');
      const url=new URL(req.url,cfg.origin);
      if(url.origin!==cfg.origin||url.search||url.hash)return fail(400,'invalid_url');
      const now=Math.floor(Date.now()/1000);
      for(const [key,value]of sessions)if(value.exp<=now)sessions.delete(key);
      for(const [key,value]of transactions)if(value.exp<=now)transactions.delete(key);
      const jar=cookies(req);
      const sid=jar.get(SESSION),session=sessions.get(sid);
      if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ready:true,product:cfg.product});
      if(req.method==='GET'&&url.pathname==='/')return send(res,200,PAGE,{'Content-Type':'text/html; charset=utf-8'});
      if(req.method==='GET'&&url.pathname==='/client.js')return send(res,200,SCRIPT,{'Content-Type':'text/javascript; charset=utf-8'});
      if(req.method==='GET'&&url.pathname==='/auth/login'){
        if(transactions.size>=512)return fail(503,'capacity');
        if(sid)sessions.delete(sid);
        transactions.delete(jar.get(TRANSACTION));
        const transaction=await provider.begin();const tx=random();
        transactions.set(tx,{...transaction,exp:now+300});
        return send(res,303,{redirecting:true},{Location:transaction.url,'Set-Cookie':[
          cookie(TRANSACTION,tx,300,'None'),cookie(SESSION,'',0)]});
      }
      if(url.pathname==='/auth/callback'){
        // form_post keeps authorization codes out of callback URLs and access-log paths.
        if(req.method!=='POST'||req.headers['content-type']!=='application/x-www-form-urlencoded')return fail(400,'form_post_required');
        const tx=jar.get(TRANSACTION),transaction=transactions.get(tx);
        transactions.delete(tx); // consume before awaiting the token endpoint
        const clear=cookie(TRANSACTION,'',0,'None');
        if(!transaction)return send(res,303,{error:'login_failed'},{Location:'/', 'Set-Cookie':clear});
        try {
          const body=await read(req);
          const principal=await provider.complete(transaction,new Request(cfg.origin+'/auth/callback',{
            method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));
          if(!Object.hasOwn(cfg.subjects,principal.subject)||cfg.subjects[principal.subject]!==principal.label)throw new Error('E_SUBJECT');
          if(sessions.size>=512)throw new Error('E_CAPACITY');
          const fresh=random();const exp=Math.min(principal.expiresAt,now+900);
          if(exp<=now)throw new Error('E_EXPIRED');
          sessions.set(fresh,{token:principal.accessToken,label:principal.label,subject:principal.subject,csrf:random(),exp});
          return send(res,303,{authenticated:true},{Location:'/', 'Set-Cookie':[clear,cookie(SESSION,fresh,exp-now)]});
        }catch{return send(res,303,{error:'login_failed'},{Location:'/', 'Set-Cookie':clear});}
      }
      if(!session)return fail(401,'session_required');
      // Local cleanup remains possible if provider verification is temporarily unavailable.
      if(req.method==='POST'&&url.pathname==='/logout'){
        if(req.headers.origin!==cfg.origin||!same(req.headers['x-cft005-csrf'],session.csrf))return fail(403,'csrf_required');
        sessions.delete(sid);return send(res,200,{signedOut:true},{'Set-Cookie':cookie(SESSION,'',0)});
      }
      const principal=await provider.authorize(session.token,req.method==='GET'?'records:read':'records:write');
      if(principal.subject!==session.subject||principal.label!==session.label)throw new Error('E_SESSION');
      if(req.method==='GET'&&url.pathname==='/session')return send(res,200,{product:cfg.product,user:session.label,csrf:session.csrf});
      if(req.method!=='GET'){
        // Origin and CSRF supplement the authenticated server session; neither grants access.
        if(req.headers.origin!==cfg.origin||!same(req.headers['x-cft005-csrf'],session.csrf))return fail(403,'csrf_required');
      }
      const route=/^\/api\/products\/([AB])\/records\/(U[12])$/.exec(url.pathname);
      if(!route)return fail(404,'not_found');
      if(route[1]!==cfg.product)return fail(403,'product_forbidden');
      if(route[2]!==session.label||!records.has(route[2]))return fail(404,'not_found');
      if(req.method==='PUT'){
        if(req.headers['content-type']!=='application/json')return fail(415,'json_required');
        let input;try{input=JSON.parse(await read(req,4096));}catch{return fail(400,'invalid_body');}
        if(!input||Array.isArray(input)||Object.keys(input).length!==1||typeof input.value!=='string'||input.value.length>128)return fail(400,'invalid_body');
        records.set(session.label,input.value);
      }else if(req.method!=='GET')return fail(405,'method_forbidden');
      return send(res,200,{record:{id:session.label+'-'+cfg.product,value:records.get(session.label)}});
    }catch{
      // Never print or reflect request URLs, headers, bodies, tokens or provider errors.
      return fail(401,'unauthorized');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return Object.freeze({port:server.address().port,close:()=>new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());server.closeAllConnections();
  })});
}

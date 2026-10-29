import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {PROOF_ORIGINS} from './config.mjs';
import {createMemoryFixtureStore} from './record-store.mjs';
import {runTechnicalProof} from './technical-proof.mjs';

const SESSION='__Host-cft005-session',TRANSACTION='__Host-cft005-transaction';
const LOGIN_STAGES=new Set(['client_authentication','code_exchange','provider_denied','provider_connection','oidc_response_validation',
  'id_token_validation','subject_allowlist','access_token_profile','access_token_scope','access_token_client','access_token_validation',
  'subject_binding','session_creation']);
const DENIAL_PHASES=new Set(['token_endpoint','authorization_response','unknown']);
const DENIAL_REASONS=new Set(['unauthorized','api_client_grant','api_identifier','client_connection','account_blocked','consent','email_policy','unspecified']);
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
const PAGE='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>CFT-005 — Backend de teste</title><h1>Backend isolado de teste</h1><p>Somente contas e dados sintéticos autorizados.</p><p>A prova altera somente seu registro sintético. Os resultados sanitizados ficam disponíveis para auditoria.</p><a href="/auth/login">Entrar</a><button id="read">Ler registro de teste</button><button id="proof">Executar prova de isolamento</button><button id="technical">Executar verificação técnica</button><button id="leave">Sair apenas daqui</button><pre id="status" role="status">Verificando…</pre><script src="/client.js" defer></script></html>';
const SCRIPT=`let session;const status=document.getElementById('status');const messages={transaction_cookie_missing:'O navegador não devolveu o cookie temporário de entrada.',transaction_missing:'A tentativa expirou ou o serviço reiniciou; entre novamente.',callback_format:'O retorno de entrada veio em formato inesperado.',client_authentication:'O provedor recusou a credencial deste serviço.',code_exchange:'O provedor recusou a troca do código de entrada.',provider_denied:'A entrada foi cancelada ou recusada no provedor.',provider_connection:'Não foi possível contatar o provedor.',oidc_response_validation:'O retorno do provedor não passou na validação OIDC.',id_token_validation:'A identidade recebida não passou na validação.',subject_allowlist:'A conta recebida não corresponde às contas de teste autorizadas.',access_token_profile:'O perfil do token recebido não corresponde ao previsto.',access_token_scope:'A permissão de leitura não veio no token.',access_token_client:'O token pertence ao outro cliente de teste.',access_token_validation:'O token de acesso não passou na validação.',subject_binding:'A identidade não corresponde ao token de acesso.',session_creation:'Não foi possível criar a sessão local.'};async function check(){const r=await fetch('/session');session=r.ok?await r.json():null;status.textContent=session?'Produto '+session.product+' · '+session.user:'Sem sessão local';if(!session){const d=await(await fetch('/auth/status')).json();if(d.last?.result==='FAIL'){status.textContent+=' — '+(messages[d.last.stage]||'A entrada não foi confirmada.');if(d.last.phase==='token_endpoint')status.textContent+=' Etapa: troca do código no servidor.';if(d.last.phase==='authorization_response')status.textContent+=' Etapa: autorização no provedor.';}}}document.getElementById('read').onclick=async()=>{if(!session)return;const r=await fetch('/api/products/'+session.product+'/records/'+session.user);status.textContent=JSON.stringify(await r.json());};document.getElementById('proof').onclick=async()=>{if(!session)return;status.textContent='Executando prova entre os servidores…';try{const r=await fetch('/proof/run',{method:'POST',headers:{'X-CFT005-CSRF':session.csrf}});status.textContent=JSON.stringify(await r.json(),null,2);}catch{status.textContent='Falha na prova; tente novamente';}};document.getElementById('technical').onclick=async()=>{if(!session)return;status.textContent='Executando verificação técnica…';try{const r=await fetch('/proof/technical/run',{method:'POST',headers:{'X-CFT005-CSRF':session.csrf}});status.textContent=JSON.stringify(await r.json(),null,2);}catch{status.textContent='Falha na verificação técnica; informe ao executor antes de repetir';}};document.getElementById('leave').onclick=async()=>{if(!session)return;await fetch('/logout',{method:'POST',headers:{'X-CFT005-CSRF':session.csrf}});await check();};check().catch(()=>{status.textContent='Falha na verificação';});`;

/** Single-instance test BFF. Resource data and credential-bearing sessions stay private. */
export async function startBackend(cfg,provider,{host='127.0.0.1',port=0,fetchProofForTest,recordStore}={}) {
  if(!recordStore&&host!=='127.0.0.1')throw new Error('E_DATABASE_REQUIRED');
  const store=recordStore??createMemoryFixtureStore(cfg);
  await store.ready();
  const sessions=new Map(),transactions=new Map(),receipts=[],technicalReceipts=[];
  const loginStatus={started:0,callbacks:0,successes:0,failures:0,last:null};
  const noteLogin=(result,stage,detail)=>{
    if(result==='PASS')loginStatus.successes++;
    if(result==='FAIL')loginStatus.failures++;
    loginStatus.last={at:new Date().toISOString(),result,stage};
    if(stage==='provider_denied'&&DENIAL_PHASES.has(detail?.phase)&&DENIAL_REASONS.has(detail?.reason)){
      loginStatus.last.phase=detail.phase;loginStatus.last.reason=detail.reason;
    }
  };
  const proofFetch=fetchProofForTest??fetch;
  let proofRunning=false;
  const server=createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:16384},async(req,res)=>{
    const fail=(status,error)=>send(res,status,{error});
    try {
      if(req.headers.host!==new URL(cfg.origin).host)return fail(400,'invalid_host');
      const url=new URL(req.url,cfg.origin);
      if(url.origin!==cfg.origin||url.search||url.hash)return fail(400,'invalid_url');
      // Data-free probe: validates the same JWT policy, never creates a session or accesses records.
      if(url.pathname==='/proof/token-policy'){
        if(req.method!=='POST'||req.headers['content-type']!=='application/json')return fail(405,'method_forbidden');
        const authorization=req.headers.authorization??'';
        if(!authorization.startsWith('Bearer ')||authorization.length>12000)return fail(401,'unauthorized');
        let body;try{body=JSON.parse(await read(req,256));}catch{return fail(400,'invalid_body');}
        if(!body||Object.keys(body).length!==1||!['records:read','records:write'].includes(body.permission))return fail(400,'invalid_body');
        try{
          await provider.authorize(authorization.slice(7),body.permission);
          return send(res,200,{authorized:true,product:cfg.product});
        }catch(error){return fail(401,error.message==='E_PRODUCT'?'other_client_after_signature_verification':'unauthorized');}
      }
      // Bearer tokens cannot create/select a session or reach any data route.
      if(req.headers.authorization)return fail(401,'browser_bearer_forbidden');
      const now=Math.floor(Date.now()/1000);
      for(const [key,value]of sessions)if(value.exp<=now)sessions.delete(key);
      for(const [key,value]of transactions)if(value.exp<=now)transactions.delete(key);
      const jar=cookies(req);
      const sid=jar.get(SESSION),session=sessions.get(sid);
      if(req.method==='GET'&&url.pathname==='/health'){await store.ready();return send(res,200,{ready:true,product:cfg.product,storage:store.kind});}
      if(req.method==='GET'&&url.pathname==='/')return send(res,200,PAGE,{'Content-Type':'text/html; charset=utf-8'});
      if(req.method==='GET'&&url.pathname==='/client.js')return send(res,200,SCRIPT,{'Content-Type':'text/javascript; charset=utf-8'});
      // Fixed diagnostic categories only, shared by this synthetic test instance. No raw errors or identifiers.
      if(req.method==='GET'&&url.pathname==='/auth/status')return send(res,200,{product:cfg.product,...loginStatus});
      // Public audit summaries contain only synthetic labels, timestamps and verdicts; no records or credentials.
      if(req.method==='GET'&&url.pathname==='/proof/results')return send(res,200,{product:cfg.product,receipts});
      if(req.method==='GET'&&url.pathname==='/proof/technical/results')return send(res,200,{product:cfg.product,receipts:technicalReceipts});
      if(req.method==='GET'&&['/auth/login','/auth/login/choose'].includes(url.pathname)){
        if(transactions.size>=512)return fail(503,'capacity');
        if(sid)sessions.delete(sid);
        transactions.delete(jar.get(TRANSACTION));
        const transaction=await provider.begin({reauthenticate:url.pathname==='/auth/login/choose'});const tx=random();
        transactions.set(tx,{...transaction,exp:now+300});
        loginStatus.started++;noteLogin('PENDING','redirect_started');
        return send(res,303,{redirecting:true},{Location:transaction.url,'Set-Cookie':[
          cookie(TRANSACTION,tx,300,'None'),cookie(SESSION,'',0)]});
      }
      if(url.pathname==='/auth/callback'){
        // form_post keeps authorization codes out of callback URLs and access-log paths.
        loginStatus.callbacks++;
        if(req.method!=='POST'||req.headers['content-type']!=='application/x-www-form-urlencoded'){
          noteLogin('FAIL','callback_format');return fail(400,'form_post_required');
        }
        const tx=jar.get(TRANSACTION),transaction=transactions.get(tx);
        transactions.delete(tx); // consume before awaiting the token endpoint
        const clear=cookie(TRANSACTION,'',0,'None');
        if(!transaction){noteLogin('FAIL',tx?'transaction_missing':'transaction_cookie_missing');return send(res,303,{error:'login_failed'},{Location:'/', 'Set-Cookie':clear});}
        try {
          const body=await read(req);
          const principal=await provider.complete(transaction,new Request(cfg.origin+'/auth/callback',{
            method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));
          if(!Object.hasOwn(cfg.subjects,principal.subject)||cfg.subjects[principal.subject]!==principal.label)throw new Error('E_SUBJECT');
          if(sessions.size>=512)throw new Error('E_CAPACITY');
          const fresh=random();const exp=Math.min(principal.expiresAt,now+900);
          if(exp<=now)throw new Error('E_EXPIRED');
          sessions.set(fresh,{token:principal.accessToken,label:principal.label,subject:principal.subject,csrf:random(),exp});
          noteLogin('PASS','authenticated');
          return send(res,303,{authenticated:true},{Location:'/', 'Set-Cookie':[clear,cookie(SESSION,fresh,exp-now)]});
        }catch(error){noteLogin('FAIL',LOGIN_STAGES.has(error.loginStage)?error.loginStage:'session_creation',error.loginDetail);return send(res,303,{error:'login_failed'},{Location:'/', 'Set-Cookie':clear});}
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
      if(req.method==='POST'&&url.pathname==='/proof/technical/run'){
        if(proofRunning||now-(session.lastTechnical??0)<15)return fail(429,'proof_busy');
        proofRunning=true;session.lastTechnical=now;
        let receipt;
        try{receipt=await runTechnicalProof({cfg,principal,session,sid,store,proofFetch});}
        finally{proofRunning=false;}
        technicalReceipts.push(receipt);if(technicalReceipts.length>8)technicalReceipts.shift();
        return send(res,200,receipt);
      }
      if(req.method==='POST'&&url.pathname==='/proof/run'){
        if(proofRunning||now-(session.lastProof??0)<15)return fail(429,'proof_busy');
        proofRunning=true;session.lastProof=now;
        const receipt={startedAt:new Date().toISOString(),product:cfg.product,user:session.label,storage:store.kind,cases:[],otherOwnerPreservation:'Requires independent recheck by the other authenticated owner'};
        const observe=(id,expected,actual,extra={})=>receipt.cases.push({id,expected,actual,result:expected===actual?'PASS':'FAIL',...extra});
        const other=cfg.product==='A'?'B':'A',otherUser=session.label==='U1'?'U2':'U1';
        try{
          for(const permission of ['records:read','records:write']){
            await provider.authorize(session.token,permission);
            observe('OWN-TOKEN-'+permission,200,200);
          }
          // Actual HTTP routes, using only this session and a fixed destination.
          for(const [id,method,product,user,expected]of [
            ['OWN-READ','GET',cfg.product,session.label,200],['OWN-WRITE','PUT',cfg.product,session.label,200],
            ['OTHER-USER-READ','GET',cfg.product,otherUser,404],['OTHER-USER-WRITE','PUT',cfg.product,otherUser,404],
            ['OTHER-PRODUCT-READ','GET',other,session.label,403],['OTHER-PRODUCT-WRITE','PUT',other,session.label,403]
          ]){
            const response=await proofFetch(PROOF_ORIGINS[cfg.product]+`/api/products/${product}/records/${user}`,{
              method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Cookie:SESSION+'='+sid,Origin:cfg.origin,
                'X-CFT005-CSRF':session.csrf,'Content-Type':'application/json'},
              ...(method==='PUT'?{body:JSON.stringify({value:`synthetic-proof-${session.label}-${cfg.product}`})}:{})});
            const dbChecked=response.headers.get('x-cft005-row-check')==='evaluated';
            observe(id,expected,response.status,...(store.kind==='postgres'&&product===cfg.product?[{databaseRowCheck:dbChecked}]:[]));
            if(store.kind==='postgres'&&product===cfg.product&&!dbChecked)receipt.cases.at(-1).result='FAIL';
            await response.body?.cancel();
          }
          for(const permission of ['records:read','records:write']){
            const response=await proofFetch(cfg.proofPeerOrigin+'/proof/token-policy',{
              method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},
              body:JSON.stringify({permission})});
            const result=await response.json();
            observe('PEER-TOKEN-'+permission,401,response.status,{bindingVerified:result.error==='other_client_after_signature_verification'});
            if(result.error!=='other_client_after_signature_verification')receipt.cases.at(-1).result='FAIL';
          }
          const own=await store.read(principal,session.label);
          observe('OWN-RECORD-PERSISTED',true,own?.value===`synthetic-proof-${session.label}-${cfg.product}`);
          if(store.kind==='postgres')for(const input of [{value:'forbidden',owner:'U2'},{value:'forbidden',product:other}]){
            const response=await proofFetch(PROOF_ORIGINS[cfg.product]+`/api/products/${cfg.product}/records/${session.label}`,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Cookie:SESSION+'='+sid,Origin:cfg.origin,'X-CFT005-CSRF':session.csrf,'Content-Type':'application/json'},body:JSON.stringify(input)});
            observe('FORGED-'+('owner'in input?'OWNER':'PRODUCT')+'-BODY',400,response.status);await response.body?.cancel();
          }
        }catch{receipt.cases.push({id:'TRANSPORT-OR-POLICY',result:'BLOCKED'});}
        finally{proofRunning=false;}
        receipt.finishedAt=new Date().toISOString();
        receipt.result=receipt.cases.some(c=>c.result==='FAIL')?'FAIL':receipt.cases.some(c=>c.result==='BLOCKED')?'BLOCKED':'PASS';
        receipts.push(receipt);if(receipts.length>8)receipts.shift();
        return send(res,200,receipt);
      }
      const route=/^\/api\/products\/([AB])\/records\/(U[12])$/.exec(url.pathname);
      if(!route)return fail(404,'not_found');
      if(route[1]!==cfg.product)return fail(403,'product_forbidden');
      const storageHeaders={'X-CFT005-Store':store.kind,'X-CFT005-Row-Check':'evaluated'};
      // Owner context is the cryptographically verified principal. The requested
      // label only selects a row; PostgreSQL RLS evaluates cross-user requests.
      if(req.method==='PUT'){
        const invalid=async(status,error)=>await store.read(principal,route[2])?fail(status,error):send(res,404,{error:'not_found'},storageHeaders);
        if(req.headers['content-type']!=='application/json')return invalid(415,'json_required');
        let input;try{input=JSON.parse(await read(req,4096));}catch{return invalid(400,'invalid_body');}
        if(!input||Array.isArray(input)||Object.keys(input).length!==1||typeof input.value!=='string'||input.value.length>128)return invalid(400,'invalid_body');
        const updated=await store.write(principal,route[2],input.value);
        if(!updated)return send(res,404,{error:'not_found'},storageHeaders);
        return send(res,200,{record:updated},storageHeaders);
      }else if(req.method!=='GET')return fail(405,'method_forbidden');
      const record=await store.read(principal,route[2]);
      if(!record)return send(res,404,{error:'not_found'},storageHeaders);
      return send(res,200,{record},storageHeaders);
    }catch(error){
      // Never print or reflect request URLs, headers, bodies, tokens or provider errors.
      return fail(error?.storeFailure?503:401,error?.storeFailure?'database_unavailable':'unauthorized');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return Object.freeze({port:server.address().port,close:()=>new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):store.close().then(resolve,reject));server.closeAllConnections();
  })});
}

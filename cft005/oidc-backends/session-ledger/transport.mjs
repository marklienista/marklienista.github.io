import {request as httpsRequest} from 'node:https';
import {createServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {destination,signCommand,validEpoch,verifyCommand} from './protocol.mjs';
import {executeCommand} from './transactions.mjs';
const target=new URL(destination),version=1;
const unavailable=()=>new Error('E_LEDGER_UNAVAILABLE');
const denied=()=>Object.assign(new Error('E_LEDGER_DENIED'),{ledgerDenied:true});
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
export function createLedgerClient({product,privateKey},{requestForTest}={}){
  if(!['A','B'].includes(product)||privateKey?.type!=='private'||privateKey.asymmetricKeyType!=='ed25519')throw unavailable();
  async function invoke(body){
    const command=signCommand({product,privateKey,body});
    const payload=Buffer.from(JSON.stringify(command));
    const request=requestForTest??httpsRequest;
    let response;
    try{response=await new Promise((resolve,reject)=>{
      const req=request(destination,{method:'POST',agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',
        headers:{'Content-Type':'application/json','Content-Length':payload.length},signal:AbortSignal.timeout(8000)},res=>{
        const chunks=[];let size=0;
        res.on('data',c=>{size+=c.length;if(size>4096){res.destroy();reject(unavailable());}else chunks.push(c);});
        res.on('error',()=>reject(unavailable()));res.on('end',()=>{try{resolve({status:res.statusCode,contentType:res.headers['content-type'],body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(unavailable());}});
      });req.on('error',()=>reject(unavailable()));req.end(payload);
    });}catch{throw unavailable();}
    const r=response.body;
    // No redirects, retries or positive cache. TLS authenticates the fixed server;
    // nonce and issuer bind the response to this specific signed request.
    if(response.contentType!=='application/json; charset=utf-8'||!exact(r,['version','issuer','nonce','result'])||r.version!==version||r.issuer!==product||r.nonce!==command.envelope.nonce)throw unavailable();
    if(response.status===401&&exact(r.result,['error'])&&r.result.error==='session_denied')throw denied();
    if(response.status!==200)throw unavailable();
    const result=r.result;
    if(body.action==='snapshot'){
      if(!exact(result,['action','epochs'])||result.action!=='snapshot'||!exact(result.epochs,['U1','U2'])||!validEpoch(result.epochs.U1)||!validEpoch(result.epochs.U2))throw unavailable();
      return Object.freeze({...result,epochs:Object.freeze({...result.epochs})});
    }
    const epoch=body.action==='revoke'?body.epoch+1:body.epoch;
    if(!exact(result,['action','epoch'])||result.action!==body.action||!validEpoch(result.epoch)||result.epoch!==epoch)throw unavailable();
    return Object.freeze({...result});
  }
  const action=(name,b)=>invoke({action:name,...b});
  return Object.freeze({snapshot:()=>invoke({action:'snapshot'}),register:b=>action('register',b),
    authorize:({product:requested,...b})=>{if(requested!==product)throw denied();return action('authorize',b);},
    logout:b=>action('logout',b),revoke:b=>action('revoke',b)});
}
async function ready(pool){
  const r=await pool.query(`SELECT current_database()='cft005_hml_db_teste' AND current_user='cft005_hml_coordinator' AND session_user=current_user AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AND (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AND
    (SELECT count(*)=3 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='cft005_hml_session_owner') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cft005_hml_auth' AND c.relkind='r') AS ok FROM pg_roles r WHERE rolname=current_user`);
  if(r.rows[0]?.ok!==true)throw unavailable();
}
export async function startCoordinator({pool,publicKeys},{host='127.0.0.1',port=0,tlsForTest,closePool=true,operatorEnabled=false}={}){
  // Reject malformed/shared key configuration before accepting traffic.
  if(!['A','B'].every(p=>publicKeys?.[p]?.type==='public'&&publicKeys[p].asymmetricKeyType==='ed25519')||publicKeys.A.export({type:'spki',format:'der'}).equals(publicKeys.B.export({type:'spki',format:'der'})))throw unavailable();
  if(tlsForTest&&host!=='127.0.0.1')throw unavailable();
  await ready(pool);
  const handler=async(req,res)=>{
    const send=(status,result)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer'});res.end(JSON.stringify(result));};
    let e;
    try{
      if(req.headers.host!==target.host)return send(400,{error:'invalid_host'});
      if(operatorEnabled&&req.url==='/v1/operator/keys'&&req.method==='GET')return send(200,{version:1,A:publicKeys.A.export({type:'spki',format:'der'}).toString('base64'),B:publicKeys.B.export({type:'spki',format:'der'}).toString('base64')});
      if(req.url==='/health'&&req.method==='GET'){await ready(pool);return send(200,{ready:true,ledgerVersion:version});}
      if(req.url!==target.pathname||req.method!=='POST')return send(404,{error:'not_found'});
      if(req.headers['content-type']!=='application/json'||req.headers.authorization||req.headers.cookie)return send(401,{error:'invalid_command'});
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4096)return send(413,{error:'invalid_command'});chunks.push(c);}
      let command;try{command=JSON.parse(Buffer.concat(chunks).toString('utf8'));e=verifyCommand(command,{publicKeys,method:req.method,requestUrl:destination});}catch{return send(401,{error:'invalid_command'});}
      const result=await executeCommand(pool,command,{publicKeys,method:req.method,requestUrl:destination});
      return send(200,{version,issuer:e.issuer,nonce:e.nonce,result});
    }catch(error){
      const result={error:error?.ledgerDenied?'session_denied':'ledger_unavailable'};
      return send(error?.ledgerDenied?401:503,e?{version,issuer:e.issuer,nonce:e.nonce,result}:result);
    }
  };
  const server=tlsForTest?createHttpsServer({...tlsForTest,requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192},handler):createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192},handler);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return Object.freeze({port:server.address().port,close:()=>new Promise((resolve,reject)=>{server.close(async e=>{try{if(closePool)await pool.end();e?reject(e):resolve();}catch{reject(unavailable());}});server.closeAllConnections();})});
}

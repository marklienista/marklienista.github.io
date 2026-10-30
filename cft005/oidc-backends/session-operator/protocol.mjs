import {randomBytes,sign,verify,createPublicKey} from 'node:crypto';
import {PROOF_ORIGINS} from '../config.mjs';
export const operatorAudience='CFT005-HML-SESSION-OPERATOR-1';
export const operatorPath='/proof/sessions/peer';
export const keyUrl='https://cft005-session-ledger-teste.onrender.com/v1/operator/keys';
export const exact=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const opaque=()=>randomBytes(32).toString('hex');
export const failure=()=>new Error('E_OPERATOR_UNAVAILABLE');
function body(b){
  const keys=b?.action==='reserve'?['action','kind','run']:['action','run','lease'];
  if(!exact(b,keys)||!hash(b.run)||!['reserve','revoke','collect','finalize','release'].includes(b.action)||
    (b.action==='reserve'?!['logout','race'].includes(b.kind):!hash(b.lease)))throw failure();
  return Object.fromEntries(keys.map(k=>[k,b[k]]));
}
function normalized(e,now){
  if(!exact(e,['version','audience','issuer','target','destination','source','iat','exp','nonce','body'])||e.version!==1||e.audience!==operatorAudience||
    !['A','B'].includes(e.issuer)||e.target!==(e.issuer==='A'?'B':'A')||e.destination!==PROOF_ORIGINS[e.target]+operatorPath||
    !/^[a-f0-9]{40}$/.test(e.source)||!Number.isSafeInteger(e.iat)||!Number.isSafeInteger(e.exp)||e.iat>now+5||e.exp<=now||e.exp-e.iat!==30||now-e.iat>35||!hash(e.nonce))throw failure();
  return {version:1,audience:operatorAudience,issuer:e.issuer,target:e.target,destination:e.destination,source:e.source,iat:e.iat,exp:e.exp,nonce:e.nonce,body:body(e.body)};
}
const bytes=e=>Buffer.from(operatorAudience+'\nPOST\n'+JSON.stringify(e));
export function signOperator({product,source,privateKey,body:b,now=Math.floor(Date.now()/1000)}){
  const target=product==='A'?'B':'A';
  const e=normalized({version:1,audience:operatorAudience,issuer:product,target,destination:PROOF_ORIGINS[target]+operatorPath,source,iat:now,exp:now+30,nonce:opaque(),body:b},now);
  if(privateKey?.type!=='private'||privateKey.asymmetricKeyType!=='ed25519')throw failure();
  return {envelope:e,signature:sign(null,bytes(e),privateKey).toString('base64url')};
}
export function verifyOperator(packet,{product,source,publicKeys,now=Math.floor(Date.now()/1000)}){
  if(!exact(packet,['envelope','signature'])||typeof packet.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(packet.signature))throw failure();
  const e=normalized(packet.envelope,now),key=publicKeys?.[e.issuer];
  if(e.target!==product||e.source!==source||key?.type!=='public'||key.asymmetricKeyType!=='ed25519'||!verify(null,bytes(e),key,Buffer.from(packet.signature,'base64url')))throw failure();
  return e;
}
export async function boundedJson(r,limit=4096){
  if(r.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!r.body)throw failure();
  const reader=r.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw failure();chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{await reader.cancel().catch(()=>{});throw failure();}finally{reader.releaseLock();}
}
export function validateOperatorKeys(privateKey,product,keys){
  if(!['A','B'].includes(product)||!['A','B'].every(p=>keys?.[p]?.type==='public'&&keys[p].asymmetricKeyType==='ed25519')||privateKey?.type!=='private'||privateKey.asymmetricKeyType!=='ed25519')throw failure();
  const exported=k=>k.export({format:'der',type:'spki'});
  if(exported(keys.A).equals(exported(keys.B))||!exported(keys[product]).equals(exported(createPublicKey(privateKey))))throw failure();
  return keys;
}
export async function loadOperatorKeys(privateKey,product,{fetchForTest}={}){
  const r=await (fetchForTest??fetch)(keyUrl,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw failure();const j=await boundedJson(r,2048);
  if(!exact(j,['version','A','B'])||j.version!==1)throw failure();
  const keys={};for(const p of ['A','B']){
    if(typeof j[p]!=='string'||j[p].length>128)throw failure();
    try{keys[p]=createPublicKey({key:Buffer.from(j[p],'base64'),format:'der',type:'spki'});}catch{throw failure();}
    if(keys[p].asymmetricKeyType!=='ed25519')throw failure();
  }
  return validateOperatorKeys(privateKey,product,keys);
}
export function operatorEnabled(env){
  if(env.HML_CONTROLLED_SESSION_PROOF===undefined||env.HML_CONTROLLED_SESSION_PROOF==='')return false;
  if(env.HML_CONTROLLED_SESSION_PROOF!=='enabled-v1')throw failure();
  return true;
}

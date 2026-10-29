// HML command protocol. No environment, network, credential or browser access.
import {createHash,randomBytes,sign,verify} from 'node:crypto';

export const audience='CFT005-HML-LEDGER-1';
export const path='/v1/command';
// Fixed HML destination; never selected by browser input or environment.
export const destination='https://cft005-session-ledger-teste.onrender.com'+path;
const fail=()=>{throw new Error('E_LEDGER_COMMAND');};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
export const validEpoch=n=>Number.isSafeInteger(n)&&n>=1;
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function checkedBody(b){
  if(!plain(b))fail();
  if(b.action==='snapshot'){if(!exact(b,['action']))fail();return {action:b.action};}
  const keys=['action','owner','sessionHash','epoch'];
  if(b.action==='register')keys.push('expiresAt');
  if(!['register','authorize','logout','revoke'].includes(b.action)||!exact(b,keys)||!['U1','U2'].includes(b.owner)||!hash(b.sessionHash)||!validEpoch(b.epoch))fail();
  if(b.action==='register'&&(!Number.isSafeInteger(b.expiresAt)||b.expiresAt<=0))fail();
  return Object.fromEntries(keys.map(k=>[k,b[k]]));
}
function normalized(e,now){
  if(!Number.isSafeInteger(now)||!exact(e,['version','issuer','audience','destination','method','path','iat','exp','nonce','body'])||e.version!==1||!['A','B'].includes(e.issuer)||
    e.audience!==audience||e.destination!==destination||e.method!=='POST'||e.path!==path||!Number.isSafeInteger(e.iat)||!Number.isSafeInteger(e.exp)||
    e.iat>now+5||e.exp<=now||e.exp<=e.iat||e.exp-e.iat>30||now-e.iat>35||!hash(e.nonce))fail();
  return {version:1,issuer:e.issuer,audience,destination,method:'POST',path,iat:e.iat,exp:e.exp,nonce:e.nonce,body:checkedBody(e.body)};
}
const bytes=e=>Buffer.from(audience+'\n'+JSON.stringify(e),'utf8');
export function signCommand({product,body,privateKey,now=Math.floor(Date.now()/1000),nonce=randomBytes(32).toString('hex')}){
  const envelope=normalized({version:1,issuer:product,audience,destination,method:'POST',path,iat:now,exp:now+30,nonce,body},now);
  if(privateKey?.asymmetricKeyType!=='ed25519')fail();
  return {envelope,signature:sign(null,bytes(envelope),privateKey).toString('base64url')};
}
export function verifyCommand(command,{publicKeys,now=Math.floor(Date.now()/1000),method,requestUrl}={}){
  if(method!=='POST'||requestUrl!==destination||!exact(command,['envelope','signature'])||typeof command.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(command.signature))fail();
  const e=normalized(command.envelope,now),key=publicKeys?.[e.issuer],sig=Buffer.from(command.signature,'base64url');
  if(!['A','B'].every(p=>publicKeys?.[p]?.type==='public'&&publicKeys[p].asymmetricKeyType==='ed25519')||
    publicKeys.A.export({type:'spki',format:'der'}).equals(publicKeys.B.export({type:'spki',format:'der'}))||
    sig.toString('base64url')!==command.signature||!verify(null,bytes(e),key,sig))fail();
  return Object.freeze({...e,body:Object.freeze(e.body)});
}
export function sessionHash(product,opaqueId){
  if(!['A','B'].includes(product)||typeof opaqueId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(opaqueId)||Buffer.from(opaqueId,'base64url').toString('base64url')!==opaqueId)fail();
  return createHash('sha256').update(audience+'\n'+product+'\n'+opaqueId).digest('hex');
}

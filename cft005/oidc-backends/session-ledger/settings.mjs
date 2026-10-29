import {createPrivateKey,createPublicKey} from 'node:crypto';
import {destination} from './protocol.mjs';
import {databaseOptions} from '../record-store.mjs';
const fail=()=>{throw new Error('E_LEDGER_CONFIG');};
function key(value,type){
  if(typeof value!=='string'||value.length<40||value.length>512||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fail();
  try{const der=Buffer.from(value,'base64');if(der.toString('base64')!==value)fail();const k=(type==='private'?createPrivateKey:createPublicKey)({key:der,format:'der',type:type==='private'?'pkcs8':'spki'});if(k.asymmetricKeyType!=='ed25519')fail();return k;}catch{fail();}
}
export function ledgerSettings(env,product){
  if(env.HML_SESSION_LEDGER!=='required-v1'||env.HML_LEDGER_ORIGIN!==new URL(destination).origin||!['A','B'].includes(product))fail();
  return {product,privateKey:key(env.HML_LEDGER_PRIVATE_KEY,'private')};
}
export function coordinatorSettings(env){
  if(env.HML_SESSION_LEDGER!=='required-v1')fail();
  const publicKeys={A:key(env.HML_LEDGER_PUBLIC_KEY_A,'public'),B:key(env.HML_LEDGER_PUBLIC_KEY_B,'public')};
  if(publicKeys.A.export({type:'spki',format:'der'}).equals(publicKeys.B.export({type:'spki',format:'der'})))fail();
  let url;try{url=new URL(env.HML_COORDINATOR_DATABASE_URL);}catch{fail();}
  if(decodeURIComponent(url.username)!=='cft005_hml_coordinator')fail();
  // Reuse strict endpoint/database/TLS validation, changing only the fixed role.
  url.username='cft005_hml_a';const options=databaseOptions('A',url.href);
  return {publicKeys,database:{...options,user:'cft005_hml_coordinator',max:2,application_name:'cft005-session-ledger'}};
}

import {generateKeyPairSync,privateDecrypt,constants,randomBytes} from 'node:crypto';
import {writeFile,readFile,unlink,mkdir} from 'node:fs/promises';
import {validateDatabase,finalizeDatabase} from './database-validation.mjs';

const output=new URL('./database-real-evidence.json',import.meta.url);
if(!process.argv.includes('--finalize')){
  try{await readFile(output);console.error('E_EVIDENCE_ALREADY_EXISTS');process.exit(1);}
  catch(e){if(e.code!=='ENOENT')throw e;}
}else{
  const old=JSON.parse(await readFile(output,'utf8'));
  if(old.defaultPrivilegeSupplementAt){console.error('E_ALREADY_FINALIZED');process.exit(1);}
}
// One-use encrypted transfer. Private key and plaintext only in memory.
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const transferDir=new URL('../../../cft005-transfer/',import.meta.url);
await mkdir(transferDir,{recursive:true});
const payload=new URL(randomBytes(16).toString('hex')+'.sealed',transferDir);
console.log(JSON.stringify({ready:true,encryptedPayloadPath:payload.pathname,publicKey:publicKey.export({type:'spki',format:'pem'})}));
try{
  let bytes=null;
  for(let i=0;i<120&&!bytes;i++){
    try{bytes=await readFile(payload);}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,1000));}
  }
  if(!bytes||bytes.length!==384)throw Error('E_TRANSFER');
  await unlink(payload);
  let secret=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},bytes).toString('utf8');bytes=null;
  const report=process.argv.includes('--finalize')?await finalizeDatabase(secret,JSON.parse(await readFile(output,'utf8'))):await validateDatabase(secret);secret=null;
  report.credentialTransport='RSA-3072 OAEP-SHA256 one-use ciphertext file deleted before SQL; private key only in memory';
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,stage:report.stage,counts:report.counts,executionError:report.executionError??null}));
}catch{try{await unlink(payload);}catch{}console.log('E_DB_RUNNER');process.exitCode=1;}

import {generateKeyPairSync,privateDecrypt,constants,randomBytes,pbkdf2Sync,createHash,createHmac} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import pg from 'pg';
import {target} from './database-validation.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const dir=new URL('../../../cft005-transfer/',import.meta.url);await mkdir(dir,{recursive:true});
const payload=new URL(randomBytes(16).toString('hex')+'.sealed',dir);
console.log(JSON.stringify({ready:true,encryptedPayloadPath:payload.pathname,publicKey:publicKey.export({type:'spki',format:'pem'})}));
const clients=[];
function verifier(password){
  const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256');
  const stored=createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64');
  const server=createHmac('sha256',salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
}
try{
  let bytes;
  for(let i=0;i<180&&!bytes;i++){try{bytes=await readFile(payload);}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,1000));}}
  if(bytes?.length!==384)throw Error('E_TRANSFER');await unlink(payload);
  const data=JSON.parse(privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},bytes));bytes=null;
  if(Object.keys(data).sort().join(',')!=='connectionString,passwordA,passwordB')throw Error('E_INPUT');
  const url=new URL(data.connectionString);
  if(url.hostname!==target.host||url.pathname!=='/'+target.database||decodeURIComponent(url.username)!==target.admin||url.search||!['passwordA','passwordB'].every(k=>/^[A-Za-z0-9_-]{43}$/.test(data[k])))throw Error('E_TARGET');
  const options={host:target.host,port:5432,database:target.database,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,statement_timeout:10000,application_name:'cft005-bff-password-configuration'};
  const admin=new pg.Client({...options,user:target.admin,password:decodeURIComponent(url.password)});clients.push(admin);await admin.connect();
  const logging=(await admin.query("SELECT current_setting('log_statement')='none' AND current_setting('log_parameter_max_length_on_error')='0' AS safe")).rows[0].safe;
  if(!logging)throw Error('E_LOGGING');
  await admin.query(`CREATE FUNCTION pg_temp.configure_runtime_password(r text,v text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF r NOT IN ('cft005_hml_a','cft005_hml_b') OR v NOT LIKE 'SCRAM-SHA-256$%' THEN RAISE EXCEPTION 'E_INPUT'; END IF; EXECUTE format('ALTER ROLE %I PASSWORD %L',r,v); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'E_PASSWORD_CONFIGURATION'; END $$`);
  await admin.query('REVOKE ALL ON FUNCTION pg_temp.configure_runtime_password(text,text) FROM PUBLIC');
  const logins=[];
  for(const product of ['A','B']){
    const user='cft005_hml_'+product.toLowerCase(),password=data['password'+product];
    await admin.query('SELECT pg_temp.configure_runtime_password($1,$2)',[user,verifier(password)]);
    const client=new pg.Client({...options,user,password});clients.push(client);await client.connect();
    const r=(await client.query("SELECT session_user=$1 AND current_user=$1 AS correct,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_roles WHERE rolname=current_user",[user])).rows[0];
    logins.push({product,actualLogin:r.correct,tlsVerified:r.tls});data['password'+product]=null;
  }
  await admin.query('DROP FUNCTION pg_temp.configure_runtime_password(text,text)');data.connectionString=null;
  const report={schemaVersion:1,kind:'EXCLUSIVE_RUNTIME_PASSWORD_CONFIGURATION',at:new Date().toISOString(),databaseId:'dpg-dbh8tghsrm7s73f4tc9g-a',logins,result:logins.every(r=>r.actualLogin&&r.tlsVerified)?'PASS':'FAIL',recordsChanged:0,ddlOrGrantsChanged:0,transport:'RSA-3072 OAEP-SHA256 one-use ciphertext deleted before SQL; no plaintext file',limit:'External login check only; internal BFF connectivity and protected env save verified separately'};
  await writeFile(new URL('./bff-database-configuration-evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,logins:logins.length,recordsChanged:0}));
}catch{try{await unlink(payload);}catch{}console.error('E_RUNTIME_CREDENTIAL_CONFIGURATION');process.exitCode=1;}
finally{for(const c of clients)try{await c.end();}catch{}}

import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync} from 'node:crypto';
import {createLedgerClient} from './transport.mjs';
import {ledgerSettings,coordinatorSettings} from './settings.mjs';
import {destination} from './protocol.mjs';
const keys={A:generateKeyPairSync('ed25519'),B:generateKeyPairSync('ed25519')};
const privateKey=keys.A.privateKey;
const binding={owner:'U1',epoch:2,sessionHash:'a'.repeat(64)};
function fixture(change=x=>x){
  let calls=0,options,url;
  const client=createLedgerClient({product:'A',privateKey},{requestForTest:(u,o,callback)=>{
    calls++;url=u;options=o;const req=new EventEmitter();req.end=buffer=>{
      const e=JSON.parse(buffer.toString()).envelope;
      const result=e.body.action==='snapshot'?{action:'snapshot',epochs:{U1:2,U2:1}}:{action:e.body.action,epoch:e.body.epoch+(e.body.action==='revoke'?1:0)};
      const response=change({status:200,contentType:'application/json; charset=utf-8',body:{version:1,issuer:e.issuer,nonce:e.nonce,result}});
      process.nextTick(()=>{const res=new EventEmitter();res.statusCode=response.status;res.headers={'content-type':response.contentType};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify(response.body)));res.emit('end');});
    };return req;
  }});
  return {client,get calls(){return calls;},get options(){return options;},get url(){return url;}};
}
test('fixed HTTPS destination, TLS validation, bounded request and no positive cache',async()=>{
  const f=fixture();await f.client.authorize({product:'A',...binding});await f.client.authorize({product:'A',...binding});assert.equal(f.calls,2);assert.equal(f.url,destination);assert.equal(f.options.method,'POST');assert.equal(f.options.rejectUnauthorized,true);assert.equal(f.options.agent,false);assert.equal(f.options.minVersion,'TLSv1.2');assert.ok(f.options.signal instanceof AbortSignal);
});
test('mismatched response binding, schema or action never grants access',async()=>{
  for(const change of [r=>({...r,body:{...r.body,nonce:'b'.repeat(64)}}),r=>({...r,body:{...r.body,issuer:'B'}}),r=>({...r,body:{...r.body,result:{action:'revoke',epoch:2}}}),r=>({...r,body:{...r.body,extra:true}}),r=>({...r,contentType:'text/html'})])await assert.rejects(fixture(change).client.authorize({product:'A',...binding}),{message:'E_LEDGER_UNAVAILABLE'});
});
test('redirect or unavailable response is never followed or converted into allow',async()=>{
  for(const status of [301,302,307,308,500,503]){const f=fixture(r=>({...r,status}));await assert.rejects(f.client.authorize({product:'A',...binding}),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.calls,1);}
});
test('only request-bound authenticated denial gets the session-denied category',async()=>{
  await assert.rejects(fixture(r=>({...r,status:401,body:{...r.body,result:{error:'session_denied'}}})).client.authorize({product:'A',...binding}),e=>e.ledgerDenied===true&&e.message==='E_LEDGER_DENIED');
  await assert.rejects(fixture(r=>({...r,status:401,body:{error:'invalid_command'}})).client.authorize({product:'A',...binding}),{message:'E_LEDGER_UNAVAILABLE'});
});
test('snapshot and revocation response epochs must match the exact protocol',async()=>{
  assert.deepEqual((await fixture().client.snapshot()).epochs,{U1:2,U2:1});assert.equal((await fixture().client.revoke(binding)).epoch,3);
  await assert.rejects(fixture(r=>({...r,body:{...r.body,result:{action:'revoke',epoch:2}}})).client.revoke(binding));
  await assert.rejects(fixture(r=>({...r,body:{...r.body,result:{action:'snapshot',epochs:{U1:0,U2:1}}}})).client.snapshot());
});
test('client cannot sign commands on behalf of the other product',()=>{assert.throws(()=>fixture().client.authorize({product:'B',...binding}),{message:'E_LEDGER_DENIED'});});
test('startup settings require explicit ledger mode and fixed origin, without legacy fallback',()=>{
  const env={HML_SESSION_LEDGER:'required-v1',HML_LEDGER_ORIGIN:new URL(destination).origin,HML_LEDGER_PRIVATE_KEY:privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
  assert.equal(ledgerSettings(env,'A').product,'A');for(const patch of [{HML_SESSION_LEDGER:undefined},{HML_SESSION_LEDGER:'false'},{HML_LEDGER_ORIGIN:'https://other.invalid'},{HML_LEDGER_PRIVATE_KEY:'invalid'}])assert.throws(()=>ledgerSettings({...env,...patch},'A'),{message:'E_LEDGER_CONFIG'});
});
test('coordinator requires distinct pinned keys and exact restricted database role',()=>{
  const env={HML_SESSION_LEDGER:'required-v1',HML_LEDGER_PUBLIC_KEY_A:keys.A.publicKey.export({format:'der',type:'spki'}).toString('base64'),HML_LEDGER_PUBLIC_KEY_B:keys.B.publicKey.export({format:'der',type:'spki'}).toString('base64'),HML_COORDINATOR_DATABASE_URL:'postgresql://cft005_hml_coordinator:synthetic-only@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste'};
  const cfg=coordinatorSettings(env);assert.equal(cfg.database.user,'cft005_hml_coordinator');assert.equal(cfg.database.ssl.rejectUnauthorized,true);
  assert.throws(()=>coordinatorSettings({...env,HML_LEDGER_PUBLIC_KEY_B:env.HML_LEDGER_PUBLIC_KEY_A}));
  for(const url of [env.HML_COORDINATOR_DATABASE_URL.replace('hml_coordinator:','local_admin:'),env.HML_COORDINATOR_DATABASE_URL+'?sslmode=disable',env.HML_COORDINATOR_DATABASE_URL.replace('dpg-dbh8tghsrm7s73f4tc9g-a/','other.invalid/')])assert.throws(()=>coordinatorSettings({...env,HML_COORDINATOR_DATABASE_URL:url}));
});

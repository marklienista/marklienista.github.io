import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {operatorEnabled,signOperator,verifyOperator,opaque,boundedJson,validateOperatorKeys} from './protocol.mjs';
import {createWriteControl} from './write-control.mjs';
import {protocolFixture} from '../protocol-fixture.mjs';
const keys={A:generateKeyPairSync('ed25519'),B:generateKeyPairSync('ed25519')};
const publicKeys={A:keys.A.publicKey,B:keys.B.publicKey},source='a'.repeat(40);
const packet=()=>signOperator({product:'A',source,privateKey:keys.A.privateKey,body:{action:'reserve',kind:'race',run:opaque()}});
const verify=p=>verifyOperator(p,{product:'B',source,publicKeys});
test('operator is disabled by default; unknown flag is refused',()=>{assert.equal(operatorEnabled({}),false);assert.equal(operatorEnabled({HML_CONTROLLED_SESSION_PROOF:'enabled-v1'}),true);assert.throws(()=>operatorEnabled({HML_CONTROLLED_SESSION_PROOF:'true'}),/E_OPERATOR_UNAVAILABLE/);});
test('distinct service signature binds exact source and target',()=>{assert.equal(verify(packet()).issuer,'A');assert.throws(()=>verifyOperator(packet(),{product:'A',source,publicKeys}),/E_OPERATOR_UNAVAILABLE/);assert.throws(()=>verifyOperator(packet(),{product:'B',source:'b'.repeat(40),publicKeys}),/E_OPERATOR_UNAVAILABLE/);});
for(const [name,mutate]of [
  ['issuer substitution',p=>{p.envelope.issuer='B';}],['target substitution',p=>{p.envelope.target='A';}],
  ['destination substitution',p=>{p.envelope.destination='https://outside.invalid/';}],
  ['cross protocol audience',p=>{p.envelope.audience='CFT005-HML-LEDGER-1';}],
  ['browser chosen owner',p=>{p.envelope.body.owner='U2';}],['unsigned extra field',p=>{p.extra='not-allowed';}],
  ['expired envelope',p=>{p.envelope.iat-=60;p.envelope.exp-=60;}],
  ['malformed signature',p=>{p.signature='x';}]
])test('rejects '+name+' before a command can execute',()=>{const p=packet();mutate(p);assert.throws(()=>verify(p),{message:'E_OPERATOR_UNAVAILABLE'});});
test('a packet signed with A private key cannot claim B authority',()=>{const p=signOperator({product:'B',source,privateKey:keys.A.privateKey,body:{action:'reserve',kind:'race',run:opaque()}});assert.throws(()=>verifyOperator(p,{product:'A',source,publicKeys}),/E_OPERATOR_UNAVAILABLE/);});
test('service action cannot select arbitrary user, SQL or URL',()=>{for(const body of [{action:'sql',run:opaque(),lease:opaque()},{action:'reserve',kind:'race',run:opaque(),url:'private'},{action:'revoke',run:opaque(),lease:opaque(),owner:'U2'}])assert.throws(()=>signOperator({product:'A',source,privateKey:keys.A.privateKey,body}),/E_OPERATOR_UNAVAILABLE/);});
const binding={owner:'U1',sessionHash:'c'.repeat(64),epoch:1},principal={label:'U1',ledgerBinding:binding};
test('private write permit is one-use and bound to verified owner/binding',()=>{
  const c=createWriteControl(),a=c.arm(binding,async()=>{},()=>{},()=>{});
  assert.throws(()=>c.claim(a.marker,{label:'U2',ledgerBinding:binding}),/E_OPERATOR_UNAVAILABLE/);
  assert.throws(()=>c.claim('wrong',principal),/E_OPERATOR_UNAVAILABLE/);
  c.claim(a.marker,principal);assert.throws(()=>c.claim(a.marker,principal),/E_OPERATOR_UNAVAILABLE/);a.cancel();
});
test('positive blocker is observed on the held client before commit notification',async()=>{
  const c=createWriteControl();let finish,committed=false,blocked=false;
  const a=c.arm(binding,()=>new Promise(resolve=>{finish=resolve;}),()=>{committed=true;},()=>{blocked=true;});
  const permit=c.claim(a.marker,principal),client={query:async()=>({rows:[{blocked:true}]}),end:async()=>{throw Error('unexpected-end');}};
  await c.afterQuery(client,permit,1);assert.equal(blocked,true);assert.equal(committed,false);c.committed(permit);assert.equal(committed,true);finish();a.cancel();
});
test('a stalled monitoring query destroys the client at the bounded deadline',async()=>{
  const c=createWriteControl();let reject,ended=false,finish;
  const a=c.arm(binding,()=>new Promise(resolve=>{finish=resolve;}),()=>{},()=>{}),permit=c.claim(a.marker,principal);
  const client={query:()=>new Promise((_,no)=>{reject=no;}),end:async()=>{ended=true;reject(Error('closed'));}};
  await assert.rejects(c.afterQuery(client,permit,1));assert.equal(ended,true);finish();a.cancel();
});
test('empty UPDATE result cannot enter a pause or report commit',async()=>{
  const c=createWriteControl();let called=false;const a=c.arm(binding,async()=>{called=true;},()=>{},()=>{});
  await assert.rejects(c.afterQuery({query:async()=>{}},c.claim(a.marker,principal),0),/E_OPERATOR_UNAVAILABLE/);assert.equal(called,false);a.cancel();
});
test('without a private permit the normal data path has no monitoring query',async()=>{const c=createWriteControl();await c.afterQuery({query:()=>{throw Error('unexpected-query');}},undefined,1);});
test('startup refuses shared or mismatched service public keys',()=>{
  assert.throws(()=>validateOperatorKeys(keys.A.privateKey,'A',{A:keys.A.publicKey,B:keys.A.publicKey}),/E_OPERATOR_UNAVAILABLE/);
  assert.throws(()=>validateOperatorKeys(keys.A.privateKey,'A',{A:keys.B.publicKey,B:keys.A.publicKey}),/E_OPERATOR_UNAVAILABLE/);
});
test('oversized or non-JSON peer responses are never accepted',async()=>{
  await assert.rejects(boundedJson(new Response('x'.repeat(5000),{headers:{'Content-Type':'application/json'}})),/E_OPERATOR_UNAVAILABLE/);
  await assert.rejects(boundedJson(new Response('{}',{headers:{'Content-Type':'text/html'}})),/E_OPERATOR_UNAVAILABLE/);
});
test('without activation the peer/results routes and operator UI remain absent',async()=>{
  const f=await protocolFixture();try{
    assert.equal((await f.request('A',{path:'/proof/sessions/peer',method:'POST'})).status,404);
    assert.equal((await f.request('A',{path:'/proof/sessions/results'})).status,404);
    assert.equal((await f.request('A')).text.includes('Provar revogação concorrente'),false);
  }finally{await f.close();}
});

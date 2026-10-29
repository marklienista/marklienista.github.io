import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {audience,destination,signCommand,verifyCommand,sessionHash} from './protocol.mjs';
import {executeCommand,protectedTransaction} from './transactions.mjs';

// Cryptographic keys exist only in test-process memory. Never exported to files.
const keys={A:generateKeyPairSync('ed25519'),B:generateKeyPairSync('ed25519')};
const publicKeys={A:keys.A.publicKey,B:keys.B.publicKey};
const verification={publicKeys,now:1000,method:'POST',requestUrl:destination};
const hash=s=>createHash('sha256').update(s).digest('hex');
const binding=(p='A',owner='U1',epoch=1)=>({owner,epoch,sessionHash:hash(p+owner)});
const command=(body={action:'authorize',...binding()},product='A')=>signCommand({product,body,privateKey:keys[product].privateKey,now:1000});
const clone=x=>JSON.parse(JSON.stringify(x));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));

// Deterministic SQL/lock MODEL, not PostgreSQL and not RLS evidence. The real
// adapter runs unchanged against this interface. Explicit FIFO shared/exclusive
// locks let tests hold an in-flight operation while observing another promise.
class Lock {
  readers=0;writer=false;queue=[];
  acquire(write){return new Promise(resolve=>{this.queue.push({write,resolve});this.drain();});}
  drain(){
    if(this.writer||!this.queue.length)return;
    if(this.queue[0].write){if(this.readers)return;this.writer=true;this.queue.shift().resolve(()=>{this.writer=false;this.drain();});}
    else while(this.queue.length&&!this.queue[0].write){this.readers++;this.queue.shift().resolve(()=>{this.readers--;this.drain();});}
  }
}
function fixture(){
  const epochs=new Map([['U1',1],['U2',1]]),sessions=new Map(),nonces=new Set(),pending=new Set(),locks=new Map();
  for(const p of ['A','B'])for(const u of ['U1','U2'])sessions.set(hash(p+u),{product:p,owner:u,epoch:1,expires_at:1900,revoked:false});
  const f={epochs,sessions,nonces,revision:4,now:1000,events:[],calls:[],connections:0,destroyed:0,failCommit:false,failRollback:false,roleOk:true};
  const pool=role=>({async connect(){
    f.connections++;const held=new Map(),effects=[],reserved=[];
    const unlock=()=>{for(const release of held.values())release();held.clear();for(const n of reserved)pending.delete(n);};
    async function lock(id,write){if(held.has(id))return;let l=locks.get(id);if(!l)locks.set(id,l=new Lock());held.set(id,await l.acquire(write));}
    return {async query(sql,args=[]){
      f.calls.push({role,sql,args});
      if(sql==='COMMIT'){
        if(f.commitGate)await f.commitGate.promise;
        if(f.failCommit)throw Error('private-commit-error');
        for(const effect of effects)effect();effects.length=0;f.events.push('commit:'+role);unlock();return {rows:[]};
      }
      if(sql==='ROLLBACK'){effects.length=0;unlock();if(f.failRollback)throw Error('private-rollback-error');return {rows:[]};}
      if(sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL')||sql.startsWith('SELECT set_config'))return {rows:[]};
      if(sql.includes('FROM pg_roles r'))return {rows:[{ok:f.roleOk&&args[1]===role&&args[0]==='cft005_hml_db_teste'}]};
      if(sql.includes('clock_timestamp()'))return {rows:[{now:String(f.now)}]};
      if(sql.startsWith('INSERT INTO cft005_hml_auth.nonces')){
        const key=args[0]+args[1];if(nonces.has(key)||pending.has(key))throw Error('duplicate-nonce');pending.add(key);reserved.push(key);effects.push(()=>nonces.add(key));return {rows:[]};
      }
      if(sql.includes('FROM cft005_hml_auth.epochs ORDER BY')){
        for(const u of ['U1','U2'])await lock('epoch:'+u,false);
        return {rows:[...epochs].map(([owner_label,epoch])=>({owner_label,epoch:String(epoch)}))};
      }
      if(sql.startsWith('SELECT epoch FROM cft005_hml_auth.epochs')){await lock('epoch:'+args[0],sql.endsWith('FOR UPDATE'));return {rows:epochs.has(args[0])?[{epoch:String(epochs.get(args[0]))}]:[]};}
      if(sql.startsWith('SELECT epoch,expires_at,revoked')){
        await lock('session:'+args[0],sql.endsWith('FOR UPDATE'));const s=sessions.get(args[0]);
        return {rows:s&&s.product===args[1]&&s.owner===args[2]?[{...s}]:[]};
      }
      if(sql.startsWith('INSERT INTO cft005_hml_auth.sessions')){
        if(sessions.has(args[0]))throw Error('duplicate-session');
        effects.push(()=>sessions.set(args[0],{product:args[1],owner:args[2],epoch:args[3],expires_at:args[5],revoked:false}));return {rows:[]};
      }
      if(sql.startsWith('UPDATE cft005_hml_auth.epochs')){const next=epochs.get(args[0])+1;effects.push(()=>epochs.set(args[0],next));return {rows:[{epoch:String(next)}]};}
      if(sql.startsWith('UPDATE cft005_hml_auth.sessions')){effects.push(()=>{sessions.get(args[0]).revoked=true;});return {rows:[{session_hash:args[0]}]};}
      if(sql==='UPDATE FIXTURE RECORD'){effects.push(()=>f.revision++);return {rows:[{revision:f.revision+1}]};}
      throw Error('unmodeled SQL');
    },release(destroy){if(destroy)f.destroyed++;assert.equal(held.size,0,'transaction locks must be released');}};
  }});
  f.coordPool=pool('cft005_hml_coordinator');f.aPool=pool('cft005_hml_a');f.bPool=pool('cft005_hml_b');
  f.coordinator={authorize:async({product,...b})=>executeCommand(f.coordPool,command({action:'authorize',...b},product),verification)};
  f.op=(p='A',u='U1',extra={})=>protectedTransaction({pool:p==='A'?f.aPool:f.bPool,coordinator:f.coordinator,cfg:{product:p,subjects:{'fixture-U1':'U1','fixture-U2':'U2'}},principal:{subject:'fixture-'+u,label:u},binding:binding(p,u),operation:async c=>{const r=await c.query('UPDATE FIXTURE RECORD');return r.rows[0];},...extra});
  f.run=(body,p='A')=>executeCommand(f.coordPool,command(body,p),verification);
  return f;
}

test('Ed25519 commands bind exact issuer, destination, method, body and lifetime',()=>{
  const c=command();assert.equal(verifyCommand(c,verification).issuer,'A');assert.equal(c.envelope.audience,audience);
  for(const [key,value]of [['issuer','B'],['audience','other'],['destination','https://other.invalid/v1/command'],['method','GET'],['path','/elsewhere'],['iat',1006],['exp',1031],['nonce','short']]){
    const changed=clone(c);changed.envelope[key]=value;assert.throws(()=>verifyCommand(changed,verification));
  }
  for(const [key,value]of [['owner','U2'],['epoch',2],['sessionHash',hash('other')],['action','logout']]){
    const changed=clone(c);changed.envelope.body[key]=value;assert.throws(()=>verifyCommand(changed,verification));
  }
});
test('transport binding must be supplied explicitly, without query/path/host aliases',()=>{
  const c=command();assert.throws(()=>verifyCommand(c,{publicKeys,now:1000}));
  for(const v of [{method:'GET'},{requestUrl:destination+'?x=1'},{requestUrl:destination.replace('/v1/command','/elsewhere')}])assert.throws(()=>verifyCommand(c,{...verification,...v}));
});
test('unsigned, malformed and extra-field commands cannot reach the database',async()=>{
  const f=fixture();for(const c of [{}, {envelope:command().envelope}, {...command(),signature:'a'.repeat(86)}, {...command(),extra:true}])await assert.rejects(executeCommand(f.coordPool,c,verification));
  assert.equal(f.connections,0);
});
test('distinct pinned public keys are required and another client cannot impersonate A',()=>{
  const c=command();assert.throws(()=>verifyCommand(c,{...verification,publicKeys:{A:keys.B.publicKey,B:keys.A.publicKey}}));
  assert.throws(()=>verifyCommand(c,{...verification,publicKeys:{A:keys.A.publicKey,B:keys.A.publicKey}}));
});
test('expired and overly old envelopes are refused without database work',()=>{
  const c=command();for(const now of [1030,1100,900])assert.throws(()=>verifyCommand(c,{...verification,now}));
});
test('session fingerprint is product-bound and never equals the opaque cookie',()=>{
  const id=Buffer.alloc(32,3).toString('base64url');assert.notEqual(sessionHash('A',id),id);assert.notEqual(sessionHash('A',id),sessionHash('B',id));
  for(const id of ['short','x'.repeat(43),'a'.repeat(44)])assert.throws(()=>sessionHash('A',id));
});
test('body schema cannot introduce arbitrary identity, product, URL or epoch reset',()=>{
  for(const body of [{action:'authorize',...binding(),subject:'fixture'},{action:'authorize',...binding(),product:'B'}, {action:'authorize',...binding(),owner:'U3'}, {action:'authorize',...binding(),epoch:0}])assert.throws(()=>command(body));
});
test('local fixture: successful commands persist a nonce and refuse replay',async()=>{
  const f=fixture(),c=command();await executeCommand(f.coordPool,c,verification);assert.equal(f.nonces.size,1);
  await assert.rejects(executeCommand(f.coordPool,c,verification),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.epochs.get('U1'),1);
});
test('local fixture: acknowledgment waits for the commit promise',async()=>{
  const f=fixture();f.commitGate=deferred();let finished=false;
  const run=f.run({action:'revoke',...binding()}).then(x=>{finished=true;return x;});await tick();
  assert.equal(finished,false);assert.equal(f.epochs.get('U1'),1);f.commitGate.resolve();
  assert.deepEqual(await run,{action:'revoke',epoch:2});assert.equal(f.epochs.get('U1'),2);
});
test('local fixture: write already in flight finishes before revocation acknowledgment',async()=>{
  const f=fixture(),entered=deferred(),finish=deferred();
  const write=f.op('A','U1',{operation:async c=>{entered.resolve();await finish.promise;await c.query('UPDATE FIXTURE RECORD');}});await entered.promise;
  let ack=false;const revoke=f.run({action:'revoke',...binding()}).then(()=>{ack=true;});await tick();
  assert.equal(ack,false);assert.equal(f.revision,4);finish.resolve();await write;await revoke;
  assert.equal(f.revision,5);assert.equal(f.epochs.get('U1'),2);
  await assert.rejects(f.op('A','U1'),{message:'E_LEDGER_DENIED'});await assert.rejects(f.op('B','U1'),{message:'E_LEDGER_DENIED'});assert.equal(f.revision,5);
  await f.op('B','U2');assert.equal(f.revision,6);assert.equal(f.epochs.get('U2'),1);
});
test('local fixture: revocation between online check and SQL check fences the stale operation',async()=>{
  const f=fixture();let touched=false;
  const coordinator={authorize:async()=>{await f.run({action:'revoke',...binding()});return {action:'authorize',epoch:1};}};
  await assert.rejects(f.op('A','U1',{coordinator,operation:async()=>{touched=true;}}),{message:'E_LEDGER_DENIED'});
  assert.equal(touched,false);assert.equal(f.revision,4);
});
test('local fixture: unavailable coordinator denies every operation without cached allow',async()=>{
  const f=fixture();await f.op();const n=f.connections;f.coordinator.authorize=async()=>{throw Error('private-network-detail');};
  await assert.rejects(f.op(),{message:'E_LEDGER_UNAVAILABLE'});await assert.rejects(f.op('B','U1'),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.connections,n);
});
test('local fixture: logout only revokes the supplied session, not peer product or U2',async()=>{
  const f=fixture();await f.run({action:'logout',...binding()});await assert.rejects(f.op(),{message:'E_LEDGER_DENIED'});await f.op('B','U1');await f.op('A','U2');assert.equal(f.epochs.get('U1'),1);
});
test('local fixture: signed B command cannot use an A session to revoke the user',async()=>{
  const f=fixture();await assert.rejects(f.run({action:'revoke',...binding()},'B'),{message:'E_LEDGER_DENIED'});assert.equal(f.epochs.get('U1'),1);assert.equal(f.nonces.size,0);
});
test('local fixture: restarted handler keeps revocation in shared persistent interface',async()=>{
  const f=fixture();await f.run({action:'revoke',...binding()});
  const newHandler=c=>executeCommand(f.coordPool,c,verification);
  await assert.rejects(newHandler(command()),{message:'E_LEDGER_DENIED'});assert.equal(f.epochs.get('U1'),2);
});
test('local fixture: pending login snapshot cannot register after an epoch advance',async()=>{
  const f=fixture(),snapshot=await f.run({action:'snapshot'});assert.deepEqual(snapshot.epochs,{U1:1,U2:1});await f.run({action:'revoke',...binding()});
  await assert.rejects(f.run({action:'register',...binding(),sessionHash:hash('fresh'),epoch:snapshot.epochs.U1,expiresAt:1600}),{message:'E_LEDGER_DENIED'});
  const next=await f.run({action:'snapshot'});const b={...binding(),sessionHash:hash('fresh'),epoch:next.epochs.U1};
  await f.run({action:'register',...b,expiresAt:1600});await f.op('A','U1',{binding:b});assert.equal(f.epochs.get('U2'),1);
});
test('local fixture: existing session hash is never upserted to reactivate old state',async()=>{
  const f=fixture();await f.run({action:'logout',...binding()});
  await assert.rejects(f.run({action:'register',...binding(),expiresAt:1600}),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.sessions.get(binding().sessionHash).revoked,true);
});
test('local fixture: register refuses expired or extended session lifetimes',async()=>{
  const f=fixture();for(const expiresAt of [1000,1901])await assert.rejects(f.run({action:'register',...binding(),sessionHash:hash('new'+expiresAt),expiresAt}),{message:'E_LEDGER_DENIED'});
});
test('local fixture: invalid principal or mismatched owner is refused before networking',async()=>{
  const f=fixture();await assert.rejects(f.op('A','U1',{principal:{subject:'fixture-U1',label:'U2'}}));await assert.rejects(f.op('A','U1',{binding:binding('A','U2')}));assert.equal(f.connections,0);
});
test('local fixture: expiry during a lock wait is checked again using the database clock',async()=>{
  const f=fixture(),entered=deferred(),finish=deferred();
  const operation=f.op('A','U1',{operation:async()=>{entered.resolve();await finish.promise;}});await entered.promise;
  const revocation=f.run({action:'revoke',...binding()});await tick();f.now=1031;finish.resolve();await operation;
  await assert.rejects(revocation,{message:'E_LEDGER_DENIED'});assert.equal(f.epochs.get('U1'),1);
});
test('local fixture: role/TLS failure denies before any data or epoch operation',async()=>{
  const f=fixture();f.roleOk=false;await assert.rejects(f.op(),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.revision,4);assert.equal(f.nonces.size,0);
});
test('local fixture: ambiguous commit has no success acknowledgment and destroys connection',async()=>{
  const f=fixture();f.failCommit=true;await assert.rejects(f.run({action:'revoke',...binding()}),{message:'E_LEDGER_UNAVAILABLE'});assert.equal(f.destroyed,1);assert.equal(f.epochs.get('U1'),1);
});
test('local fixture: failed rollback destroys the connection and hides internal errors',async()=>{
  const f=fixture();f.failRollback=true;await assert.rejects(f.run({action:'revoke',...binding(),epoch:2}),{message:'E_LEDGER_DENIED'});assert.equal(f.destroyed,1);
});
test('migration drafts are guarded, never executed by startup, and do not grant record access',async()=>{
  const migration=await readFile(new URL('./001-ledger.DRAFT.sql',import.meta.url),'utf8');
  assert.match(migration,/cft005.reviewed_session_ledger/);assert.match(migration,/CREATE ROLE cft005_hml_coordinator NOLOGIN/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g,''),/SECURITY DEFINER|GRANT .* ON cft005_hml_[ab]\.records/i);
  for(const name of ['../start.mjs','../backend.mjs','../record-store.mjs'])assert.doesNotMatch(await readFile(new URL(name,import.meta.url),'utf8'),/\.DRAFT\.sql/);
  const rollback=await readFile(new URL('./002-rollback.DRAFT.sql',import.meta.url),'utf8');assert.doesNotMatch(rollback,/\bDROP\s|\bDELETE\s|\bTRUNCATE\s/i);
});

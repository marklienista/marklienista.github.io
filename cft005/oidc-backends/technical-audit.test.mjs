import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDatabase} from './technical-audit.mjs';
import {createPostgresStore} from './record-store.mjs';
import {protocolFixture} from './protocol-fixture.mjs';
import {runTechnicalProof} from './technical-proof.mjs';
import {PROOF_ORIGINS} from './config.mjs';

const cfg={product:'A',subjects:{'fixture-u1':'U1','fixture-u2':'U2'}};
function databaseFixture({allowedProbe,failTag,unsafePolicy=false,restrictedColumns=false}={}){
  let owner=null,readOnly=false;const calls=[];const releases=[];
  const client={async query(sql,args=[]){
    const tag=/CFT005_AUDIT:([A-Z_]+)/.exec(sql)?.[1];calls.push({tag,sql,args});
    if(tag===failTag)throw Object.assign(Error('synthetic-private-error-must-not-escape'),{code:'XX000'});
    if(['CONTEXT','BEFORE','PROBE_CONTEXT','AFTER_ROLLBACK','AFTER_COMMIT'].includes(tag))return {rows:[{pid:12345,role:'cft005_hml_a',owner}]};
    if(['OWNER','READ_OWNER'].includes(tag))owner=args[0];
    if(['BEGIN','READ_BEGIN'].includes(tag))readOnly=tag==='READ_BEGIN';
    if(['ROLLBACK','ABORT','COMMIT'].includes(tag)){if(tag==='COMMIT')assert.equal(readOnly,true);owner=null;}
    if(tag==='POLICY')return{rows:[{restricted_role:!unsafePolicy,forced_rls:true,no_custom_triggers:true,tls:true,with_check_columns_writable:!restrictedColumns}]};
    if(tag==='CONSTRAINTS')return{rows:[
      {contype:'c',convalidated:true,definition:"CHECK ((record_id = ('HML-A-'::text || owner_label)))"},
      {contype:'c',convalidated:true,definition:"CHECK ((product = 'A'::text))"},
      {contype:'c',convalidated:true,definition:"CHECK ((owner_label = ANY (ARRAY['U1'::text, 'U2'::text])))"},
      {contype:'p',convalidated:true,definition:'PRIMARY KEY (record_id)'}]};
    if(['INITIAL_ROW','FINAL_ROW','ROW_AFTER_ROLLBACK'].includes(tag))return{rows:[{record_id:`HML-A-${owner}`,owner_label:owner,product:'A',value:'synthetic',revision:4}]};
    if(['VISIBLE_ROWS','OWN_NOOP'].includes(tag))return{rows:[{record_id:`HML-A-${owner}`}]};
    if(['WITH_CHECK_OWNER','WITH_CHECK_PRODUCT','OTHER_SCHEMA','OTHER_ROLE','OWNER_ROLE','BYPASS'].includes(tag)&&tag!==allowedProbe)throw Object.assign(Error('synthetic-private-denial'),{code:'42501'});
    if(tag==='INVENTORY')return{rows:[{extra_relations:0,security_definers:0,public_functions:0,public_create_denied:true,peer_schema_usage_denied:true,public_relations:0,fixed_private_tables:true,default_public_execute_revoked:true,no_publications:true}]};
    return{rows:[]};
  },release(destroy){releases.push(destroy);}};
  class Pool{on(){}async connect(){return client;}async end(){}}
  return{client,Pool,calls,releases};
}

test('audit rolls back mutation probes, commits only reads and preserves no raw PID in checks',async()=>{
  const f=databaseFixture();const r=await auditDatabase(f.client,'A','U1',{pid:12345,label:'U2'});
  assert.ok(Object.values(r.checks).every(x=>x===true));
  assert.ok(f.calls.findIndex(c=>c.tag==='ROLLBACK')<f.calls.findIndex(c=>c.tag==='COMMIT'));
  assert.equal(f.calls.filter(c=>c.tag==='ROLLBACK_PROBE').length,6);
  assert.equal(JSON.stringify(r.checks).includes('12345'),false);
  assert.equal(f.calls.find(c=>c.tag==='OWNER').args[0],'U1');
});
test('an unexpectedly permitted role switch is a failure, never interpreted as a successful denial',async()=>{
  const f=databaseFixture({allowedProbe:'OTHER_ROLE'});const r=await auditDatabase(f.client,'A','U1');
  assert.equal(r.checks.otherRoleDenied,false);assert.ok(f.calls.some(c=>c.tag==='ROLLBACK_PROBE'));
});
test('unsafe role policy skips every mutation and ends the transaction',async()=>{
  const f=databaseFixture({unsafePolicy:true});const r=await auditDatabase(f.client,'A','U1');
  assert.equal(r.checks.restrictedRole,false);assert.equal(r.next,null);
  assert.equal(f.calls.at(-1).tag,'ABORT');assert.equal(f.calls.some(c=>c.tag==='OWN_NOOP'),false);
});
test('missing column UPDATE privileges cannot produce a false PASS for RLS WITH CHECK',async()=>{
  const f=databaseFixture({restrictedColumns:true}),r=await auditDatabase(f.client,'A','U1');
  assert.equal(r.checks.withCheckColumnsWritable,false);assert.equal(r.checks.withCheckOwnerDenied,undefined);
  assert.equal(f.calls.some(c=>c.tag==='OWN_NOOP'),false);assert.equal(f.calls.at(-1).tag,'ABORT');
});
test('unexpected database error rolls back and destroys the pooled connection without raw error output',async()=>{
  const f=databaseFixture({failTag:'FINAL_ROW'}),store=createPostgresStore(cfg,'postgresql://cft005_hml_a:synthetic-only-password@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste',{Pool:f.Pool});
  await assert.rejects(store.audit({subject:'fixture-u1',label:'U1'}),{message:'E_DATABASE_UNAVAILABLE'});
  assert.equal(f.calls.at(-1).tag,'ABORT');assert.deepEqual(f.releases,[true]);
});
test('verified principals are required and successful audits can reuse the cleaned connection across owners',async()=>{
  const f=databaseFixture(),store=createPostgresStore(cfg,'postgresql://cft005_hml_a:synthetic-only-password@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste',{Pool:f.Pool});
  await assert.rejects(store.audit({subject:'fixture-u1',label:'U2'}),{message:'E_DATABASE_UNAVAILABLE'});assert.equal(f.calls.length,0);
  const first=await store.audit({subject:'fixture-u1',label:'U1'});assert.equal(first.previousVerifiedOwnerDifferent,false);
  const second=await store.audit({subject:'fixture-u2',label:'U2'});assert.equal(second.previousVerifiedOwnerDifferent,true);assert.equal(second.sameConnectionAsPreviousAudit,true);
  assert.deepEqual(f.releases,[false,false]);
});
test('technical endpoint requires authentication, correct CSRF and Origin; unavailable audit is BLOCKED',async t=>{
  const f=await protocolFixture();t.after(()=>f.close());
  assert.equal((await f.request('A',{path:'/proof/technical/run',method:'POST'})).status,401);
  const login=await f.login('A','U1');
  const state=(await f.request('A',{path:'/session',jar:login.jar})).json;
  assert.equal((await f.request('A',{path:'/proof/technical/run',method:'POST',jar:login.jar})).status,403);
  const result=await f.request('A',{path:'/proof/technical/run',method:'POST',jar:login.jar,headers:{Origin:f.configs.A.origin,'X-CFT005-CSRF':state.csrf}});
  assert.equal(result.status,200);assert.equal(result.json.result,'BLOCKED');
  const publicReceipt=(await f.request('A',{path:'/proof/technical/results'})).json;
  assert.equal(publicReceipt.receipts.length,1);
  assert.equal(JSON.stringify(publicReceipt).includes(state.csrf),false);
  assert.equal(JSON.stringify(publicReceipt).includes('access_token'),false);
  assert.equal((await f.request('A',{path:'/proof/technical/run',method:'POST',jar:login.jar,headers:{Origin:f.configs.A.origin,'X-CFT005-CSRF':state.csrf}})).status,429);
});

test('ledger audit preserves fixed denial/outage categories and never opens SQL after failed authorization',async()=>{
  class Pool{on(){}async connect(){throw Error('SQL_MUST_NOT_BE_REACHED');}async end(){}}
  const principal={subject:'fixture-u1',label:'U1',ledgerBinding:{owner:'U1',epoch:1,sessionHash:'a'.repeat(64)}};
  for(const denied of [true,false]){
    const store=createPostgresStore(cfg,'postgresql://cft005_hml_a:synthetic-only-password@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste',{Pool,ledger:{authorize:async()=>{throw Object.assign(Error('private-upstream-error'),denied?{ledgerDenied:true}:{});}}});
    await assert.rejects(store.audit(principal),{message:denied?'E_LEDGER_DENIED':'E_LEDGER_UNAVAILABLE'});
  }
});

test('technical HTTP probes use fixed destinations and prove product policy with absent/forged Origin, without exporting credentials',async()=>{
  const f=databaseFixture(),db=await auditDatabase(f.client,'A','U1');const requests=[];
  const secrets={token:'synthetic-secret-token-not-for-output',csrf:'synthetic-csrf-not-for-output',sid:'synthetic-cookie-not-for-output'};
  const r=await runTechnicalProof({cfg:{product:'A'},principal:{label:'U1'},session:{label:'U1',token:secrets.token,csrf:secrets.csrf},sid:secrets.sid,
    store:{kind:'postgres',audit:async()=>db.checks},proofFetch:async(url,opts)=>{
      requests.push({url,opts});assert.equal(new URL(url).origin,PROOF_ORIGINS.A);assert.equal(opts.redirect,'error');
      let status=404,body={error:'not_found'};
      if(opts.headers.Authorization){status=401;body={error:'browser_bearer_forbidden'};}
      else if(url.includes('/api/products/B/')){status=403;body={error:'product_forbidden'};}
      else if(url.includes('/api/products/A/')){status=200;body={record:{id:'HML-A-U1'}};}
      return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
    }});
  assert.equal(r.result,'PASS');assert.equal(r.sharedSupabaseJwtRealTest,false);
  const cross=requests.filter(x=>x.url.includes('/api/products/B/'));assert.equal(cross.length,2);
  assert.equal(Object.hasOwn(cross[0].opts.headers,'Origin'),false);assert.equal(cross[1].opts.headers.Origin,PROOF_ORIGINS.B);
  assert.ok(cross.every(x=>x.opts.headers['X-CFT005-CSRF']===secrets.csrf));
  for(const secret of Object.values(secrets))assert.equal(JSON.stringify(r).includes(secret),false);
  assert.equal(JSON.stringify(r).includes('12345'),false);
});

test('authenticated technical route binds the SQL audit to the verified principal, ignores forged labels and leaves old proof receipts separate',async t=>{
  const audit=await auditDatabase(databaseFixture().client,'A','U1');const principals=[];
  const f=await protocolFixture({recordStoreForTest:cfg=>({kind:'postgres',async ready(){},async close(){},
    async read(p,label){return p.label===label?{id:`HML-${cfg.product}-${label}`,value:'synthetic-only',revision:4}:null;},
    async audit(p){principals.push(p);return audit.checks;}})});t.after(()=>f.close());
  const login=await f.login('A','U1'),state=(await f.request('A',{path:'/session',jar:login.jar})).json;
  const r=await f.request('A',{path:'/proof/technical/run',method:'POST',jar:login.jar,body:'{"owner":"U2","product":"B","sql":"forbidden"}',headers:{Origin:f.configs.A.origin,'X-CFT005-CSRF':state.csrf}});
  assert.equal(r.json.result,'PASS');assert.equal(r.json.user,'U1');assert.equal(principals.length,1);assert.equal(principals[0].label,'U1');
  assert.equal(r.json.sharedSupabaseJwtRealTest,false);
  assert.equal((await f.request('A',{path:'/proof/results'})).json.receipts.length,0);
  const text=JSON.stringify((await f.request('A',{path:'/proof/technical/results'})).json);
  assert.equal(text.includes(state.csrf),false);assert.equal(text.includes(principals[0].subject),false);assert.equal(text.includes('12345'),false);
});

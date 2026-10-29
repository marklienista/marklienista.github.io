import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseOptions,createPostgresStore,databaseFailureCategory} from './record-store.mjs';
const url='postgresql://cft005_hml_a:synthetic-password-only@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste';
const cfg={product:'A',subjects:{'fixture-u1':'U1','fixture-u2':'U2'}};
const principal={subject:'fixture-u1',label:'U1'};
function fixture({fail=false,ready=true}={}){
  const calls=[];let connected=0,released=0;
  class Pool{on(){}async connect(){connected++;return {query:async(sql,args=[])=>{calls.push({sql,args});if(sql.startsWith('SELECT record_id')||sql.startsWith('UPDATE')){if(fail)throw Error('raw-private-error');return {rows:[]};}return {rows:[]};},release(){released++;}};}async query(){return {rows:[{login_ok:ready,tls:ready,rls:ready}]};}async end(){}}
  return {store:createPostgresStore(cfg,url,{Pool}),calls,get connected(){return connected;},get released(){return released;}};
}
test('only exact database endpoints and product role accepted, TLS verification fixed',()=>{
  const o=databaseOptions('A',url);assert.equal(o.ssl.rejectUnauthorized,true);assert.equal(o.ssl.servername,'dpg-dbh8tghsrm7s73f4tc9g-a.virginia-postgres.render.com');assert.equal(o.max,1);
  for(const wrong of [url.replace('hml_a:','hml_b:'),url.replace('hml_a:','hml_db_teste_user:'),url.replace('dpg-dbh8tghsrm7s73f4tc9g-a/','untrusted.invalid/'),url+'?sslmode=disable',url.replace('/cft005_hml_db_teste','/other')])assert.throws(()=>databaseOptions('A',wrong),{message:'E_DATABASE_UNAVAILABLE'});
});
test('external endpoint alternative keeps exact target, certificate and hostname checks',()=>{
  const external=url.replace('@dpg-dbh8tghsrm7s73f4tc9g-a/','@dpg-dbh8tghsrm7s73f4tc9g-a.virginia-postgres.render.com/');
  const o=databaseOptions('A',external);assert.equal(o.host,o.ssl.servername);assert.equal(o.ssl.rejectUnauthorized,true);
  assert.throws(()=>databaseOptions('A',external.replace('.virginia-postgres.render.com','.other.invalid')));
});
test('requested U2 cannot become the transaction owner of verified U1',async()=>{
  const f=fixture();assert.equal(await f.store.read(principal,'U2'),null);
  assert.deepEqual(f.calls[1].args,['U1']);assert.deepEqual(f.calls[2].args,['HML-A-U2']);assert.equal(f.calls.at(-1).sql,'COMMIT');assert.equal(f.released,1);
});
test('forged principal is rejected before a connection is acquired',async()=>{
  const f=fixture();await assert.rejects(f.store.read({subject:'fixture-u1',label:'U2'},'U2'),{message:'E_DATABASE_UNAVAILABLE'});assert.equal(f.connected,0);
});
test('cross-user write reaches SQL under verified owner, zero rows gives null',async()=>{
  const f=fixture();assert.equal(await f.store.write(principal,'U2','synthetic'),null);
  assert.deepEqual(f.calls[1].args,['U1']);assert.deepEqual(f.calls[2].args,['synthetic','HML-A-U2']);assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('database failure rolls back and returns only fixed sanitized category',async()=>{
  const f=fixture({fail:true});await assert.rejects(f.store.read(principal,'U1'),{message:'E_DATABASE_UNAVAILABLE'});assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.released,1);
});
test('readiness requires TLS, exact role and forced RLS, with no memory fallback',async()=>{
  await fixture().store.ready();await assert.rejects(fixture({ready:false}).store.ready(),{message:'E_DATABASE_UNAVAILABLE'});
});
test('startup diagnostics classify fixed codes without reflecting provider messages',()=>{
  for(const [code,expected]of [['ERR_TLS_CERT_ALTNAME_INVALID','tls_validation'],['28P01','authentication'],['42501','privilege'],['ENOTFOUND','network_dns'],['ECONNREFUSED','network_connection'],['raw-secret','unknown']])assert.equal(databaseFailureCategory({code,message:'private-runtime-material'}),expected);
});

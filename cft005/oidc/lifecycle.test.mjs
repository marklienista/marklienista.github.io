import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLifecycleProbe} from './lifecycle.mjs';
const cfg={callbackUrl:'https://a.test/callback.html',allowedCallbacks:['https://a.test/callback.html'],provider:'custom:conta-central',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_FIXTURE'};
function fixture({expired=true,wrongPerson=false,revoked=true}={}){
  let time=1000000,removed=false,calls=0,signoutOptions;
  const sdk={createClient:(_u,_k,{auth:o})=>{if(!o.persistSession)return {auth:{refreshSession:async()=>revoked?{error:{status:400,code:'refresh_token_not_found'}}:{data:{session:{}}}}};
    assert.equal(o.autoRefreshToken,false);
    return {auth:{stopAutoRefresh:async()=>{},getSession:async()=>({data:{session:removed?null:{access_token:'FIXTURE_ACCESS_OLD',refresh_token:'FIXTURE_REFRESH_OLD',expires_at:1100}}}),getUser:async token=>{calls++;return token==='FIXTURE_ACCESS_OLD'&&time>1100000&&expired?{error:{status:401,code:'bad_jwt',message:'JWT expired'}}:{data:{user:{id:token==='FIXTURE_ACCESS_NEW'&&wrongPerson?'other-person':'test-person'}}};},refreshSession:async r=>{assert.equal(r.refresh_token,'FIXTURE_REFRESH_OLD');return {data:{session:{access_token:'FIXTURE_ACCESS_NEW',refresh_token:'FIXTURE_REFRESH_NEW'}}};},signOut:async o=>{signoutOptions=o;removed=true;return {};}}};}};
  return {probe:makeLifecycleProbe(sdk,cfg,{now:()=>time}),advance:()=>{time=1176000;},calls:()=>calls,options:()=>signoutOptions};
}
test('natural expiry checks the held access before renewal and local revocation uses only local scope',async()=>{
  const f=fixture();let r=await f.probe.capture();assert.equal(r.verifiedBeforeExpiry,true);
  assert.equal((await f.probe.checkExpiry()).expiry,null);assert.equal(f.calls(),1);
  f.advance();r=await f.probe.checkExpiry();assert.equal(r.expiry.result,'PASS');assert.equal(r.expiry.identityPreserved,true);
  r=await f.probe.revokeLocal();assert.equal(r.revocation.result,'PASS');assert.deepEqual(f.options(),{scope:'local'});
  assert.doesNotMatch(JSON.stringify(r),/FIXTURE_|test-person/);
});
test('expiry cannot pass if old token is accepted or recovery returns a different identity',async()=>{
  for(const config of [{expired:false},{wrongPerson:true}]){const f=fixture(config);await f.probe.capture();f.advance();assert.equal((await f.probe.checkExpiry()).expiry.result,'FAIL');await assert.rejects(f.probe.revokeLocal());}
});
test('unexpected acceptance of a locally revoked issued refresh fails the probe',async()=>{
  const f=fixture({revoked:false});await f.probe.capture();f.advance();await f.probe.checkExpiry();assert.equal((await f.probe.revokeLocal()).revocation.result,'FAIL');
});

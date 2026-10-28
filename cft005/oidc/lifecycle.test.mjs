import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLifecycleProbe} from './lifecycle.mjs';
const cfg={callbackUrl:'https://a.test/callback.html',allowedCallbacks:['https://a.test/callback.html'],provider:'custom:conta-central',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_FIXTURE'};
function fixture({expired=true,wrongPerson=false,revoked=true,errorStatus=401,errorCode='bad_jwt',errorMessage='JWT expired'}={}){
  let time=1000000,removed=false,calls=0,signoutOptions,access='FIXTURE_ACCESS_OLD',refresh='FIXTURE_REFRESH_OLD';
  const sdk={createClient:(_u,_k,{auth:o})=>{if(!o.persistSession)return {auth:{refreshSession:async()=>revoked?{error:{status:400,code:'refresh_token_not_found'}}:{data:{session:{}}}}};
    assert.equal(o.autoRefreshToken,false);
    return {auth:{stopAutoRefresh:async()=>{},getSession:async()=>({data:{session:removed?null:{access_token:access,refresh_token:refresh,expires_at:1100}}}),getUser:async token=>{calls++;return token==='FIXTURE_ACCESS_OLD'&&time>1100000&&expired?{error:{status:errorStatus,code:errorCode,message:errorMessage}}:{data:{user:{id:token==='FIXTURE_ACCESS_NEW'&&wrongPerson?'other-person':'test-person'}}};},refreshSession:async r=>{assert.equal(r.refresh_token,'FIXTURE_REFRESH_OLD');access='FIXTURE_ACCESS_NEW';refresh='FIXTURE_REFRESH_NEW';return {data:{session:{access_token:access,refresh_token:refresh}}};},signOut:async o=>{signoutOptions=o;removed=true;return {};}}};}};
  return {probe:makeLifecycleProbe(sdk,cfg,{now:()=>time}),advance:()=>{time=1176000;},changeSession:()=>{access='FIXTURE_OTHER_SESSION';},calls:()=>calls,options:()=>signoutOptions};
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
test('expired JWT may use HTTP 403, but generic 403 or a non-expiry JWT error stays blocked',async()=>{
  for(const [options,expected]of [[{errorStatus:403},'PASS'],[{errorStatus:403,errorCode:'unknown'},'BLOCKED'],[{errorStatus:403,errorMessage:'Invalid signature'},'BLOCKED']]){
    const f=fixture(options);await f.probe.capture();f.advance();assert.equal((await f.probe.checkExpiry()).expiry.result,expected);
  }
});
test('local-only revocation verifies an issued session without claiming natural expiry',async()=>{
  const f=fixture();const ready=await f.probe.captureForRevocation();assert.equal(ready.phase,'READY_FOR_LOCAL_REVOCATION');assert.equal(ready.expiry,null);
  const r=await f.probe.revokeLocal();assert.equal(r.revocation.result,'PASS');assert.equal(r.expiry,null);assert.deepEqual(f.options(),{scope:'local'});
});
test('local revocation refuses to sign out a session changed after capture',async()=>{
  const f=fixture();await f.probe.captureForRevocation();f.changeSession();await assert.rejects(f.probe.revokeLocal(),/probe_session_changed/);assert.equal(f.options(),undefined);
});

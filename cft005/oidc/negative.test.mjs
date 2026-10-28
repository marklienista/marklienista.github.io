import test from 'node:test';
import assert from 'node:assert/strict';
import {completeNegativeLogin} from './negative.mjs';
const cfg={callbackUrl:'https://b.test/callback.html',allowedCallbacks:['https://b.test/callback.html'],provider:'custom:conta-central',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_FIXTURE'};
test('negative PKCE requires the server mismatch category and keeps primary storage separate',async()=>{
  globalThis.location={search:''};
  for(const [error,expected]of [[{status:400,code:'bad_code_verifier'},'PASS'],[{status:400,code:'validation_failed'},'BLOCKED'],[null,'FAIL']]){
    const sdk={createClient:(_u,_k,{auth})=>{assert.equal(auth.storageKey,'cft005.oidc.negative');assert.equal(auth.autoRefreshToken,false);assert.equal(auth.storage.getItem('cft005.oidc.demo'),null);return {auth:{exchangeCodeForSession:async code=>{assert.equal(code,'SYNTHETIC_FIXTURE');return {error,data:{session:null}};}}};}};
    const r=await completeNegativeLogin(sdk,cfg,cfg.callbackUrl+'?code=SYNTHETIC_FIXTURE');assert.equal(r.result,expected);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_FIXTURE|WRONG_VERIFIER/);
  }
  delete globalThis.location;
});

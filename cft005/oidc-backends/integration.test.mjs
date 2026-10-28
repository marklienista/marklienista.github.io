import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {protocolFixture} from './protocol-fixture.mjs';
import {loadConfig,ISSUER,AUDIENCE} from './config.mjs';

test('two confidential BFFs against LOCAL protocol fixture; NOT real Auth0 issuance',async t=>{
  const fixture=await protocolFixture();let closed=false;
  const close=async()=>{if(!closed){await fixture.close();closed=true;}};t.after(close);
  const cases=[];
  const check=async(id,label,run)=>t.test(id+' '+label,async()=>{
    const record={id,label,result:'FAIL'};
    try{await run();record.result='PASS';}finally{cases.push(record);}
  });
  const jars={};const sessionInfo={};
  for(const product of ['A','B'])for(const user of ['U1','U2']){
    const key=product+user;
    await check(key+'-LOGIN','confidential code exchange with S256, state and nonce',async()=>{
      const login=await fixture.login(product,user);jars[key]=login.jar;
      assert.equal(login.response.status,303);assert.equal(login.response.json.authenticated,true);
      assert.equal(login.response.headers.location,'/');
      const set=login.response.setCookies.find(c=>c.startsWith('__Host-cft005-session='));
      assert.ok(Boolean(set));for(const attr of ['Secure','HttpOnly','SameSite=Lax','Path=/'])assert.ok(set.includes(attr));
      assert.equal(set.includes('Domain='),false);
      assert.deepEqual(Object.keys(login.response.json),['authenticated']);
    });
    await check(key+'-SESSION','server session exposes only synthetic label and CSRF',async()=>{
      const r=await fixture.request(product,{path:'/session',jar:jars[key]});
      assert.equal(r.status,200);assert.equal(r.json.product,product);assert.equal(r.json.user,user);
      assert.deepEqual(Object.keys(r.json).sort(),['csrf','product','user']);sessionInfo[key]=r.json;
    });
    await check(key+'-READ','read own private synthetic record',async()=>{
      const r=await fixture.request(product,{path:`/api/products/${product}/records/${user}`,jar:jars[key]});
      assert.equal(r.status,200);assert.equal(r.json.record.value,`synthetic-${user}-${product}`);
    });
    await check(key+'-WRITE','write own private record with session and CSRF',async()=>{
      const r=await fixture.request(product,{path:`/api/products/${product}/records/${user}`,jar:jars[key],method:'PUT',
        body:JSON.stringify({value:`updated-${user}-${product}`}),headers:{Origin:fixture.configs[product].origin,
          'X-CFT005-CSRF':sessionInfo[key].csrf,'Content-Type':'application/json'}});
      assert.equal(r.status,200);assert.equal(r.json.record.value,`updated-${user}-${product}`);
    });
    await check(key+'-CROSS-USER','cannot read or write other synthetic user',async()=>{
      for(const method of ['GET','PUT']) {
        const r=await fixture.request(product,{path:`/api/products/${product}/records/${user==='U1'?'U2':'U1'}`,jar:jars[key],method,
          body:method==='PUT'?'{}':'',headers:{Origin:fixture.configs[product].origin,'X-CFT005-CSRF':sessionInfo[key].csrf}});
        assert.equal(r.status,404);assert.deepEqual(r.json,{error:'not_found'});
      }
    });
  }
  await check('OIDC-PARAMS','login uses confidential code flow and form_post',async()=>{
    const tx=await fixture.begin('A');
    for(const [name,value]of Object.entries({response_type:'code',response_mode:'form_post',code_challenge_method:'S256',audience:AUDIENCE}))assert.equal(tx.url.searchParams.get(name),value);
    for(const name of ['state','nonce','code_challenge'])assert.ok(Boolean(tx.url.searchParams.get(name)));
    assert.equal(tx.url.searchParams.get('prompt'),null);
    const forced=await fixture.begin('A',new Map(),{reauthenticate:true});
    assert.equal(forced.url.searchParams.get('prompt'),'login');
    assert.ok(tx.response.setCookies.some(c=>c.includes('SameSite=None')&&c.includes('Secure')&&c.includes('HttpOnly')));
  });
  await check('STATE','wrong state rejected before token exchange',async()=>{
    const tx=await fixture.begin('A');const before=fixture.stats.codeRequests;
    tx.form.set('state','wrong-synthetic-state');const r=await fixture.finish('A',tx);
    assert.deepEqual(r.json,{error:'login_failed'});assert.equal(fixture.stats.codeRequests,before);
  });
  await check('NONCE','wrong signed ID Token nonce rejected',async()=>{
    const r=await fixture.login('A','U1',{badNonce:true});assert.deepEqual(r.response.json,{error:'login_failed'});
    assert.equal((await fixture.request('A',{path:'/session',jar:r.jar})).status,401);
  });
  await check('UNKNOWN-USER','unapproved signed subject cannot create session',async()=>{
    const r=await fixture.login('A','unknown');assert.deepEqual(r.response.json,{error:'login_failed'});
  });
  await check('WRONG-CLIENT','access token signed for client B rejected by A',async()=>{
    const r=await fixture.login('A','U1',{accessClaims:{azp:fixture.configs.B.clientId}});assert.deepEqual(r.response.json,{error:'login_failed'});
  });
  await check('WRONG-AUDIENCE','access token for another API rejected',async()=>{
    const r=await fixture.login('A','U1',{accessClaims:{aud:'https://other.invalid'}});assert.deepEqual(r.response.json,{error:'login_failed'});
  });
  for(const [id,options]of [
    ['ID-SIGNATURE',{badIdSignature:true}],['ACCESS-SIGNATURE',{badAccessSignature:true}],
    ['EXPIRED-ACCESS',{accessClaims:{exp:Math.floor(Date.now()/1000)-1}}],
    ['WRONG-ISSUER',{accessClaims:{iss:'https://untrusted.invalid/'}}],
    ['NO-READ-SCOPE',{accessClaims:{scope:'openid'}}]
  ])await check(id,'invalid signature or claims cannot establish a session',async()=>{
    const r=await fixture.login('A','U1',options);assert.deepEqual(r.response.json,{error:'login_failed'});
    assert.equal((await fixture.request('A',{path:'/session',jar:r.jar})).status,401);
  });
  await check('PKCE','wrong verifier fails at the confidential token endpoint',async()=>{
    const before=fixture.stats.refusedExchanges;
    const r=await fixture.login('A','U1',{badChallenge:true});assert.deepEqual(r.response.json,{error:'login_failed'});
    assert.equal(fixture.stats.refusedExchanges,before+1);
  });
  await check('CALLBACK-REPLAY','callback transaction consumed once',async()=>{
    const tx=await fixture.begin('A');await fixture.finish('A',tx);
    const before=fixture.stats.codeRequests;const r=await fixture.finish('A',tx);
    assert.deepEqual(r.json,{error:'login_failed'});assert.equal(fixture.stats.codeRequests,before);
  });
  await check('CODE-TRANSPLANT','A code cannot be exchanged by client B',async()=>{
    const a=await fixture.begin('A'),b=await fixture.begin('B');b.form.set('code',a.code);
    const before=fixture.stats.refusedExchanges;const r=await fixture.finish('B',b);
    assert.deepEqual(r.json,{error:'login_failed'});assert.equal(fixture.stats.refusedExchanges,before+1);
  });
  await check('COOKIE-TRANSPLANT','A session cookie cannot select session on B',async()=>{
    const copy=new Map(jars.AU1);const r=await fixture.request('B',{path:'/session',jar:copy});assert.equal(r.status,401);
  });
  await check('TX-TRANSPLANT','A transaction cookie cannot select transaction on B',async()=>{
    const tx=await fixture.begin('A');const r=await fixture.finish('B',tx);assert.deepEqual(r.json,{error:'login_failed'});
  });
  await check('BEARER-INJECTION','browser bearer cannot bootstrap backend authorization',async()=>{
    const r=await fixture.request('A',{path:'/session',jar:jars.AU1,headers:{Authorization:'Bearer synthetic-untrusted-value'}});
    assert.equal(r.status,401);assert.deepEqual(r.json,{error:'browser_bearer_forbidden'});
  });
  await check('CROSS-PRODUCT','same user cannot select another product by URL or headers',async()=>{
    for(const product of ['A','B']){
      const other=product==='A'?'B':'A';
      const r=await fixture.request(product,{path:`/api/products/${other}/records/U1`,jar:jars[product+'U1'],headers:{Origin:fixture.configs[other].origin,'X-App-Id':other,'X-User-Id':'U2'}});
      assert.equal(r.status,403);assert.deepEqual(r.json,{error:'product_forbidden'});
    }
  });
  await check('CSRF','write requires own session CSRF and own Origin',async()=>{
    for(const headers of [{},{Origin:fixture.configs.A.origin},{Origin:fixture.configs.B.origin,'X-CFT005-CSRF':sessionInfo.AU1.csrf}]){
      const r=await fixture.request('A',{path:'/api/products/A/records/U1',jar:jars.AU1,method:'PUT',body:'{"value":"forbidden"}',headers:{'Content-Type':'application/json',...headers}});
      assert.equal(r.status,403);assert.deepEqual(r.json,{error:'csrf_required'});
    }
  });
  await check('BODY-OWNERSHIP','body cannot change product or owner',async()=>{
    const r=await fixture.request('A',{path:'/api/products/A/records/U1',jar:jars.AU1,method:'PUT',body:'{"value":"forbidden","product":"B","user":"U2"}',
      headers:{Origin:fixture.configs.A.origin,'X-CFT005-CSRF':sessionInfo.AU1.csrf,'Content-Type':'application/json'}});
    assert.equal(r.status,400);
  });
  await check('CALLBACK-QUERY','code-bearing GET callback rejected; no URL-based flow',async()=>{
    const r=await fixture.request('A',{path:'/auth/callback?code=synthetic-code'});assert.equal(r.status,400);
    assert.equal(r.text.includes('synthetic-code'),false);
  });
  await check('DIRECT-DATA','no direct database-style route exists',async()=>{
    assert.equal((await fixture.request('A',{path:'/rest/v1/records'})).status,401);
    assert.equal((await fixture.request('A',{path:'/rest/v1/records',jar:jars.AU1})).status,404);
  });
  await check('PRESERVATION','negative writes preserve all four synthetic records',async()=>{
    for(const product of ['A','B'])for(const user of ['U1','U2']){
      const r=await fixture.request(product,{path:`/api/products/${product}/records/${user}`,jar:jars[product+user]});
      assert.equal(r.json.record.value,`updated-${user}-${product}`);
    }
  });
  for(const [product,user]of [['A','U1'],['B','U2']])await check('PROOF-'+product,'real HTTP runner, signed foreign-client refusal and sanitized receipt (LOCAL issuer)',async()=>{
    const r=await fixture.request(product,{path:'/proof/run',method:'POST',jar:jars[product+user],
      headers:{Origin:fixture.configs[product].origin,'X-CFT005-CSRF':sessionInfo[product+user].csrf}});
    assert.equal(r.status,200);assert.equal(r.json.result,'PASS');assert.equal(r.json.cases.length,11);
    assert.equal(r.json.cases.filter(c=>c.bindingVerified===true).length,2);
    assert.equal(r.json.cases.every(c=>c.result==='PASS'),true);
    const publicResult=await fixture.request(product,{path:'/proof/results'});
    assert.equal(publicResult.status,200);assert.equal(publicResult.json.receipts.length,1);
    assert.deepEqual(publicResult.json.receipts[0],r.json);
    for(const secret of [sessionInfo[product+user].csrf,...jars[product+user].values(),fixture.configs[product].clientSecret,'auth0|synthetic-u1','auth0|synthetic-u2']){
      assert.equal(publicResult.text.includes(secret),false);
    }
  });
  await check('PROOF-BOUNDARIES','anonymous or forged requests cannot run proof or obtain data from token probe',async()=>{
    assert.equal((await fixture.request('A',{path:'/proof/run',method:'POST'})).status,401);
    assert.equal((await fixture.request('A',{path:'/proof/run',method:'POST',jar:jars.AU1})).status,403);
    assert.equal((await fixture.request('A',{path:'/proof/token-policy'})).status,405);
    const rejected=await fixture.request('A',{path:'/proof/token-policy',method:'POST',body:'{"permission":"records:read"}',
      headers:{Authorization:'Bearer synthetic-forged','Content-Type':'application/json'}});
    assert.equal(rejected.status,401);assert.deepEqual(rejected.json,{error:'unauthorized'});
    const malformed=await fixture.request('A',{path:'/proof/token-policy',method:'POST',body:'{"permission":"records:read","destination":"https://untrusted.invalid"}',
      headers:{Authorization:'Bearer synthetic-forged','Content-Type':'application/json'}});
    assert.equal(malformed.status,400);
  });
  await check('LOGIN-DIAGNOSTICS','fixed categories reveal failure stage without raw errors, codes or identities',async()=>{
    const missing=await fixture.request('A',{path:'/auth/callback',method:'POST',body:'code=synthetic-private-code&state=synthetic-private-state',
      headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    assert.equal(missing.status,303);
    let status=await fixture.request('A',{path:'/auth/status'});
    assert.equal(status.json.last.stage,'transaction_cookie_missing');
    const original=fixture.providers.A.complete;
    fixture.providers.A.complete=async()=>{const e=new Error('synthetic-private-error');e.loginStage='synthetic-private-stage';throw e;};
    let attempt;
    try{attempt=await fixture.begin('A');await fixture.finish('A',attempt);}
    finally{fixture.providers.A.complete=original;}
    status=await fixture.request('A',{path:'/auth/status'});
    assert.equal(status.json.last.stage,'session_creation');assert.equal(status.json.last.result,'FAIL');
    assert.deepEqual(Object.keys(status.json).sort(),['callbacks','failures','last','product','started','successes']);
    assert.deepEqual(Object.keys(status.json.last).sort(),['at','result','stage']);
    for(const secret of ['synthetic-private-error','synthetic-private-stage','synthetic-private-code','synthetic-private-state',attempt.code,...attempt.jar.values(),fixture.configs.A.clientSecret]){
      assert.equal(status.text.includes(secret),false);
    }
    await fixture.login('A','unknown');
    assert.equal((await fixture.request('A',{path:'/auth/status'})).json.last.stage,'subject_allowlist');
    await fixture.login('A','U1');
    status=await fixture.request('A',{path:'/auth/status'});
    assert.equal(status.json.last.stage,'authenticated');assert.equal(status.json.last.result,'PASS');
  });
  await check('DENIAL-PHASES','authorization denial and token-endpoint refusal have separate sanitized categories',async()=>{
    const tx=await fixture.begin('A');
    tx.form.delete('code');tx.form.set('error','access_denied');tx.form.set('error_description','synthetic-private-provider-detail');
    const before=fixture.stats.codeRequests;
    await fixture.finish('A',tx);
    assert.equal(fixture.stats.codeRequests,before);
    let r=await fixture.request('A',{path:'/auth/status'});
    assert.equal(r.json.last.stage,'provider_denied');assert.equal(r.json.last.phase,'authorization_response');
    assert.equal(r.json.last.reason,'unspecified');assert.equal(r.text.includes('synthetic-private-provider-detail'),false);
    await fixture.login('A','U1',{tokenEndpointDenial:true});
    r=await fixture.request('A',{path:'/auth/status'});
    assert.equal(r.json.last.stage,'provider_denied');assert.equal(r.json.last.phase,'token_endpoint');
    assert.equal(r.json.last.reason,'unauthorized');assert.equal(r.json.last.result,'FAIL');
  });
  await check('LOCAL-LOGOUT','logout A leaves B authenticated',async()=>{
    const r=await fixture.request('A',{path:'/logout',method:'POST',jar:jars.AU1,
      headers:{Origin:fixture.configs.A.origin,'X-CFT005-CSRF':sessionInfo.AU1.csrf}});
    assert.equal(r.status,200);
    assert.equal((await fixture.request('A',{path:'/session',jar:jars.AU1})).status,401);
    assert.equal((await fixture.request('B',{path:'/session',jar:jars.BU1})).status,200);
  });
  await check('LOGOUT-OFFLINE','local cleanup survives provider verification outage',async()=>{
    const original=fixture.providers.A.authorize;
    fixture.providers.A.authorize=async()=>{throw new Error('synthetic-outage');};
    try{
      const r=await fixture.request('A',{path:'/logout',method:'POST',jar:jars.AU2,
        headers:{Origin:fixture.configs.A.origin,'X-CFT005-CSRF':sessionInfo.AU2.csrf}});
      assert.equal(r.status,200);
    }finally{fixture.providers.A.authorize=original;}
    assert.equal((await fixture.request('A',{path:'/session',jar:jars.AU2})).status,401);
  });
  await check('CONFIG','missing secrets and shared client IDs fail closed',async()=>{
    assert.throws(()=>loadConfig({}),{message:'E_CONFIG'});
    assert.throws(()=>loadConfig({PRODUCT:'A',PUBLIC_ORIGIN:'https://a.invalid',AUTH0_ISSUER:ISSUER,AUTH0_AUDIENCE:AUDIENCE,
      AUTH0_CLIENT_ID_A:'same-client-id',AUTH0_CLIENT_ID_B:'same-client-id',AUTH0_CLIENT_SECRET:'x'.repeat(64),SYNTHETIC_SUBJECTS_JSON:'{"synthetic":"U1"}'}),{message:'E_CONFIG'});
  });
  await close();
  const sourceSha256={};
  for(const file of ['backend.mjs','provider.mjs','config.mjs','start.mjs','protocol-fixture.mjs','integration.test.mjs','package.json','pnpm-lock.yaml']){
    sourceSha256[file]=createHash('sha256').update((await readFile(new URL(file,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex');
  }
  await writeFile(new URL('integration-evidence.json',import.meta.url),JSON.stringify({schema:1,
    scope:'LOCAL-OIDC-PROTOCOL-FIXTURE-NOT-AUTH0',generatedAt:new Date().toISOString(),node:process.version,
    realAuth0Issuance:'BLOCKED',deployedBackends:0,realAccountsUsed:0,realDataAccessed:false,serversClosed:closed,
    sourceHashEncoding:'UTF-8 LF',sourceSha256,total:cases.length,passed:cases.filter(c=>c.result==='PASS').length,
    failed:cases.filter(c=>c.result!=='PASS').length,cases},null,2)+'\n');
});

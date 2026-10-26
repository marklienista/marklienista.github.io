import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syntheticEnvironment} from './fixtures.mjs';

// Real loopback HTTP and real ES256 signatures; synthetic issuer and in-memory data.
// Evidence is allowlisted below, never a dump of requests/responses/credentials.
test('CFT-005 isolated backend authorization: HTTP + cryptographic verification',async t=>{
  const env=await syntheticEnvironment();
  let serverClosed=false;
  const close=async()=>{if(!serverClosed){await env.close();serverClosed=true;}};
  t.after(close);
  const cases=[];
  async function scenario(id,label,expected,operation,verify) {
    await t.test(`${id} ${label}`,async()=>{
      const record={id,label,expectedHttp:expected,actualHttp:null,result:'FAIL'};
      try {
        const response=await operation();
        record.actualHttp=response.status;
        assert.equal(response.status,expected,`${id}: HTTP status`);
        if (response.status!==200) {
          assert.deepEqual(Object.keys(response.body),['error']);
          assert.ok(['unauthorized','client_product_mismatch','scope_required','not_found',
            'product_forbidden','invalid_body','body_too_large','invalid_host'].includes(response.body.error),
          `${id}: response must contain a fixed safe error only`);
        }
        if (verify) await verify(response);
        record.result='PASS';
      } finally {cases.push(record);}
    });
  }
  const path=(user,product)=>`/products/${product}/records/${user}-${product}`;
  let number=0;
  const id=()=>`P${String(++number).padStart(2,'0')}`;
  const u1a=await env.access({user:'U1',product:'A'});
  const u1b=await env.access({user:'U1',product:'B'});

  for(const user of ['U1','U2']) for(const product of ['A','B']) {
    const token=await env.access({user,product});
    await scenario(id(),`${user}/${product} reads own record`,200,
      ()=>env.request({token,product,path:path(user,product)}),r=>{
        assert.equal(r.body.record.id,`${user}-${product}`);
        assert.equal(r.headers.get('cache-control'),'no-store');
        assert.equal(r.headers.get('access-control-allow-origin'),null);
      });
    await scenario(id(),`${user}/${product} writes own record`,200,
      ()=>env.request({token,product,method:'PUT',path:path(user,product),body:JSON.stringify({value:`updated-${user}-${product}`})}));
    await scenario(id(),`${user}/${product} reads persisted synthetic update`,200,
      ()=>env.request({token,product,path:path(user,product)}),r=>assert.equal(r.body.record.value,`updated-${user}-${product}`));
  }
  for(const product of ['A','B']) for(const user of ['U1','U2']) {
    const other=user==='U1'?'U2':'U1';
    const token=await env.access({user,product});
    await scenario(id(),`${user}/${product} cannot read ${other}/${product}`,404,
      ()=>env.request({token,product,path:path(other,product)}));
    await scenario(id(),`${user}/${product} cannot overwrite ${other}/${product}`,404,
      ()=>env.request({token,product,method:'PUT',path:path(other,product),body:'{"value":"forbidden"}'}));
  }
  for(const product of ['A','B']) {
    const other=product==='A'?'B':'A';
    const token=await env.access({product});
    await scenario(id(),`same user: backend ${product} cannot read product ${other}`,403,
      ()=>env.request({token,product,path:path('U1',other)}));
    await scenario(id(),`same user: backend ${product} cannot write product ${other}`,403,
      ()=>env.request({token,product,method:'PUT',path:path('U1',other),body:'{"value":"forbidden"}'}));
    await scenario(id(),`token ${product} copied to backend ${other} is refused`,403,
      ()=>env.request({token,product:other,path:path('U1',other)}));
    await scenario(id(),`record ID cannot cross product inside route ${product}`,404,
      ()=>env.request({token,product,path:`/products/${product}/records/U1-${other}`}));
  }

  await scenario(id(),'bearer alone has no backend identity',401,()=>env.request({token:u1a,omitProof:true}));
  await scenario(id(),'service signature alone has no user identity',401,()=>env.request({omitToken:true}));
  await scenario(id(),'untrusted service key cannot impersonate A',401,()=>env.request({proofOptions:{wrongKey:true}}));
  await scenario(id(),'unregistered service key ID is refused',401,()=>env.request({proofOptions:{header:{kid:'unknown-backend'}}}));
  await scenario(id(),'service A cannot relabel its key as B',401,()=>env.request({proofOptions:{header:{kid:'backend-b'}}}));

  const accessVariants=[
    ['wrong identity signature',{wrongKey:true}],
    ['wrong issuer',{claims:{iss:'https://untrusted.cft005.test/'}}],
    ['wrong API audience',{claims:{aud:'urn:cft005:other-api'}}],
    ['expired access token',{claims:{iat:Math.floor(Date.now()/1000)-121,exp:Math.floor(Date.now()/1000)-1}}],
    ['future not-before',{claims:{nbf:Math.floor(Date.now()/1000)+60}}],
    ['future issued-at',{claims:{iat:Math.floor(Date.now()/1000)+60,exp:Math.floor(Date.now()/1000)+120}}],
    ['excessive access lifetime',{claims:{exp:Math.floor(Date.now()/1000)+3600}}],
    ['unknown subject',{claims:{sub:'unmapped-synthetic-subject'}}],
    ['missing subject',{claims:{sub:undefined}}],
    ['missing client identity',{claims:{azp:undefined}}],
    ['ID token cannot substitute access token',{header:{typ:'JWT'}}],
    ['unregistered issuer key ID',{header:{kid:'unknown-identity'}}],
    ['attacker-controlled JWKS header',{header:{jku:'https://untrusted.cft005.test/jwks'}}],
    ['generic Supabase-style token is not product authorization',{
      claims:{iss:'https://synthetic.supabase.test/auth/v1',aud:'authenticated',azp:undefined,role:'authenticated'}}]
  ];
  for(const [label,options] of accessVariants) {
    const token=await env.access(options);
    await scenario(id(),label,401,()=>env.request({token}));
  }
  await scenario(id(),'unknown signed client is refused',403,async()=>env.request({token:await env.access({claims:{azp:'unregistered-client'}})}));
  await scenario(id(),'conflicting access-token client profiles are refused',403,async()=>env.request({token:await env.access({claims:{client_id:'client-a'}})}));
  await scenario(id(),'read-only scope cannot write',403,async()=>env.request({token:await env.access({claims:{scope:'records:read'}}),method:'PUT',body:'{"value":"forbidden"}'}));
  await scenario(id(),'write-only scope cannot read',403,async()=>env.request({token:await env.access({claims:{scope:'records:write'}})}));

  const proofVariants=[
    ['wrong service issuer',{claims:{iss:'urn:cft005:attacker'}}],
    ['wrong service audience',{claims:{aud:'urn:cft005:other-gateway'}}],
    ['wrong service subject',{claims:{sub:'urn:cft005:backend-b'}}],
    ['expired service proof',{claims:{iat:Math.floor(Date.now()/1000)-31,exp:Math.floor(Date.now()/1000)-1}}],
    ['excessive service proof lifetime',{claims:{exp:Math.floor(Date.now()/1000)+600}}],
    ['service proof future issued-at',{claims:{iat:Math.floor(Date.now()/1000)+10}}],
    ['missing replay nonce',{claims:{jti:undefined}}],
    ['changed HTTP method',{claims:{htm:'PUT'}}],
    ['changed request destination',{claims:{htu:'https://untrusted.cft005.test/products/A/records/U1-A'}}],
    ['changed body hash',{claims:{bht:'incorrect'}}],
    ['changed bearer hash',{claims:{ath:'incorrect'}}],
    ['service proof cannot substitute identity type',{header:{typ:'at+jwt'}}],
    ['untrusted key URL cannot override pinned service key',{header:{jku:'https://untrusted.cft005.test/jwks'}}]
  ];
  for(const [label,options] of proofVariants) await scenario(id(),label,401,()=>env.request({proofOptions:options}));

  const proof=await env.proof({token:u1a});
  await scenario(id(),'first bound service proof succeeds',200,()=>env.request({token:u1a,signedProof:proof}));
  await scenario(id(),'replayed service proof is rejected',401,()=>env.request({token:u1a,signedProof:proof}));
  const parallel=await env.proof({token:u1a});
  await scenario(id(),'concurrent replay allows exactly one call',200,async()=>{
    const responses=await Promise.all([env.request({token:u1a,signedProof:parallel}),env.request({token:u1a,signedProof:parallel})]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
    return responses.find(r=>r.status===200);
  });
  const writeProof=await env.proof({token:u1a,method:'PUT',body:'{"value":"intended"}'});
  await scenario(id(),'write body cannot be changed after signing',401,
    ()=>env.request({token:u1a,method:'PUT',body:'{"value":"tampered"}',signedProof:writeProof}));
  const tokenProof=await env.proof({token:u1a});
  await scenario(id(),'user bearer cannot be swapped after signing',401,
    ()=>env.request({token:u1b,signedProof:tokenProof}));
  const [h,p,s]=u1a.split('.');
  const payload=JSON.parse(Buffer.from(p,'base64url').toString());
  payload.azp='client-b';
  const tampered=[h,Buffer.from(JSON.stringify(payload)).toString('base64url'),s].join('.');
  await scenario(id(),'modified product claim invalidates the user signature',401,()=>env.request({token:tampered,product:'B',path:path('U1','B')}));
  const unsigned=[Buffer.from('{"alg":"none","typ":"at+jwt","kid":"identity-fixture"}').toString('base64url'),p,''].join('.');
  await scenario(id(),'unsigned alg none token is refused',401,()=>env.request({token:unsigned}));
  await scenario(id(),'malformed bearer is refused',401,()=>env.request({token:'not.a.jwt'}));

  for(const [label,headers] of [
    ['without Origin',{}],['with Origin A',{Origin:'https://product-a.cft005.test'}],
    ['with forged Origin B',{Origin:'https://product-b.cft005.test'}],
    ['with forged app and forwarding headers',{'X-App-Id':'B','X-Forwarded-Host':'product-b.cft005.test','X-User-Id':'U2'}]
  ]) {
    await scenario(id(),`own access ${label}`,200,()=>env.request({token:u1a,headers}));
    await scenario(id(),`cross-product access ${label}`,403,()=>env.request({token:u1a,headers,path:path('U1','B')}));
  }
  await scenario(id(),'body cannot select product or owner',400,
    ()=>env.request({token:u1a,method:'PUT',body:'{"value":"forbidden","app_id":"B","user_id":"U2"}'}));
  await scenario(id(),'bearer-only direct data route is inaccessible',401,
    ()=>env.request({token:u1a,path:'/rest/v1/synthetic_records',omitProof:true}));
  await scenario(id(),'no authenticated generic data bypass route exists',404,
    ()=>env.request({token:u1a,path:'/rest/v1/synthetic_records'}));
  await scenario(id(),'malformed write body is rejected',400,
    ()=>env.request({token:u1a,method:'PUT',body:'{'}));
  await scenario(id(),'unknown JSON properties are rejected',400,
    ()=>env.request({token:u1a,method:'PUT',body:'{"value":"forbidden","extra":true}'}));
  await scenario(id(),'oversized write is rejected',413,
    ()=>env.request({token:u1a,method:'PUT',body:JSON.stringify({value:'x'.repeat(5000)})}));
  await scenario(id(),'forged Host is rejected',400,
    ()=>env.request({token:u1a,headers:{Host:'untrusted.cft005.test'}}));

  // After all negative writes, verify every resource retained the last authorized value.
  for(const user of ['U1','U2']) for(const product of ['A','B']) {
    await scenario(id(),`negative writes preserved ${user}/${product}`,200,
      async()=>env.request({token:await env.access({user,product}),product,path:path(user,product)}),
      r=>assert.equal(r.body.record.value,`updated-${user}-${product}`));
  }
  const files=['gateway.mjs','fixtures.mjs','proof.test.mjs','package.json','pnpm-lock.yaml'];
  const sources={};
  for(const name of files) sources[name]=createHash('sha256').update((await readFile(new URL(name,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex');
  await close();
  const evidence={schema:1,scope:'isolated-loopback-http-synthetic-issuer-and-data',
    generatedAt:new Date().toISOString(),node:process.version,jose:'6.2.13',
    productionIntegrated:false,realAccountsUsed:0,realDataAccessed:false,serverClosed,
    syntheticUsers:2,syntheticProducts:2,syntheticRecords:4,
    sourceHashEncoding:'UTF-8 with LF line endings',sourceSha256:sources,total:cases.length,passed:cases.filter(x=>x.result==='PASS').length,
    failed:cases.filter(x=>x.result==='FAIL').length,cases};
  await writeFile(new URL('./evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
});

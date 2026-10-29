// Local synthetic protocol fixture + real HTTPS coordinator + native SQL.
// No real Auth0/browser/account. Never exports a cookie, token or signed command.
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {request as httpsRequest} from 'node:https';
import {startCoordinator,createLedgerClient} from './transport.mjs';
import {destination} from './protocol.mjs';
import {protocolFixture} from '../protocol-fixture.mjs';
import {createPostgresStore} from '../record-store.mjs';
const target=new URL(destination);
const pause=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
export async function integratedPostgresProof({root,ca,passwords,config,coordinatorPool,publicKeys,keys,check,lockObserved}){
  let server,port,lastRevoke,writePause,fixture;
  const tlsForTest={cert:ca,key:await readFile(root+'/server.key','utf8')};
  const start=async()=>{server=await startCoordinator({pool:coordinatorPool,publicKeys},{tlsForTest,closePool:false});port=server.port;};
  await start();
  const requestForTest=(url,options,callback)=>{
    assert.equal(url,destination);
    const req=httpsRequest(url,{...options,hostname:'127.0.0.1',port,servername:target.hostname,ca,headers:{...options.headers,Host:target.host}},callback);
    const end=req.end.bind(req);req.end=payload=>{const command=JSON.parse(payload.toString());if(command.envelope.body.action==='revoke')lastRevoke=Buffer.from(payload);return end(payload);};return req;
  };
  const clients=Object.fromEntries(['A','B'].map(product=>[product,createLedgerClient({product,privateKey:keys[product].privateKey},{requestForTest})]));
  const store=cfg=>{
    const role='cft005_hml_'+cfg.product.toLowerCase();
    class LocalPool extends pg.Pool{
      constructor(){super({...config,user:role,password:passwords[cfg.product],database:'cft005_hml_db_teste',max:2,application_name:'cft005-local-http-'+cfg.product});
        this.on('connect',c=>{const query=c.query.bind(c);c.query=(...args)=>{const result=query(...args);if(writePause?.product!==cfg.product||!String(args[0]).startsWith('UPDATE '+role+'.records SET value='))return result;
          const hold=writePause;writePause=undefined;return result.then(async r=>{hold.pid=c.processID;hold.entered.resolve();await hold.release.promise;return r;});};});
      }
    }
    return createPostgresStore(cfg,`postgresql://${role}:synthetic-not-used@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste`,{Pool:LocalPool,ledger:clients[cfg.product]});
  };
  const raw=(payload,path='/v1/command')=>new Promise((resolve,reject)=>{const req=httpsRequest(destination,{hostname:'127.0.0.1',port,servername:target.hostname,ca,method:'POST',path,headers:{Host:target.host,'Content-Type':'application/json'},agent:false,signal:AbortSignal.timeout(5000)},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(payload);});
  const sessions=new Map(),key=(p,u)=>p+u;
  const login=async(p,u)=>{const r=await fixture.login(p,u);const s=await fixture.request(p,{path:'/session',jar:r.jar});assert.equal(s.status,200);assert.equal(s.json.user,u);sessions.set(key(p,u),{jar:r.jar,csrf:s.json.csrf});return r.jar;};
  const req=(p,u,path,method='GET',body,headers={})=>{const s=sessions.get(key(p,u));return fixture.request(p,{path,method,jar:s.jar,...(body===undefined?{}:{body:JSON.stringify(body)}),headers:{Origin:fixture.configs[p].origin,'X-CFT005-CSRF':s.csrf,'Content-Type':'application/json',...headers}});};
  try{
    fixture=await protocolFixture({recordStoreForTest:store,sessionLedgerForTest:p=>clients[p]});
    await check('INT-HTTPS-UNSIGNED-COMMAND-REFUSED',async()=>{assert.equal(await raw('{}'),401);assert.equal(await raw('{}','/v1/command?wrong=1'),404);});
    await check('INT-TLS-HOSTNAME-VALIDATION',async()=>{const wrong=createLedgerClient({product:'A',privateKey:keys.A.privateKey},{requestForTest:(url,o,cb)=>httpsRequest(url,{...o,hostname:'127.0.0.1',port,servername:'wrong.invalid',ca},cb)});await assert.rejects(wrong.snapshot(),{message:'E_LEDGER_UNAVAILABLE'});});
    for(const p of ['A','B'])for(const u of ['U1','U2']){
      await check('INT-'+p+'-'+u+'-OIDC-SNAPSHOT-REGISTER-SESSION',async()=>{await login(p,u);const s=await req(p,u,'/session');assert.deepEqual(Object.keys(s.json).sort(),['csrf','product','user']);});
      await check('INT-'+p+'-'+u+'-POSITIVE-READ-WRITE-RLS',async()=>{const path=`/api/products/${p}/records/${u}`;assert.equal((await req(p,u,path)).status,200);const r=await req(p,u,path,'PUT',{value:`synthetic-proof-${u}-${p}`});assert.equal(r.status,200);assert.equal(r.json.record.revision,u==='U1'?6:5);});
      await check('INT-'+p+'-'+u+'-CROSS-USER-PRODUCT-DENIED',async()=>{const peer=p==='A'?'B':'A',other=u==='U1'?'U2':'U1';for(const method of ['GET','PUT']){assert.equal((await req(p,u,`/api/products/${p}/records/${other}`,method,method==='PUT'?{value:'synthetic-denied'}:undefined)).status,404);assert.equal((await req(p,u,`/api/products/${peer}/records/${u}`,method,method==='PUT'?{value:'synthetic-denied'}:undefined)).status,403);}});
    }
    await check('INT-REVOKE-CSRF-AND-BROWSER-OWNER-BODY-REFUSED',async()=>{assert.equal((await req('A','U1','/sessions/revoke','POST',undefined,{'X-CFT005-CSRF':'wrong'})).status,403);assert.equal((await req('A','U1','/sessions/revoke','POST',{owner:'U2'})).status,400);assert.equal((await req('A','U1','/session')).status,200);});
    await check('INT-LEGACY-AUDIT-DOES-NOT-BYPASS-LEDGER-LOCK',async()=>{const r=await req('A','U1','/proof/technical/run','POST');assert.equal(r.status,503);assert.equal(r.json.error,'technical_requires_ledger_review');});
    await check('INT-LOCAL-LOGOUT-PRESERVES-PEER-AND-U2',async()=>{const r=await req('A','U1','/logout','POST');assert.equal(r.status,200);assert.equal(r.json.durableLocalLogout,true);assert.equal((await req('A','U1','/session')).status,401);for(const [p,u]of [['B','U1'],['A','U2'],['B','U2']])assert.equal((await req(p,u,'/session')).status,200);await login('A','U1');});
    const pending=await fixture.begin('A',new Map(),{user:'U1'});
    const oldB=new Map(sessions.get('BU1').jar);
    await check('INT-HTTP-WRITE-REVOCATION-ACK-ORDERED',async()=>{
      const hold={product:'A',entered:pause(),release:pause()};writePause=hold;
      const write=req('A','U1','/api/products/A/records/U1','PUT',{value:'synthetic-proof-U1-A'});
      await Promise.race([hold.entered.promise,write.then(()=>{throw Error('E_WRITE_WITHOUT_PAUSE');})]);let acknowledged=false;
      const revoke=req('B','U1','/sessions/revoke','POST').then(r=>{acknowledged=r.status===200;return r;});
      try{await lockObserved(hold.pid);assert.equal(acknowledged,false);}finally{hold.release.resolve();}
      assert.equal((await write).status,200);const r=await revoke;assert.equal(r.status,200);assert.deepEqual(r.json,{revoked:true,scope:'hml-user',durable:true});
      assert.equal((await req('A','U1','/session')).status,401);assert.equal((await fixture.request('B',{path:'/session',jar:oldB})).status,401);for(const p of ['A','B'])assert.equal((await req(p,'U2','/session')).status,200);
    });
    await check('INT-PRE-REVOCATION-OIDC-CALLBACK-CANNOT-REACTIVATE',async()=>{assert.equal((await fixture.finish('A',pending)).status,303);assert.equal((await fixture.request('A',{path:'/session',jar:pending.jar})).status,401);assert.equal((await fixture.request('A',{path:'/auth/status'})).json.last.stage,'session_ledger_denied');});
    await check('INT-NEW-LOGIN-SURVIVES-UNEXPIRED-REPLAY',async()=>{for(const p of ['A','B'])await login(p,'U1');const e=JSON.parse(lastRevoke.toString()).envelope;assert.ok(e.exp>Math.floor(Date.now()/1000));assert.equal(await raw(lastRevoke),503);for(const p of ['A','B'])for(const u of ['U1','U2'])assert.equal((await req(p,u,'/session')).status,200);});
    await check('INT-REAL-HTTPS-OUTAGE-FAILS-CLOSED-LOCAL-CLEANUP-WORKS',async()=>{
      await server.close();server=undefined;
      for(const p of ['A','B']){const r=await req(p,'U1','/session');assert.equal(r.status,503);assert.equal(r.json.error,'session_ledger_unavailable');assert.equal((await req(p,'U1',`/api/products/${p}/records/U1`,'PUT',{value:'synthetic-denied'})).status,503);assert.equal((await req(p,'U1','/sessions/revoke','POST')).status,503);}
      const context=await req('A','U1','/logout/context');assert.equal(context.status,200);assert.deepEqual(Object.keys(context.json),['csrf']);const local=await req('A','U1','/logout','POST');assert.equal(local.status,200);assert.equal(local.json.durableLocalLogout,false);
      await start();assert.equal((await req('A','U1','/session')).status,401);assert.equal((await req('B','U1','/session')).status,200);for(const p of ['A','B'])assert.equal((await req(p,'U2','/session')).status,200);await login('A','U1');
    });
    await check('INT-BFF-RESTART-DENIES-OLD-COOKIES-AND-RECOVERS-FRESH-LOGIN',async()=>{const old=Object.fromEntries([...sessions].map(([k,s])=>[k,new Map(s.jar)]));await fixture.restartBackends();for(const p of ['A','B'])for(const u of ['U1','U2']){assert.equal((await fixture.request(p,{path:'/session',jar:old[key(p,u)]})).status,401);await login(p,u);}});
    for(const p of ['A','B'])for(const u of ['U1','U2'])await check('INT-'+p+'-'+u+'-FINAL-PRESERVATION',async()=>{const r=await req(p,u,`/api/products/${p}/records/${u}`);assert.equal(r.status,200);assert.deepEqual(r.json.record,{id:`HML-${p}-${u}`,value:`synthetic-proof-${u}-${p}`,revision:u==='U1'?(p==='A'?7:6):5});});
  }finally{writePause?.release.resolve();if(fixture)await fixture.close();if(server)await server.close();lastRevoke=undefined;}
}

// Real local PostgreSQL/TLS + local OIDC fixture. No hosted credentials or accounts.
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {request as httpsRequest} from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import vm from 'node:vm';
import {protocolFixture} from '../protocol-fixture.mjs';
import {createPostgresStore} from '../record-store.mjs';
import {createLedgerClient,startCoordinator} from '../session-ledger/transport.mjs';
import {destination,sessionHash} from '../session-ledger/protocol.mjs';
import {createWriteControl} from './write-control.mjs';
import {operatorPath,signOperator,opaque,keyUrl,loadOperatorKeys} from './protocol.mjs';
export async function operatorPostgresProof({root,ca,passwords,config,coordinatorPool,publicKeys,keys,check}){
  let fixture,server,lastReserve;const saved=[],refs=new Map(),source='a'.repeat(40);
  const tlsForTest={cert:ca,key:await readFile(root+'/server.key','utf8')};
  server=await startCoordinator({pool:coordinatorPool,publicKeys},{tlsForTest,closePool:false,operatorEnabled:true});
  const requestForTest=(url,o,cb)=>httpsRequest(url,{...o,hostname:'127.0.0.1',port:server.port,servername:new URL(destination).hostname,ca,headers:{...o.headers,Host:new URL(destination).host}},cb);
  const ledgers=Object.fromEntries(['A','B'].map(p=>[p,createLedgerClient({product:p,privateKey:keys[p].privateKey},{requestForTest})]));
  const controls=Object.fromEntries(['A','B'].map(p=>[p,createWriteControl()]));
  const store=cfg=>{
    const role='cft005_hml_'+cfg.product.toLowerCase();
    class LocalPool extends pg.Pool{constructor(){super({...config,user:role,password:passwords[cfg.product],database:'cft005_hml_db_teste',max:1,application_name:'cft005-operator-'+cfg.product});}}
    return createPostgresStore(cfg,`postgresql://${role}:synthetic-not-used@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste`,{Pool:LocalPool,ledger:ledgers[cfg.product],writeControl:controls[cfg.product]});
  };
  async function login(p,u){const r=await fixture.login(p,u),s=await fixture.request(p,{path:'/session',jar:r.jar});assert.equal(s.status,200);refs.set(p+u,{jar:r.jar,csrf:s.json.csrf});}
  const req=(p,u,path,method='GET',body,extra={})=>{const s=refs.get(p+u);return fixture.request(p,{path,method,jar:s.jar,body:body===undefined?'':JSON.stringify(body),headers:{Origin:fixture.configs[p].origin,'X-CFT005-CSRF':s.csrf,'Content-Type':'application/json',...extra}});};
  const enroll=(p,u)=>req(p,u,'/proof/sessions/enroll','POST');
  const row=async(p,u)=>(await req(p,u,`/api/products/${p}/records/${u}`)).json.record;
  const raw=packet=>fixture.request('B',{path:operatorPath,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)});
  try{
    await check('OP-NATIVE-PUBLIC-KEYS-HTTPS-PIN-OWN-EXISTING-KEY',async()=>{
      const fetchForTest=(url,o)=>new Promise((resolve,reject)=>{
        assert.equal(url,keyUrl);assert.equal(o.redirect,'error');
        const req=httpsRequest(url,{hostname:'127.0.0.1',port:server.port,servername:new URL(destination).hostname,ca,method:'GET',headers:{Host:new URL(destination).host},signal:o.signal},res=>{
          const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:{'Content-Type':res.headers['content-type']}})));res.on('error',reject);
        });req.on('error',reject);req.end();
      });
      const pinned=await loadOperatorKeys(keys.A.privateKey,'A',{fetchForTest});assert.equal(pinned.B.export({format:'der',type:'spki'}).equals(publicKeys.B.export({format:'der',type:'spki'})),true);
    });
    fixture=await protocolFixture({recordStoreForTest:store,sessionLedgerForTest:p=>ledgers[p],controlledSessionsForTest:p=>({privateKey:keys[p].privateKey,publicKeys,sourceCommit:source,writeControl:controls[p]}),
      onProofRequestForTest:(url,o)=>{if(url.endsWith(operatorPath)){const p=JSON.parse(o.body);if(p.envelope.body.action==='reserve')lastReserve=p;}}});
    await check('OP-NATIVE-UNSIGNED-COOKIE-BEARER-PEER-DENIED',async()=>{
      assert.equal((await raw({})).status,401);
      for(const headers of [{Cookie:'synthetic'}, {Authorization:'Bearer synthetic'}])assert.equal((await fixture.request('B',{path:operatorPath,method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'})).status,401);
    });
    await check('OP-NATIVE-ENABLED-UI-COMPILES-WITHOUT-INLINE-SCRIPT',async()=>{
      const page=await fixture.request('A'),script=await fixture.request('A',{path:'/client.js'});
      assert.ok(page.text.includes('Provar revogação concorrente'));assert.equal(page.text.includes('<script>'),false);new vm.Script(script.text);
    });
    for(const p of ['A','B'])for(const u of ['U1','U2'])await check('OP-NATIVE-'+p+'-'+u+'-AUTHENTICATED-ENROLLMENT',async()=>{await login(p,u);assert.equal((await enroll(p,u)).status,200);});
    const baseline={};for(const p of ['A','B'])for(const u of ['U1','U2'])baseline[p+u]=await row(p,u);
    await check('OP-NATIVE-U2-CSRF-BODY-AND-FORGED-MARKER-DENIED',async()=>{
      assert.equal((await req('A','U2','/proof/sessions/race','POST')).status,403);
      assert.equal((await req('A','U1','/proof/sessions/race','POST',undefined,{'X-CFT005-CSRF':'wrong'})).status,403);
      assert.equal((await req('A','U1','/proof/sessions/race','POST',{owner:'U2'})).status,400);
      assert.equal((await req('A','U1','/api/products/A/records/U1','PUT',{value:baseline.AU1.value},{'X-CFT005-Operator':'forged'})).status,401);
      assert.deepEqual(await row('A','U1'),baseline.AU1);
    });
    await check('OP-NATIVE-LOCAL-LOGOUT-PRESERVES-PEER-AND-U2',async()=>{
      const r=await req('A','U1','/proof/sessions/logout','POST');assert.equal(r.status,200);assert.equal(r.json.phase,'fresh_owner_recheck_required');
      assert.ok(Object.values(r.json.checks).every(v=>v===true));assert.equal((await req('A','U1','/session')).status,401);
      assert.equal((await req('B','U1','/session')).status,200);for(const p of ['A','B'])assert.equal((await req(p,'U2','/session')).status,200);
      await login('A','U1');assert.equal((await enroll('A','U1')).status,200);
      const final=await req('A','U1','/proof/sessions/finalize','POST');assert.equal(final.status,200);assert.equal(final.json.phase,'complete');assert.equal(final.json.mode,'fixture');assert.ok(Object.values(final.json.checks).every(v=>v===true));saved.push(final.json);
    });
    await delay(15050);
    for(const p of ['A','B']){
      await check('OP-NATIVE-'+p+'-REAL-HTTP-PUT-BLOCKS-REVOKE-UNTIL-COMMIT',async()=>{
        const r=await req(p,'U1','/proof/sessions/race','POST');assert.equal(r.status,200);assert.equal(r.json.phase,'fresh_owner_recheck_required');
        assert.deepEqual(r.json.trace.events.map(x=>x.event),['write_fence_acquired','write_issued','revoke_requested','revoke_waiting_on_write_lock','no_ack_while_lock_held','write_commit_confirmed','revocation_commit_confirmed','revocation_ack_received']);
        assert.equal(r.json.trace.requirements.samePhysicalConnectionVerified,true);
        for(const k of ['oldBindingDenied','epochAdvancedExactlyOnce','ownWriteCommittedExactlyOnce'])assert.equal(r.json.trace.postconditions[k],true);
        assert.equal(r.json.trace.postconditions.otherRowsPreserved,null);
        for(const q of ['A','B']){assert.equal((await req(q,'U1','/session')).status,401);assert.equal((await req(q,'U2','/session')).status,200);assert.deepEqual(await row(q,'U2'),baseline[q+'U2']);}
        assert.equal((await req(p,'U2',`/api/products/${p}/records/U2`,'PUT',{value:'synthetic-denied'})).status,409);
      });
      if(p==='A')await check('OP-NATIVE-REPLAY-SOURCE-AND-LEASE-SUBSTITUTION-DENIED',async()=>{
        assert.ok(lastReserve.envelope.exp>Math.floor(Date.now()/1000));assert.equal((await raw(lastReserve)).status,401);
        const wrong=structuredClone(lastReserve);wrong.envelope.source='b'.repeat(40);assert.equal((await raw(wrong)).status,401);
        const packet=signOperator({product:'A',source,privateKey:keys.A.privateKey,body:{action:'collect',run:lastReserve.envelope.body.run,lease:opaque()}});assert.equal((await raw(packet)).status,401);
      });
      await check('OP-NATIVE-'+p+'-FRESH-OWNER-RECHECK-REQUIRED-AND-SANITIZED',async()=>{
        for(const q of ['A','B']){await login(q,'U1');assert.equal((await enroll(q,'U1')).status,200);}
        const r=await req(p,'U1','/proof/sessions/finalize','POST');assert.equal(r.status,200);assert.equal(r.json.phase,'complete');assert.equal(r.json.state,'BLOCKED');
        assert.equal(r.json.trace.mode,'fixture');assert.equal(r.json.trace.requirements.separateProfilesVerified,false);
        assert.ok(Object.values(r.json.trace.postconditions).every(v=>v===true||v===200||v===401));
        assert.equal(r.json.trace.events.at(-1).event,'postconditions_checked');
        const text=JSON.stringify(r.json);for(const ref of refs.values()){assert.equal(text.includes(ref.csrf),false);for(const secret of ref.jar.values())assert.equal(text.includes(secret),false);}
        assert.equal(/sessionHash|privateKey|signature|lease|nonce|backend_pid/.test(text),false);saved.push(r.json);
      });
      if(p==='A')await delay(15050);
    }
    await check('OP-NATIVE-BOUNDED-TIMEOUT-ROLLS-BACK-AND-DESTROYS-CLIENT',async()=>{
      const cfg=fixture.configs.A,control=createWriteControl(),pids=[];
      class FaultPool extends pg.Pool{constructor(){super({...config,user:'cft005_hml_a',password:passwords.A,database:'cft005_hml_db_teste',max:1});this.on('connect',c=>pids.push(c.processID));}}
      const faultStore=createPostgresStore(cfg,'postgresql://cft005_hml_a:synthetic-not-used@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste',{Pool:FaultPool,ledger:ledgers.A,writeControl:control});
      const before=await row('A','U1'),epoch=(await ledgers.A.snapshot()).epochs.U1;
      const binding={owner:'U1',epoch,sessionHash:sessionHash('A',refs.get('AU1').jar.get('__Host-cft005-session'))};
      const principal={subject:'auth0|synthetic-u1',label:'U1',ledgerBinding:binding};let release;
      const armed=control.arm(binding,()=>new Promise(resolve=>{release=resolve;}),()=>{throw Error('E_UNEXPECTED_COMMIT');},()=>{});
      try{await faultStore.ready();await assert.rejects(faultStore.write(principal,'U1',before.value,control.claim(armed.marker,principal)));
        assert.deepEqual(await faultStore.read(principal,'U1'),before);assert.ok(pids.length>=2);assert.notEqual(pids[0],pids.at(-1));
      }finally{release?.();armed.cancel();await faultStore.close();}
    });
    await delay(15050);
    await check('OP-NATIVE-ABORT-CLEARS-CONTROLS-WITHOUT-RESETTING-AUTHORITY',async()=>{
      const before=(await ledgers.A.snapshot()).epochs;
      const pending=await req('A','U1','/proof/sessions/logout','POST');assert.equal(pending.status,200);
      await login('A','U1');assert.equal((await enroll('A','U1')).status,200);
      const r=await req('A','U1','/proof/sessions/abort','POST');assert.equal(r.status,200);assert.equal(r.json.state,'BLOCKED');assert.equal(r.json.retrySafe,false);
      assert.deepEqual((await ledgers.A.snapshot()).epochs,before);
      for(const p of ['A','B'])assert.equal((await req(p,'U2','/session')).status,200);
      assert.equal((await fixture.request('A',{path:'/proof/sessions/results'})).json.pending,null);
      assert.equal((await fixture.request('B',{path:'/proof/sessions/results'})).json.pending,null);
    });
    for(const p of ['A','B'])for(const u of ['U1','U2'])await check('OP-NATIVE-'+p+'-'+u+'-FINAL-EXACT-REVISION-ACCOUNTING',async()=>{
      assert.deepEqual(await row(p,u),{...baseline[p+u],revision:baseline[p+u].revision+(u==='U1'?1:0)});
    });
    return {scope:'local-synthetic-only',realOidc:false,realBrowser:false,sharedDatabaseAdminUsedByRuntime:false,receipts:saved,newHostedGatePasses:0,
      limits:['Only local logout and two ordered races implemented in this operator increment.','Separate browser profiles are not inferred by the server.','H16/H17/H19/H24 require their remaining hosted operations; operator replay test is not ledger revocation replay homologation.']};
  }finally{lastReserve=undefined;refs.clear();if(fixture)await fixture.close();if(server)await server.close();}
}

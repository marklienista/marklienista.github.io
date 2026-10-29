// Native loopback PostgreSQL fixture only. No hosted endpoint, real identity or secret output.
import pg from 'pg';
import assert from 'node:assert/strict';
import {createPostgresStore} from '../record-store.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
export async function auditPostgresProof({config,passwords,online,admin,cmd,issue,sessions,check,lockObserved}){
  const stores={},sql=[],reports=[];let hold,fault,calls=0;
  const proxy={authorize:async input=>{calls++;if(fault==='second-phase-offline'&&calls===2)throw Error('E_LOCAL_OFFLINE');return online.authorize(input);}};
  const principal=(p,u)=>({subject:'synthetic-'+u,label:u,ledgerBinding:sessions.get(p+u)});
  const snapshot=async()=>(await admin.query("SELECT record_id,value,revision FROM cft005_hml_a.records UNION ALL SELECT record_id,value,revision FROM cft005_hml_b.records ORDER BY record_id")).rows;
  const baseline=await snapshot();
  const renew=async epoch=>{for(const p of ['A','B'])await issue(p,'U2',epoch);};
  try{
    for(const p of ['A','B']){
      const role='cft005_hml_'+p.toLowerCase();
      class LocalPool extends pg.Pool{
        constructor(){super({...config,user:role,password:passwords[p],database:'cft005_hml_db_teste',max:1,application_name:'cft005-local-audit-'+p});
          this.on('connect',c=>{const query=c.query.bind(c);c.query=(...args)=>{
            const text=String(args[0]),tag=/CFT005_AUDIT:([A-Z_]+)/.exec(text)?.[1];sql.push({product:p,tag});
            const result=query(...args);
            if(!hold||hold.product!==p||tag!==hold.tag)return result;
            const paused=hold;hold=undefined;
            return result.then(async r=>{paused.pid=c.processID;paused.entered.resolve();await paused.release.promise;return r;});
          };});
        }
      }
      stores[p]=createPostgresStore({product:p,subjects:{'synthetic-U1':'U1','synthetic-U2':'U2'}},`postgresql://${role}:local-unused-placeholder@dpg-dbh8tghsrm7s73f4tc9g-a/cft005_hml_db_teste`,{Pool:LocalPool,ledger:proxy});
      await stores[p].ready();
      for(const u of ['U1','U2'])await check('AUDIT-'+p+'-'+u+'-RLS-ROLLBACK-CLEANUP-AND-REUSE',async()=>{
        const checks=await stores[p].audit(principal(p,u));
        const required=Object.entries(checks).filter(([id])=>!['previousVerifiedOwnerDifferent','sameConnectionAsPreviousAudit'].includes(id));
        if(required.length<41||!required.every(([,value])=>value===true))throw Object.assign(Error('E_AUDIT_CHECKS'),{auditChecks:checks});
        assert.equal(checks.previousVerifiedOwnerDifferent,u==='U2');assert.equal(checks.sameConnectionAsPreviousAudit,u==='U2');
        reports.push({product:p,user:u,checks});assert.deepEqual(await snapshot(),baseline);
      });
    }
    for(const p of ['A','B'])for(const phase of ['probe','verify'])await check('AUDIT-'+p+'-'+phase.toUpperCase()+'-FENCE-ORDERS-REAL-REVOCATION',async()=>{
      const paused={product:p,tag:phase==='probe'?'FINAL_ROW':'ROW_AFTER_ROLLBACK',entered:deferred(),release:deferred()};hold=paused;
      const start=sql.length;let done=false,ack=false;
      const result=stores[p].audit(principal(p,'U2')).then(value=>{done=true;return {ok:true,value};},error=>({ok:false,error}));
      await Promise.race([paused.entered.promise,result.then(()=>{throw Error('E_AUDIT_NOT_PAUSED');})]);
      const revocation=cmd(p,'revoke',sessions.get(p+'U2')).then(r=>{ack=true;return r;});
      try{await lockObserved(paused.pid);assert.equal(ack,false);assert.equal(done,false);}finally{paused.release.resolve();}
      const observed=await result,revoked=await revocation;
      if(phase==='probe'){
        assert.equal(observed.ok,false);assert.equal(observed.error.message,'E_LEDGER_DENIED');
        assert.equal(sql.slice(start).some(x=>x.tag==='ROW_AFTER_ROLLBACK'),false);
      }else{assert.equal(observed.ok,true);assert.equal(observed.value.ledgerGuardedVerificationCommit,true);}
      await renew(revoked.epoch);assert.deepEqual(await snapshot(),baseline);
    });
    await check('AUDIT-SECOND-PHASE-ONLINE-OUTAGE-NEVER-RETURNS-PASS',async()=>{
      fault='second-phase-offline';calls=0;const start=sql.length;
      try{await assert.rejects(stores.A.audit(principal('A','U2')),{message:'E_LEDGER_UNAVAILABLE'});}finally{fault=undefined;}
      assert.equal(calls,2);assert.equal(sql.slice(start).some(x=>x.tag==='ROW_AFTER_ROLLBACK'),false);
      assert.deepEqual(await snapshot(),baseline);
    });
    await check('AUDIT-FORGED-PRINCIPAL-AND-BINDING-DENIED-BEFORE-PROBES',async()=>{
      const start=sql.length;
      await assert.rejects(stores.A.audit({...principal('A','U1'),label:'U2'}));
      await assert.rejects(stores.A.audit({...principal('A','U2'),ledgerBinding:sessions.get('AU1')}));
      assert.equal(sql.length,start);
    });
    await check('AUDIT-RECOVERY-AFTER-DENIALS-PRESERVES-ALL-FOUR-ROWS',async()=>{
      for(const p of ['A','B'])assert.equal((await stores[p].audit(principal(p,'U2'))).ledgerFreshAuthorizationEachPhase,true);
      assert.deepEqual(await snapshot(),baseline);
    });
    return {schema:'CFT005-NATIVE-GUARDED-AUDIT-1',contexts:reports,allFourRowsUnchanged:true,realOidc:false,hostedEvidence:false};
  }finally{hold?.release.resolve();for(const store of Object.values(stores))await store.close();}
}

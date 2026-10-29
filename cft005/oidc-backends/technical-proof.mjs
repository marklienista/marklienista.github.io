import {PROOF_ORIGINS} from './config.mjs';

const DB_CHECKS=Object.freeze(['initialContextEmpty','exactRuntimeRole','restrictedRole','forcedRls','noCustomTriggers','tls','withCheckColumnsWritable',
  'identityConstraint','productConstraint','ownerDomainConstraint','idPrimaryKey','exactOwnRow','noExtraVisibleRows','noExtraRowsProvenForContext',
  'otherReadFiltered','ownUpdateReached','otherUpdateFiltered','withCheckOwnerDenied','withCheckProductDenied',
  'otherSchemaDenied','otherRoleDenied','ownerRoleDenied','bypassDenied','noViewsOrForeignTables','noSecurityDefiner',
  'noPublicFunctionExecute','publicCreateDenied','peerSchemaUsageDenied','ownRowPreservedInsideTransaction',
  'noPublicRelations','fixedPrivateTables','ownerDefaultExecuteRevoked','noPublications',
  'afterRollbackContextEmpty','sameConnectionThroughRollback','ownRowPreservedAfterRollback','afterCommitContextEmpty','sameConnectionThroughCommit']);

// Session and token stay server-side, with fixed destinations and no caller-selected SQL.
export async function runTechnicalProof({cfg,principal,session,sid,store,proofFetch}){
  const receipt={version:store.ledgerRequired?3:2,startedAt:new Date().toISOString(),product:cfg.product,user:session.label,storage:store.kind,cases:[]};
  const observe=(id,expected,actual)=>receipt.cases.push({id,expected,actual,result:expected===actual?'PASS':'FAIL'});
  try{
    if(store.kind!=='postgres'||typeof store.audit!=='function')throw Error('E_AUDIT_NOT_AVAILABLE');
    const db=await store.audit(principal);
    const required=store.ledgerRequired?[...DB_CHECKS,'ledgerGuardedProbeRollback','ledgerGuardedVerificationCommit','ledgerFreshAuthorizationEachPhase']:DB_CHECKS;
    for(const id of required){
      if(typeof db[id]!=='boolean'){receipt.cases.push({id:'DB-'+id,result:'BLOCKED'});continue;}
      observe('DB-'+id,true,db[id]);
    }
    receipt.connectionReuse={previousVerifiedOwnerDifferent:db.previousVerifiedOwnerDifferent===true,samePhysicalConnection:db.sameConnectionAsPreviousAudit===true};
    const own=PROOF_ORIGINS[cfg.product],other=cfg.product==='A'?'B':'A';
    const headers={Cookie:'__Host-cft005-session='+sid,'X-CFT005-CSRF':session.csrf};
    const request=async(path,extra={},method='GET')=>{
      const r=await proofFetch(own+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{...headers,...extra},...(method==='POST'?{body:'{}'}:{})});
      const body=await r.json();return{status:r.status,error:body.error,ownId:body.record?.id};
    };
    const positive=await request(`/api/products/${cfg.product}/records/${session.label}`);
    observe('OWN-READ-WITHOUT-ORIGIN',true,positive.status===200&&positive.ownId===`HML-${cfg.product}-${session.label}`);
    if(positive.status!==200)throw Error('E_POSITIVE_BASELINE');
    for(const [id,extra]of [['ABSENT-ORIGIN',{}],['FORGED-ORIGIN',{Origin:PROOF_ORIGINS[other]}]]){
      const r=await request(`/api/products/${other}/records/${session.label}`,extra);
      observe('PRODUCT-'+id,true,r.status===403&&r.error==='product_forbidden');
    }
    // Real Auth0 token is used only inside the server and never included in evidence.
    const bearer=await request(`/api/products/${cfg.product}/records/${session.label}`,{Authorization:'Bearer '+session.token});
    observe('BROWSER-REAL-BEARER-DENIED',true,bearer.status===401&&bearer.error==='browser_bearer_forbidden');
    receipt.sharedSupabaseJwtRealTest=false; // No token taken from shared/published applications.
    for(const [id,path]of [['LEGACY-REST','/rest/v1/records'],['GRAPHQL','/graphql/v1'],['RPC','/rpc/cft005_audit'],['STORAGE','/storage/v1/object'],['REALTIME','/realtime/v1']]){
      const r=await request(path);observe('DISABLED-'+id,true,r.status===404&&r.error==='not_found');
    }
    for(const [id,path]of [['GRAPHQL-POST','/graphql/v1'],['RPC-POST','/rest/v1/rpc/cft005_audit']]){
      const r=await request(path,{Origin:cfg.origin,'Content-Type':'application/json'},'POST');
      observe('DISABLED-'+id,true,r.status===404&&r.error==='not_found');
    }
  }catch{receipt.cases.push({id:'TECHNICAL-PATH-NOT-COMPLETED',result:'BLOCKED'});}
  receipt.finishedAt=new Date().toISOString();
  receipt.result=receipt.cases.some(c=>c.result==='FAIL')?'FAIL':receipt.cases.some(c=>c.result==='BLOCKED')?'BLOCKED':'PASS';
  receipt.limit='Synthetic technical checks only; no genuine Supabase JWT or durable-session/production homologation claim';
  return receipt;
}

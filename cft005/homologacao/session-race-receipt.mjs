// Offline review of sanitized observations. No environment, network or credential access.
// Input is an executor observation, not cryptographic attestation of hosted execution.
export const raceSchema='CFT005-HML-SESSION-RACE-1';
export const raceEvents=Object.freeze([
  'write_fence_acquired','write_issued','revoke_requested','revoke_waiting_on_write_lock',
  'no_ack_while_lock_held','write_commit_confirmed','revocation_commit_confirmed',
  'revocation_ack_received','postconditions_checked'
]);
export const raceRequirements=Object.freeze([
  'fourOwnerBaselinesVerified','separateProfilesVerified','bindingsVerified',
  'samePhysicalConnectionVerified','writeUsesNormalDataFence'
]);
export const raceExpected=Object.freeze({oldSessionAStatus:401,oldSessionBStatus:401,
  u2AStatus:200,u2BStatus:200,oldBindingDenied:true,epochAdvancedExactlyOnce:true,
  ownWriteCommittedExactlyOnce:true,otherRowsPreserved:true});
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const invalid=()=>{throw new Error('E_INVALID_SANITIZED_RACE_RECEIPT');};

export function blankRaceReceipt(product,sourceCommit){
  const receipt={schema:raceSchema,runId:'HML-SESSION-RACE-PREP-'+product,mode:'fixture',scope:'synthetic-only',
    sourceCommit,product,requirements:Object.fromEntries(raceRequirements.map(k=>[k,false])),
    events:[],postconditions:Object.fromEntries(Object.keys(raceExpected).map(k=>[k,null]))};
  reviewRaceReceipt(receipt);return receipt;
}

export function reviewRaceReceipt(r){
  if(!exact(r,['schema','runId','mode','scope','sourceCommit','product','requirements','events','postconditions'])||
    r.schema!==raceSchema||!/^HML-[A-Z0-9-]{4,64}$/.test(r.runId)||!['real','fixture'].includes(r.mode)||
    r.scope!=='synthetic-only'||!/^[a-f0-9]{40}$/.test(r.sourceCommit)||!['A','B'].includes(r.product)||
    !exact(r.requirements,raceRequirements)||raceRequirements.some(k=>typeof r.requirements[k]!=='boolean')||
    !exact(r.postconditions,Object.keys(raceExpected))||!Array.isArray(r.events)||r.events.length>raceEvents.length)invalid();
  const seen=new Set();
  for(let i=0;i<r.events.length;i++){
    const e=r.events[i];
    if(!exact(e,['seq','event'])||e.seq!==i+1||!raceEvents.includes(e.event)||seen.has(e.event))invalid();
    seen.add(e.event);
  }
  for(const [key,expected]of Object.entries(raceExpected)){
    const v=r.postconditions[key];
    if(v!==null&&(typeof v!==typeof expected||typeof v==='number'&&(!Number.isInteger(v)||v<100||v>599)))invalid();
  }
  const order=r.events.map(e=>raceEvents.indexOf(e.event));
  const violated=order.some((v,i)=>i>0&&v<=order[i-1]);
  const mismatch=Object.entries(raceExpected).some(([key,expected])=>r.postconditions[key]!==null&&r.postconditions[key]!==expected);
  const complete=raceEvents.every(e=>seen.has(e))&&Object.values(r.postconditions).every(v=>v!==null);
  let state='BLOCKED',reason='NOT_EXECUTED';
  if(r.mode!=='real')reason='FIXTURE_ONLY';
  else if(raceRequirements.some(k=>!r.requirements[k]))reason='EVIDENCE_PATH_NOT_VERIFIED';
  else if(violated||mismatch){state='FAIL';reason=violated?'OBSERVED_ORDER_VIOLATION':'OBSERVED_POSTCONDITION_MISMATCH';}
  else if(complete){state='PASS';reason='OBSERVED_RACE_CRITERIA_MET';}
  else if(r.events.length)reason='INCOMPLETE_OBSERVATION';
  return {schema:raceSchema,runId:r.runId,sourceCommit:r.sourceCommit,product:r.product,state,reason,
    observedOrder:violated?'VIOLATED':raceEvents.every(e=>seen.has(e))?'VALID':'INCOMPLETE',
    publishedHomologation:'NOT_GRANTED',
    limit:'Sanitized executor observations only. One product race is not H15/H24 completion; no independent attestation.'};
}

export function reviewBothRaceReceipts(receipts){
  if(!Array.isArray(receipts)||receipts.length!==2)invalid();
  const rows=receipts.map(reviewRaceReceipt);
  if(new Set(rows.map(r=>r.product)).size!==2||new Set(rows.map(r=>r.sourceCommit)).size!==1||
    new Set(rows.map(r=>r.runId)).size!==2)invalid();
  const state=rows.some(r=>r.state==='FAIL')?'FAIL':rows.every(r=>r.state==='PASS')?'PASS':'BLOCKED';
  return {schema:raceSchema,state,products:rows,
    gatePromotion:'NONE',publishedHomologation:'NOT_GRANTED',
    limit:'Two ordered races are only part of H15/H24. H14, replay, outage, old-credential and restart criteria remain separate.'};
}

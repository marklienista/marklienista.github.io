import {cases,contractVersion,prerequisites} from './plan.mjs';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const bad=()=>{throw new Error('E_INVALID_SANITIZED_RECEIPT');};

// A receipt is an executor's sanitized observation, not a cryptographic attestation.
// This evaluator never calls a service or opens a credential, profile or database.
export function evaluate(receipt){
  if(!exact(receipt,['contractVersion','runId','mode','scope','safeguards','prerequisites','observations'])||
    receipt.contractVersion!==contractVersion||!/^HML-[A-Z0-9-]{4,64}$/.test(receipt.runId)||
    !['real','fixture'].includes(receipt.mode)||receipt.scope!=='synthetic-only')bad();
  const guardKeys=['publishedAppsUnchanged','apertaquemUnchanged','realDataUntouched','globalTtlUnchanged'];
  if(!exact(receipt.safeguards,guardKeys)||guardKeys.some(k=>typeof receipt.safeguards[k]!=='boolean')||
    !exact(receipt.prerequisites,prerequisites)||prerequisites.some(k=>typeof receipt.prerequisites[k]!=='boolean')||!Array.isArray(receipt.observations))bad();
  const byId=new Map();
  for(const o of receipt.observations){
    const spec=cases.find(c=>c.id===o?.id);
    if(!spec||byId.has(o.id)||!exact(o,['id','at','source','checks'])||o.source!==spec.source||
      typeof o.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o.at)||!Number.isFinite(Date.parse(o.at))||
      !exact(o.checks,Object.keys(spec.expect)))bad();
    for(const [key,value]of Object.entries(o.checks)){
      if(typeof value!==typeof spec.expect[key]||typeof value==='number'&&(!Number.isInteger(value)||value<0||value>10000))bad();
    }
    byId.set(o.id,o);
  }
  const rows=[];
  const safeguardsOk=guardKeys.every(k=>receipt.safeguards[k]);
  for(const spec of cases){
    const o=byId.get(spec.id);
    let state='BLOCKED',reason='NOT_EXECUTED';
    if(!safeguardsOk){state='FAIL';reason='SCOPE_VIOLATION';}
    else if(receipt.mode!=='real')reason='FIXTURE_ONLY';
    else if(spec.prerequisites.some(k=>!receipt.prerequisites[k]))reason='PREREQUISITE_MISSING';
    else if(spec.baseline.some(id=>rows.find(r=>r.id===id)?.state!=='PASS'))reason='POSITIVE_BASELINE_MISSING';
    else if(o&&spec.evidenceChecks.some(k=>o.checks[k]!==true))reason='EVIDENCE_PATH_NOT_REACHED';
    else if(o){
      const mismatch=Object.keys(spec.expect).some(k=>o.checks[k]!==spec.expect[k]);
      state=mismatch?'FAIL':'PASS';reason=mismatch?'OBSERVED_MISMATCH':'CRITERIA_MET';
    }
    rows.push({id:spec.id,gate:spec.gate,state,reason});
  }
  const counts=Object.fromEntries(['PASS','FAIL','BLOCKED'].map(s=>[s,rows.filter(r=>r.state===s).length]));
  return {contractVersion,runId:receipt.runId,scope:receipt.scope,state:counts.FAIL?'FAIL':counts.BLOCKED?'BLOCKED':'PASS',counts,cases:rows,
    publishedHomologation:'NOT_GRANTED',limit:'Executor observations only; no independent attestation or promotion of S01-S14'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)bad();
    const bytes=await readFile(process.argv[2]);if(bytes.length>131072)bad();
    const report=evaluate(JSON.parse(bytes.toString('utf8')));
    console.log(JSON.stringify(report,null,2));process.exitCode=report.state==='PASS'?0:report.state==='FAIL'?1:2;
  }catch{console.error('E_INVALID_SANITIZED_RECEIPT');process.exitCode=1;}
}

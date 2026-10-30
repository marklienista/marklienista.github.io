import {PROOF_ORIGINS} from '../config.mjs';
import {blankRaceReceipt,reviewRaceReceipt} from '../../homologacao/session-race-receipt.mjs';
import {opaque,exact,failure,signOperator,verifyOperator,operatorPath,boundedJson,validateOperatorKeys} from './protocol.mjs';

// Session references, row snapshots, signatures and leases never leave this closure
// except authenticated fixed-destination service envelopes. Browser output is explicit.
export function createSessionOperator({cfg,ledger,privateKey,publicKeys,sourceCommit,writeControl,proofFetch,mode}){
  if(!ledger||!writeControl||!['real','fixture'].includes(mode)||!/^[a-f0-9]{40}$/.test(sourceCommit))throw failure();
  validateOperatorKeys(privateKey,cfg.product,publicKeys);
  const peer=cfg.product==='A'?'B':'A',enrolled=new Map(),nonces=new Map(),receipts=[];
  let active,lastStart=0;
  const now=()=>Date.now();
  const event=(s,name)=>s.trace?.events.push({seq:s.trace.events.length+1,event:name});
  const validRef=r=>r&&r.session.exp>Math.floor(now()/1000)&&now()-r.enrolledAt<300000;
  const clean=()=>{if(active&&active.until<=now()){if(active.local){receipts.push({...summary(active),state:'BLOCKED',phase:'expired_recheck_required'});if(receipts.length>8)receipts.shift();}active=undefined;writeControl.cancel();}for(const [n,t]of nonces)if(t<=now())nonces.delete(n);};
  async function own(ref,path,method='GET',body,marker){
    if(!validRef(ref))throw failure();
    const headers={Cookie:'__Host-cft005-session='+ref.sid,'X-CFT005-CSRF':ref.session.csrf,Origin:cfg.origin,'Content-Type':'application/json',...(marker?{'X-CFT005-Operator':marker}:{})};
    const r=await proofFetch(PROOF_ORIGINS[cfg.product]+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(8000),...(body===undefined?{}:{body:JSON.stringify(body)})});
    const j=await boundedJson(r);return {status:r.status,json:j};
  }
  async function row(ref){
    const u=ref.session.label,r=await own(ref,`/api/products/${cfg.product}/records/${u}`),v=r.json?.record;
    if(r.status!==200||!exact(v,['id','value','revision'])||v.id!==`HML-${cfg.product}-${u}`||typeof v.value!=='string'||v.value.length>128||!Number.isSafeInteger(v.revision))throw failure();
    return {...v};
  }
  const same=(a,b,delta=0)=>a?.id===b?.id&&a?.value===b?.value&&a?.revision===b?.revision+delta;
  async function capture(){
    const refs=Object.fromEntries(enrolled);if(!validRef(refs.U1)||!validRef(refs.U2)||refs.U1.principal.subject===refs.U2.principal.subject)throw failure();
    const baseline={U1:await row(refs.U1),U2:await row(refs.U2)},epochs=(await ledger.snapshot()).epochs;
    return {refs,baseline,epochs};
  }
  async function callPeer(body){
    const packet=signOperator({product:cfg.product,source:sourceCommit,privateKey,body});
    const r=await proofFetch(PROOF_ORIGINS[peer]+operatorPath,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)});
    const j=await boundedJson(r);
    if(r.status!==200||!exact(j,['version','issuer','requestNonce','result'])||j.version!==1||j.issuer!==peer||j.requestNonce!==packet.envelope.nonce||!j.result)throw failure();
    const x=j.result;
    if(body.action==='reserve'&&(!exact(x,['lease','ready'])||x.ready!==true||!/^[a-f0-9]{64}$/.test(x.lease)))throw failure();
    if(body.action==='revoke'&&(!exact(x,['revocationCommitted'])||x.revocationCommitted!==true))throw failure();
    if(body.action==='collect'&&(!exact(x,['oldU1','u2','u2Preserved','bindingDenied','epochOnce'])||
      !['oldU1','u2'].every(k=>Number.isInteger(x[k])&&x[k]>=100&&x[k]<=599)||!['u2Preserved','bindingDenied','epochOnce'].every(k=>typeof x[k]==='boolean')))throw failure();
    if(body.action==='finalize'&&(!exact(x,['rowsPreserved'])||typeof x.rowsPreserved!=='boolean'))throw failure();
    if(body.action==='release'&&(!exact(x,['released'])||x.released!==true))throw failure();
    return j.result;
  }
  async function collect(s){
    const oldU1=(await own(s.refs.U1,'/session')).status,u2=(await own(s.refs.U2,'/session')).status;
    const u2Preserved=same(await row(s.refs.U2),s.baseline.U2),epochs=(await ledger.snapshot()).epochs;
    let bindingDenied=false;try{await ledger.authorize({product:cfg.product,...s.refs.U1.session.binding});}catch(e){if(e?.ledgerDenied)bindingDenied=true;else throw failure();}
    return {oldU1,u2,u2Preserved,bindingDenied,epochOnce:epochs.U1===s.epochs.U1+(s.kind==='race'?1:0)&&epochs.U2===s.epochs.U2};
  }
  async function recheck(s,delta){
    const u1=enrolled.get('U1'),u2=enrolled.get('U2');
    if(!validRef(u1)||!validRef(u2)||s.kind==='race'&&u1.sid===s.refs.U1.sid)throw failure();
    return same(await row(u1),s.baseline.U1,delta)&&same(await row(u2),s.baseline.U2);
  }
  function summary(s){
    if(s.kind==='race')return {version:1,kind:s.kind,product:cfg.product,state:s.complete?reviewRaceReceipt(s.trace).state:'BLOCKED',
      phase:s.complete?'complete':s.failed?'interrupted_recheck_required':'fresh_owner_recheck_required',trace:s.trace,
      limit:'Synthetic session proof only; fixture is not hosted evidence. Other gates remain separate.'};
    return {version:1,kind:'logout',mode,product:cfg.product,state:!s.complete||mode!=='real'?'BLOCKED':Object.values(s.checks).every(v=>v===true)?'PASS':'FAIL',
      phase:s.complete?'complete':'fresh_owner_recheck_required',checks:s.checks??{},limit:'Local product logout only; no Auth0/Google central logout.'};
  }
  async function finish(s){
    const ownPreserved=await recheck(s,s.kind==='race'?1:0);
    const other=await callPeer({action:'finalize',run:s.id,lease:s.peerLease});
    if(!exact(other,['rowsPreserved'])||typeof other.rowsPreserved!=='boolean')throw failure();
    const all=ownPreserved&&other.rowsPreserved;
    if(s.kind==='race'){
      s.trace.postconditions.otherRowsPreserved=all;
      event(s,'postconditions_checked');
    }else s.checks.rowsPreserved=all;
    s.complete=true;const result=summary(s);receipts.push(result);if(receipts.length>8)receipts.shift();
    try{await callPeer({action:'release',run:s.id,lease:s.peerLease});}finally{active=undefined;writeControl.cancel();}
    return result;
  }
  return Object.freeze({
    results(){clean();return {version:1,product:cfg.product,enrolled:{U1:validRef(enrolled.get('U1'))===true,U2:validRef(enrolled.get('U2'))===true},receipts:[...receipts],pending:active?.local?summary(active):null};},
    busy(){clean();return Boolean(active);},
    enroll({sid,session,principal}){
      clean();if(!['U1','U2'].includes(session.label)||principal.label!==session.label||!session.binding||active&&active.phase==='running')throw failure();
      enrolled.set(session.label,{sid,session,principal,enrolledAt:now()});return {prepared:true,product:cfg.product,user:session.label};
    },
    claimWrite(marker,principal){clean();return writeControl.claim(marker,principal);},
    allowWrite(permit){clean();return !active||Boolean(permit);},
    allowRevoke(marker,principal){
      clean();
      if(!active)return !marker;
      if(active.local||active.revokeClaimed||marker!==active.revokeMarker||principal.ledgerBinding?.sessionHash!==active.refs.U1.session.binding.sessionHash)return false;
      active.revokeClaimed=true;return true;
    },
    async peer(packet){
      clean();const e=verifyOperator(packet,{product:cfg.product,source:sourceCommit,publicKeys});
      if(nonces.has(e.nonce)||nonces.size>=256)throw failure();nonces.set(e.nonce,e.exp*1000);
      const b=e.body;let result;
      if(b.action==='reserve'){
        if(active||now()-lastStart<15000)throw failure();
        const s={id:b.run,lease:opaque(),issuer:e.issuer,kind:b.kind,local:false,phase:'running',until:now()+300000};
        active=s;lastStart=now();try{Object.assign(s,await capture());s.phase='reserved';result={lease:s.lease,ready:true};}catch(error){active=undefined;throw failure();}
      }else{
        const s=active;if(!s||s.local||s.id!==b.run||s.lease!==b.lease||s.issuer!==e.issuer||s.phase==='running')throw failure();
        if(b.action==='revoke'){
          if(s.kind!=='race'||s.phase!=='reserved')throw failure();s.phase='revoking';s.revokeMarker=opaque();
          try{const r=await own(s.refs.U1,'/sessions/revoke','POST',undefined,s.revokeMarker);
            if(r.status!==200||r.json.revoked!==true||r.json.durable!==true)throw failure();result={revocationCommitted:true};
          }finally{s.revokeMarker=undefined;s.phase='waiting';}
        }else if(b.action==='collect'){result=await collect(s);s.phase='waiting';}
        else if(b.action==='finalize'){result={rowsPreserved:await recheck(s,0)};}
        else if(b.action==='release'){active=undefined;result={released:true};}
      }
      return {version:1,issuer:cfg.product,requestNonce:e.nonce,result};
    },
    async run(kind,caller){
      clean();if(!['logout','race'].includes(kind)||active||now()-lastStart<15000||caller.session.label!=='U1'||enrolled.get('U1')?.sid!==caller.sid)throw failure();
      const s={id:opaque(),local:true,kind,phase:'running',until:now()+300000};active=s;lastStart=now();
      try{
        Object.assign(s,await capture());
        const reserved=await callPeer({action:'reserve',kind,run:s.id});
        if(!exact(reserved,['lease','ready'])||reserved.ready!==true||!/^[a-f0-9]{64}$/.test(reserved.lease))throw failure();s.peerLease=reserved.lease;
        if(kind==='logout'){
          const out=await own(s.refs.U1,'/logout','POST');const a=await collect(s),b=await callPeer({action:'collect',run:s.id,lease:s.peerLease});
          s.checks={localLogoutDurable:out.status===200&&out.json.durableLocalLogout===true,ownOldSession401:a.oldU1===401,peerSession200:b.oldU1===200,
            u2Sessions200:a.u2===200&&b.u2===200,u2RowsPreserved:a.u2Preserved&&b.u2Preserved,noCentralLogoutClaim:true};
        }else{
          s.trace=blankRaceReceipt(cfg.product,sourceCommit);s.trace.mode=mode;s.trace.runId='HML-SESSION-RACE-'+cfg.product+'-'+Date.now();
          // Profiles are independently confirmed by the human executor; the server
          // cannot infer browser profile separation from four cookies.
          Object.assign(s.trace.requirements,{fourOwnerBaselinesVerified:true,bindingsVerified:true,writeUsesNormalDataFence:true});
          let revoke;
          const armed=writeControl.arm(s.refs.U1.session.binding,()=>{
            event(s,'write_fence_acquired');event(s,'write_issued');event(s,'revoke_requested');
            revoke=callPeer({action:'revoke',run:s.id,lease:s.peerLease}).then(r=>{
              if(!exact(r,['revocationCommitted'])||r.revocationCommitted!==true)throw failure();
              event(s,'revocation_commit_confirmed');event(s,'revocation_ack_received');return r;
            });revoke.catch(()=>{});return revoke;
          },()=>event(s,'write_commit_confirmed'),()=>{
            if(s.trace.events.some(e=>e.event==='revocation_ack_received'))throw failure();
            event(s,'revoke_waiting_on_write_lock');event(s,'no_ack_while_lock_held');s.trace.requirements.samePhysicalConnectionVerified=true;
          });
          try{const r=await own(s.refs.U1,`/api/products/${cfg.product}/records/U1`,'PUT',{value:s.baseline.U1.value},armed.marker);
            s.trace.postconditions.ownWriteCommittedExactlyOnce=r.status===200&&same(r.json.record,s.baseline.U1,1);
            if(!revoke)throw failure();await revoke;
          }finally{armed.cancel();}
          const a=await collect(s),b=await callPeer({action:'collect',run:s.id,lease:s.peerLease});
          Object.assign(s.trace.postconditions,{oldSessionAStatus:cfg.product==='A'?a.oldU1:b.oldU1,oldSessionBStatus:cfg.product==='B'?a.oldU1:b.oldU1,
            u2AStatus:cfg.product==='A'?a.u2:b.u2,u2BStatus:cfg.product==='B'?a.u2:b.u2,oldBindingDenied:a.bindingDenied&&b.bindingDenied,epochAdvancedExactlyOnce:a.epochOnce&&b.epochOnce});
        }
        s.phase='waiting';return summary(s);
      }catch{
        s.failed=true;s.phase='waiting';writeControl.cancel();
        if(!s.peerLease){active=undefined;throw failure();}
        return summary(s);
      }
    },
    async finalize(caller){clean();const s=active;if(!s?.local||s.phase!=='waiting'||caller.session.label!=='U1'||enrolled.get('U1')?.sid!==caller.sid)throw failure();return finish(s);},
    async abort(caller){
      clean();const s=active;if(!s?.local||s.phase!=='waiting'||caller.session.label!=='U1'||enrolled.get('U1')?.sid!==caller.sid)throw failure();
      const result={...summary(s),state:'BLOCKED',phase:'aborted_recheck_required',retrySafe:false};
      try{await callPeer({action:'release',run:s.id,lease:s.peerLease});}finally{receipts.push(result);if(receipts.length>8)receipts.shift();active=undefined;writeControl.cancel();}
      return result;
    },
    close(){active=undefined;enrolled.clear();nonces.clear();writeControl.cancel();}
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {blankRaceReceipt,reviewRaceReceipt,reviewBothRaceReceipts,raceEvents,raceRequirements,raceExpected} from './session-race-receipt.mjs';
const sha='a00203719ee2e8035c87bc75fc0d65c309e2a4f9';
// All inputs in this suite are fabricated locally, including those exercising mode=real validation.
const complete=(product='A')=>({...blankRaceReceipt(product,sha),mode:'real',
  requirements:Object.fromEntries(raceRequirements.map(k=>[k,true])),
  events:raceEvents.map((event,i)=>({seq:i+1,event})),postconditions:{...raceExpected}});
const omit=(r,event)=>{r.events=r.events.filter(e=>e.event!==event).map((e,i)=>({...e,seq:i+1}));return r;};
test('empty preparation never approves either race or any gate',()=>{
  const result=reviewBothRaceReceipts(['A','B'].map(p=>blankRaceReceipt(p,sha)));
  assert.equal(result.state,'BLOCKED');assert.equal(result.gatePromotion,'NONE');
});
test('fixture complete sequence remains blocked',()=>{const r=complete();r.mode='fixture';assert.equal(reviewRaceReceipt(r).reason,'FIXTURE_ONLY');});
test('valid sequence matches only its race criteria, not production or full session gates',()=>{
  const r=reviewBothRaceReceipts([complete('A'),complete('B')]);
  assert.equal(r.state,'PASS');assert.equal(r.gatePromotion,'NONE');assert.equal(r.publishedHomologation,'NOT_GRANTED');
});
test('one product cannot stand in for both directions',()=>assert.throws(()=>reviewBothRaceReceipts([complete()]),/E_INVALID_SANITIZED_RACE_RECEIPT/));
test('ack before write commit fails even when later observations are absent',()=>{
  const r=complete(),i=r.events.findIndex(e=>e.event==='write_commit_confirmed');
  r.events=[...r.events.slice(0,i),{event:'revocation_ack_received'},{event:'write_commit_confirmed'}].map((e,j)=>({...e,seq:j+1}));
  assert.equal(reviewRaceReceipt(r).reason,'OBSERVED_ORDER_VIOLATION');
});
test('revocation commit before write commit fails',()=>{
  const r=complete();[r.events[5].event,r.events[6].event]=[r.events[6].event,r.events[5].event];
  assert.equal(reviewRaceReceipt(r).state,'FAIL');
});
test('elapsed wait without positive database blocking evidence stays blocked',()=>assert.equal(reviewRaceReceipt(omit(complete(),'revoke_waiting_on_write_lock')).state,'BLOCKED'));
test('missing commit cannot be inferred from an HTTP ack',()=>assert.equal(reviewRaceReceipt(omit(complete(),'revocation_commit_confirmed')).state,'BLOCKED'));
test('missing final owner recheck is blocked',()=>{const r=complete();r.postconditions.otherRowsPreserved=null;assert.equal(reviewRaceReceipt(r).state,'BLOCKED');});
for(const [label,key,value]of [['U2 invalidated','u2BStatus',401],['old cookie accepted','oldSessionAStatus',200],['changed other owner','otherRowsPreserved',false],['epoch reused','oldBindingDenied',false],['write repeated','ownWriteCommittedExactlyOnce',false]]){
  test(label+' fails when observation path is verified',()=>{const r=complete();r.postconditions[key]=value;assert.equal(reviewRaceReceipt(r).state,'FAIL');});
}
test('pool queue alone without verified normal fence does not approve a race',()=>{const r=complete();r.requirements.writeUsesNormalDataFence=false;assert.equal(reviewRaceReceipt(r).reason,'EVIDENCE_PATH_NOT_VERIFIED');});
test('different pooled connections do not approve observed lock ownership',()=>{const r=complete();r.requirements.samePhysicalConnectionVerified=false;assert.equal(reviewRaceReceipt(r).state,'BLOCKED');});
test('repeated events are not independent evidence',()=>{const r=complete();r.events[4].event=r.events[3].event;assert.throws(()=>reviewRaceReceipt(r),/E_INVALID_SANITIZED_RACE_RECEIPT/);});
test('mixed source revisions cannot be combined',()=>{const b=complete('B');b.sourceCommit='b'.repeat(40);assert.throws(()=>reviewBothRaceReceipts([complete(),b]),/E_INVALID_SANITIZED_RACE_RECEIPT/);});
for(const mutate of [r=>{r.token='private';},r=>{r.events[0].cookie='private';},r=>{r.postconditions.rawError='private';},r=>{r.requirements.secret='private';},r=>{r.events[0].seq=99;},r=>{r.postconditions.u2AStatus=NaN;}]){
  test('rejects unknown/private or malformed fields without reflecting values',()=>{const r=complete();mutate(r);assert.throws(()=>reviewRaceReceipt(r),{message:'E_INVALID_SANITIZED_RACE_RECEIPT'});});
}

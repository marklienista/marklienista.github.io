import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,fixtures,blankReceipt} from './plan.mjs';
import {evaluate} from './evaluate.mjs';

const complete=()=>{const r=blankReceipt();for(const k in r.prerequisites)r.prerequisites[k]=true;
  r.observations=cases.map(c=>({id:c.id,at:'2026-10-28T20:00:00.000Z',source:c.source,checks:{...c.expect}}));return r;};
test('a preparação vazia não aprova nenhum dos 24 casos',()=>{const r=evaluate(blankReceipt());assert.deepEqual(r.counts,{PASS:0,FAIL:0,BLOCKED:24});});
test('quatro fixtures têm produto e proprietário distintos, sem identificadores reais',()=>{assert.equal(fixtures.length,4);assert.equal(new Set(fixtures.map(r=>r.id)).size,4);assert.ok(fixtures.every(r=>r.id===`HML-${r.product}-${r.owner}`));});
test('recibos completos satisfazem critérios mas não concedem homologação publicada',()=>{const r=evaluate(complete());assert.equal(r.counts.PASS,24);assert.equal(r.publishedHomologation,'NOT_GRANTED');});
test('fixtures nunca se tornam prova real',()=>{const r=complete();r.mode='fixture';assert.equal(evaluate(r).counts.PASS,0);});
test('negação sem controle positivo fica bloqueada',()=>{const r=complete();r.observations=r.observations.filter(o=>o.id!=='H03');assert.equal(evaluate(r).cases.find(c=>c.id==='H07').reason,'POSITIVE_BASELINE_MISSING');});
test('um 403 de CSRF não aprova identidade do produto',()=>{const r=complete();r.observations.find(o=>o.id==='H11').checks.validCsrfUsedForNegativeProbe=false;assert.equal(evaluate(r).cases.find(c=>c.id==='H11').state,'BLOCKED');});
test('interceptação Origin anterior à política mantém caso bloqueado',()=>{const r=complete();r.observations.find(o=>o.id==='H11').checks.productPolicyReached=false;assert.equal(evaluate(r).cases.find(c=>c.id==='H11').reason,'EVIDENCE_PATH_NOT_REACHED');});
test('WAF anterior ao aplicativo não vira PASS ou FAIL de XSS',()=>{const r=complete();r.observations.find(o=>o.id==='H21').checks.benignMarkerReachedApplication=false;assert.equal(evaluate(r).cases.find(c=>c.id==='H21').state,'BLOCKED');});
test('mudança do registro alheio falha mesmo com recusa HTTP',()=>{const r=complete();r.observations.find(o=>o.id==='H04').checks.otherRowsUnchanged=false;assert.equal(evaluate(r).state,'FAIL');});
test('mapa em memória não satisfaz adaptador persistente',()=>{const r=complete();r.observations.find(o=>o.id==='H03').checks.persistentAdapterUsed=false;assert.equal(evaluate(r).cases.find(c=>c.id==='H03').state,'FAIL');});
test('sem ambiente SSO isolado o encerramento central permanece bloqueado',()=>{const r=complete();r.prerequisites.isolatedSso=false;assert.equal(evaluate(r).cases.find(c=>c.id==='H18').state,'BLOCKED');});
test('reinício que perde revogação falha',()=>{const r=complete();r.observations.find(o=>o.id==='H24').checks.revocationPersists=false;assert.equal(evaluate(r).state,'FAIL');});
test('contagem menor de positivos não aprova a matriz',()=>{const r=complete();r.observations.find(o=>o.id==='H01').checks.verifiedSessions=3;assert.equal(evaluate(r).cases[0].state,'FAIL');});
test('violação de produção falha mesmo sem observações',()=>{const r=blankReceipt();r.safeguards.publishedAppsUnchanged=false;assert.equal(evaluate(r).counts.FAIL,24);});
for(const [name,mutate]of [
  ['recibo com campo secreto',r=>{r.observations[0].token='never-output';}],
  ['valor textual em checks',r=>{r.observations[0].checks.profilesSeparated='never-output';}],
  ['caso duplicado',r=>r.observations.push(r.observations[0])],
  ['fonte incompatível',r=>{r.observations[0].source='database';}],
  ['versão histórica',r=>{r.contractVersion='CFT005-HML-0';}],
  ['data inválida',r=>{r.observations[0].at='not-a-date';}],
  ['critério omitido',r=>{delete r.observations[0].checks.identitiesDistinct;}],
  ['valor numérico malformado',r=>{r.observations[0].checks.verifiedSessions=NaN;}]
])test(`rejeita ${name} sem refletir entrada`,()=>{const r=complete();mutate(r);assert.throws(()=>evaluate(r),{message:'E_INVALID_SANITIZED_RECEIPT'});});

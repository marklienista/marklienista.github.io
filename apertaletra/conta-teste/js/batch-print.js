'use strict';
/* Teacher-only batch printing. Read-only existing APIs, no PDF service or uploads.
 * One explicit print preview; a failed read never produces an incomplete batch.
 */
(() => {
 const stateLabels={draft:'Rascunho',delivered:'Entregue',returned:'Para continuar'};
 let active=null;
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const sortNamed=(items,key)=>[...items].sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||''),'pt-BR',{numeric:true})||String(a.id).localeCompare(String(b.id)));
 function close(){
  if(!active)return;const old=active;active=null;old.cancelled=true;
  document.body.classList.remove('batch-printing');document.title=old.title;
  if(old.dialog.open)old.dialog.close();old.dialog.replaceChildren();old.dialog.remove();
  if(old.focus?.isConnected)old.focus.focus();
 }
 function assertCurrent(job){
  if(job.cancelled||active!==job)throw new Error('Preparação cancelada.');
  if(job.api.cloud.user?.id!==job.owner||job.api.cloud.epoch!==job.epoch)throw new Error('A conta mudou. Feche a prévia e entre novamente.');
 }
 async function read(job,action,args={}){
  assertCurrent(job);const value=await job.api.call(action,args);assertCurrent(job);return value;
 }
 async function parallel(items,fn,workers=3){
  const results=new Array(items.length);let next=0,failure;
  await Promise.all(Array.from({length:Math.min(workers,items.length)},async()=>{
   while(next<items.length&&!failure){const index=next++;try{results[index]=await fn(items[index]);}catch(e){failure=e;}}
  }));
  if(failure)throw failure;return results;
 }
 function sheet({activity,participant=null,production=null,model=false}){
  const payload=model?activity.model:production.payload;
  const doc=AL.importFile('impressao.apertaletra',JSON.stringify(payload));
  const article=make('article','batch-sheet');
  const header=make('header','batch-sheet-header');
  header.append(make('p','batch-activity-name',activity.title||'Atividade sem título'));
  header.append(make('h2','batch-participant',model?'Proposta da atividade':participant.display_name||'Participante'));
  const meta=model?'Sem participantes — modelo preparado pelo professor':(stateLabels[production.state]||'Produção')+' · revisão '+production.revision;
  header.append(make('p','batch-meta',meta));article.append(header);
  const content=make('div','batch-writing');
  content.style.fontFamily=AL.fontStack(doc.settings.font);content.style.fontSize=doc.settings.size+'px';
  if(doc.title)content.append(make('h3','batch-text-title',doc.title));
  const block=(html,label)=>{
   const section=make('section','batch-writing-section');
   if(label)section.append(make('h4','batch-field-label',label));
   const text=make('div','batch-text');text.innerHTML=AL.cleanHTML(html);
   if(!AL.textFromHTML(html).trim())text.append(make('p','batch-empty','Sem texto neste campo.'));
   section.append(text);content.append(section);
  };
  if(AL.GENRES[AL.kind(doc)])doc.blocks.forEach((b,i)=>block(b.html,AL.GENRES[AL.kind(doc)].fields[i].label));
  else block(doc.html);
  article.append(content);return article;
 }
 async function open(api,activityId=null){
  if(!api.cloud.user?.id)throw new Error('Entre na área do professor para imprimir as produções.');
  close();
  const dialog=make('dialog','batch-print-dialog');dialog.id='batchPrintDialog';dialog.setAttribute('aria-labelledby','batchPrintHeading');
  const controls=make('div','batch-print-controls');
  const heading=make('h1',null,'Imprimir / salvar PDF');heading.id='batchPrintHeading';
  const exit=make('button','secondary','Voltar');exit.type='button';exit.id='closeBatchPrint';exit.onclick=close;
  const summary=make('p','batch-print-summary','Buscando atividades…');summary.id='batchPrintSummary';summary.setAttribute('role','status');
  const help=make('p','batch-print-help','Um único documento, com cada produção começando em uma nova página. No destino da impressão, escolha sua impressora ou “Salvar como PDF”.');
  const button=make('button','primary','Imprimir / salvar PDF');button.type='button';button.id='confirmBatchPrint';button.disabled=true;
  const actions=make('div','batch-print-actions');actions.append(button,exit);
  controls.append(heading,summary,help,actions);
  const pages=make('div','batch-print-pages');pages.id='batchPrintPages';pages.setAttribute('aria-busy','true');
  dialog.append(controls,pages);document.body.append(dialog);
  const job={api,owner:api.cloud.user.id,epoch:api.cloud.epoch,dialog,pages,summary,button,cancelled:false,ready:false,title:document.title,focus:document.activeElement};active=job;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(active===job)close();});
  button.onclick=()=>{
   try{assertCurrent(job);if(!job.ready)return;document.body.classList.add('batch-printing');window.print();}
   catch(error){job.ready=false;button.disabled=true;pages.replaceChildren();summary.textContent=error.message;document.body.classList.remove('batch-printing');}
  };
  dialog.showModal();exit.focus();
  try{
   const activities=activityId?[{id:activityId}]:(await read(job,'list')).activities;
   if(!Array.isArray(activities))throw new Error('Lista de atividades inválida.');
   const entries=[];let productionCount=0,modelCount=0;
   for(const selected of sortNamed(activities,'title')){
    summary.textContent='Preparando '+(selected.title||'atividade')+'…';
    const detail=await read(job,'detail',{activity_id:selected.id});
    if(detail.activity?.id!==selected.id||!Array.isArray(detail.participants))throw new Error('A lista da atividade mudou. Prepare novamente o lote.');
    const participants=sortNamed(detail.participants,'display_name');
    if(!participants.length){entries.push({activity:detail.activity,model:true});modelCount++;continue;}
    let received=0;
    const group=await parallel(participants,async participant=>{
     const info=await read(job,'production',{activity_id:selected.id,production_id:participant.production_id});
     if(info.activity?.id!==selected.id||info.production?.id!==participant.production_id||info.participant?.id!==participant.id)throw new Error('A produção recebida não corresponde ao participante.');
     summary.textContent=detail.activity.title+': '+(++received)+' de '+participants.length+' produções recebidas…';
     return {activity:info.activity,participant:info.participant,production:info.production};
    });
    entries.push(...group);productionCount+=group.length;
   }
   assertCurrent(job);
   // Sanitize every document before exposing any printable content.
   const fragment=document.createDocumentFragment();for(const entry of entries)fragment.append(sheet(entry));
   pages.replaceChildren(fragment);pages.setAttribute('aria-busy','false');
   if(!entries.length){summary.textContent='Nenhuma atividade para imprimir. Crie uma atividade primeiro.';return;}
   summary.textContent=activities.length+' atividade(s) · '+productionCount+' produção(ões)'+(modelCount?' · '+modelCount+' proposta(s) sem participantes':'')+'. Inclui rascunhos. Apenas versões recebidas pela nuvem; alterações ainda locais não entram. Preparado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.';
   document.title=activityId?(entries[0].activity.title||'Atividade')+' — produções — ApertaLetra':'Atividades e produções — ApertaLetra';
   job.ready=true;button.disabled=false;document.body.classList.add('batch-printing');button.focus();
  }catch(error){
   if(active!==job)return;
   job.ready=false;pages.replaceChildren();pages.setAttribute('aria-busy','false');button.disabled=true;
   summary.textContent='Não foi possível preparar o lote completo. Nenhuma impressão parcial foi liberada. '+error.message;
  }
 }
 // Ctrl+P follows the same batch preview, without printing the teacher dashboard.
 window.addEventListener('beforeprint',()=>{
  if(!active)return;
  try{assertCurrent(active);if(!active.ready)throw new Error('Aguarde o lote completo antes de imprimir.');}
  catch(error){active.pages.replaceChildren();active.button.disabled=true;active.ready=false;active.summary.textContent=error.message;}
  document.body.classList.add('batch-printing');
 });
 globalThis.ALBatchPrint={open,close};
})();

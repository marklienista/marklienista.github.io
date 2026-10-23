'use strict';
(() => {
 const $=id=>document.getElementById(id),cloud=new ALCloud.Cloud(AL_CONFIG),api=new ALClass.API(cloud),db=new ALOnline.DraftDB();
 const local=new ALOnline.OnlineStore({db});local.scope='writing-local-v3';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pretty=x=>String(x||'').match(/.{1,2}/g)?.join(' ')||'';
 const now=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
 const labels={draft:'Rascunho',open:'Aberta',paused:'Pausada',archived:'Arquivada',delivered:'Entregue',returned:'Para continuar'};
 let user=null,busy=false,view='welcome',detail=null,work=null,interval=null,joinInfo=null,approved=null;
 const say=(id,text)=>{if($(id))$(id).textContent=text;};
 function tell(text){say('teacherNotice',text);say('joinNotice',text);say('authMessage',text);say('contextNotice',text);}
 async function run(fn){if(busy)return;busy=true;document.body.classList.add('working');try{await fn();}catch(e){tell(e.message||'Não foi possível concluir.');}finally{busy=false;document.body.classList.remove('working');}}
 function hideSurfaces(){for(const id of ['adultRoot','editorRoot','joinRoot'])$(id).hidden=true;}
 function adultPanel(id){
  hideSurfaces();$('adultRoot').hidden=false;for(const p of ['welcomePanel','authPanel','textsPanel','teacherPanel'])$(p).hidden=p!==id;
  $('adultRoot').dataset.panel=id;$('teacherNav').hidden=!user;view=id;document.body.dataset.workMode='';
 }
 function studentPanel(html){hideSurfaces();$('joinRoot').hidden=false;$('joinRoot').innerHTML=html;view='join';document.body.dataset.workMode='';}
 function joinHeader(){return '<div class="join-heading"><span class="adult-brand">ApertaLetra</span><button id="joinHome" class="plain" type="button">← Início</button></div>';}
 function wireJoinHome(){$('joinHome').onclick=()=>run(async()=>{stopPolling();adultPanel('welcomePanel');});}
 function stopPolling(){clearInterval(interval);interval=null;}
 function rememberSession(value){try{if(value)sessionStorage.setItem('apertaletra:student:v1',JSON.stringify(value));else sessionStorage.removeItem('apertaletra:student:v1');}catch{}}
 function remembered(){try{return JSON.parse(sessionStorage.getItem('apertaletra:student:v1'));}catch{return null;}}
 async function leaveWriting(){
  if(work&&!await ALEditor.persist())return false;
  ALEditor.unmount();work=null;stopPolling();return true;
 }
 async function showHome(){if(!await leaveWriting())return;adultPanel('welcomePanel');}
 function topNotice(){return '<p id="teacherNotice" class="notice" role="status">Recursos docentes liberados nesta fase de desenvolvimento. Use somente textos fictícios.</p>';}
 async function activities(){
  if(!await leaveWriting())return;detail=null;adultPanel('teacherPanel');
  $('teacherPanel').innerHTML='<div class="section-plate"><div><p class="eyebrow">ÁREA DO PROFESSOR</p><h1>Atividades</h1></div><div class="activity-actions"><button id="createActivity" class="primary">+ Nova atividade</button><button id="printActivities" class="secondary">Imprimir todas / PDF</button></div></div>'+topNotice()+'<div id="activityList" class="activity-grid"><p>Buscando atividades…</p></div>';
  $('createActivity').onclick=()=>createDialog();
  $('printActivities').onclick=()=>run(()=>ALBatchPrint.open(api));
  const response=await api.call('list');
  if(view!=='teacherPanel'||detail)return;
  $('activityList').innerHTML=response.activities.length?response.activities.map(a=>`<article class="activity-card"><div class="activity-kind" aria-hidden="true">${a.kind==='recipe'?'≡':'Aa'}</div><span class="status-chip">${labels[a.state]}</span><h2>${esc(a.title)}</h2><p>${a.participant_count} participantes${Number(a.pending_count)?` · ${a.pending_count} entradas para liberar`:''}</p><button class="secondary" data-activity="${a.id}">Abrir atividade</button></article>`).join(''):'<div class="empty-state"><span aria-hidden="true">Aa</span><h2>Uma proposta. Muitas escritas.</h2><p>Prepare uma folha livre ou uma receita. Cada criança terá sua própria produção.</p></div>';
  document.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>run(()=>openActivity(b.dataset.activity)));
 }
 function createDialog(){
  const d=document.createElement('dialog');d.className='class-dialog';d.innerHTML='<form><div class="dialog-head"><h2>Nova atividade</h2><button type="button" aria-label="Fechar">×</button></div><label>Nome da atividade<input name="title" maxlength="120" required placeholder="Por exemplo: Nossa receita"></label><fieldset><legend>Como começa?</legend><label><input type="radio" name="kind" value="free" checked> Escrita livre</label><label><input type="radio" name="kind" value="recipe"> Receita</label></fieldset><button class="primary" type="submit">Preparar proposta</button><p role="status"></p></form>';
  document.body.append(d);d.querySelector('[aria-label=Fechar]').onclick=()=>{d.close();d.remove();};d.addEventListener('close',()=>d.remove());
  d.querySelector('form').onsubmit=e=>{e.preventDefault();run(async()=>{try{const f=new FormData(e.target),doc=AL.fresh(f.get('kind'));const a=await api.call('create',{title:f.get('title'),payload:JSON.parse(AL.exportFile(doc))});d.close();await prepare(a);}catch(error){d.querySelector('[role=status]').textContent=error.message;}});};d.showModal();
 }
 async function openActivity(id){
  if(!await leaveWriting())return;const data=await api.call('detail',{activity_id:id});detail=data;adultPanel('teacherPanel');
  const a=data.activity,kind=AL.kind(a.model.document),hasPeople=data.participants.length>0;
  $('teacherPanel').innerHTML=`<button id="backActivities" class="plain">← Atividades</button><div class="section-plate"><div><p class="eyebrow">${kind==='recipe'?'RECEITA':'ESCRITA LIVRE'}</p><h1>${esc(a.title)}</h1></div><span class="status-chip">${labels[a.state]}</span></div><div class="activity-actions"><button id="editModel" class="secondary" ${hasPeople?'disabled':''}>Preparar proposta</button><button id="duplicateActivity" class="plain">Duplicar</button><button id="toggleActivity" class="primary">${a.state==='open'?'Pausar entradas e escrita':'Abrir atividade'}</button><button id="archiveActivity" class="plain" ${a.state==='archived'?'disabled':''}>Arquivar</button><button id="refreshActivity" class="plain">Atualizar</button><button id="printActivity" class="secondary">Imprimir produções / PDF</button></div><p id="teacherNotice" class="notice" role="status">${a.state==='open'?'A atividade está aberta. Confira os pedidos antes de liberar.':a.state==='archived'?'Produções guardadas. Você pode reabrir a atividade.':'Quando estiver pronta, abra a atividade para as crianças entrarem.'}</p><div class="class-overview"><section class="code-card"><p>Código da atividade</p><strong class="class-code">${pretty(a.join_code)}</strong><button id="copyActivityLink" class="secondary">Copiar link de entrada</button><small>Entrada sem e-mail ou senha da criança. O professor libera cada participação.</small></section><section class="class-summary"><h2>Participantes e produções</h2><p><strong>${data.participants.length}</strong> participantes · <strong>${data.participants.filter(p=>p.state==='delivered').length}</strong> produções entregues</p><button id="addRoster" class="secondary">Adicionar nomes (opcional)</button><p class="muted">Você também pode identificar cada criança ao liberar sua entrada.</p></section></div><section class="pending-section"><h2>Entradas para liberar <span class="count-badge">${data.requests.length}</span></h2><div id="requestsList"></div></section><section><h2>Produções</h2><div class="participant-list" id="participantsList"></div></section><p class="muted">Atualizado às ${now()}. ${hasPeople?'A proposta já utilizada fica preservada; duplique para preparar outra.':''}</p>`;
  $('printActivity').onclick=()=>run(()=>ALBatchPrint.open(api,a.id));
  $('backActivities').onclick=()=>run(activities);$('refreshActivity').onclick=()=>run(()=>openActivity(a.id));$('editModel').onclick=()=>run(()=>prepare(a));
  $('toggleActivity').onclick=()=>run(async()=>{await api.call('state',{activity_id:a.id,state:a.state==='open'?'paused':'open'});await openActivity(a.id);});
  $('archiveActivity').onclick=()=>run(async()=>{await api.call('state',{activity_id:a.id,state:'archived'});await openActivity(a.id);});
  $('duplicateActivity').onclick=()=>run(async()=>{let copy=await api.call('create',{title:(a.title+' (cópia)').slice(0,120),payload:a.model});copy=await api.call('activity_save',{activity_id:copy.id,expected_revision:copy.revision,payload:a.model,locked_fields:a.locked_fields,interface_mode:a.interface_mode});await prepare(copy);});
  $('copyActivityLink').onclick=()=>run(async()=>{const link=location.origin+location.pathname+'?atividade='+a.join_code;try{await navigator.clipboard.writeText(link);say('teacherNotice','Link copiado. A criança entra e aguarda sua liberação.');}catch{say('teacherNotice',link);}});
  $('addRoster').onclick=()=>rosterDialog(a.id);
  $('requestsList').innerHTML=data.requests.length?data.requests.map(r=>`<article class="request-row"><div><strong>${esc(r.requested_name)}</strong><small>Sinal na tela: ${esc(r.pairing_code)}</small></div><label class="sr-only" for="pair-${r.id}">Associar a participante</label><select id="pair-${r.id}"><option value="">Criar participante com este nome</option>${data.participants.map(p=>`<option value="${p.id}">${esc(p.display_name)} · ${p.id.slice(-4)}</option>`).join('')}</select><button class="primary" data-approve="${r.id}">Liberar</button><button class="plain" data-reject="${r.id}">Recusar</button></article>`).join(''):'<p class="muted">Nenhuma entrada aguardando. Use Atualizar depois que as crianças entrarem.</p>';
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>run(async()=>{await api.call('approve',{activity_id:a.id,request_id:b.dataset.approve,participant_id:$('pair-'+b.dataset.approve).value||null});await openActivity(a.id);}));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>run(async()=>{await api.call('reject',{activity_id:a.id,request_id:b.dataset.reject});await openActivity(a.id);}));
  $('participantsList').innerHTML=data.participants.length?data.participants.map((p,i)=>`<article class="participant-row"><span class="participant-mark" aria-hidden="true">${['●','▲','■','◆'][i%4]}</span><div><strong>${esc(p.display_name)}</strong><small>${labels[p.state]} · ${p.id.slice(-4)}</small></div><button class="secondary" data-production="${p.production_id}">Abrir produção</button></article>`).join(''):'<p class="muted">A lista aparece quando você adiciona nomes ou libera uma entrada.</p>';
  document.querySelectorAll('[data-production]').forEach(b=>b.onclick=()=>run(()=>openProduction(a.id,b.dataset.production)));
 }
 function rosterDialog(activityId){
  const d=document.createElement('dialog');d.className='class-dialog';d.innerHTML='<form><div class="dialog-head"><h2>Nomes dos participantes</h2><button type="button" aria-label="Fechar">×</button></div><label>Um nome por linha<textarea name="names" rows="7" maxlength="16200" required placeholder="Juliana\nGabriel\nAna"></textarea></label><p>Nomes repetidos recebem identificadores distintos. Não é necessário nome completo.</p><button class="primary" type="submit">Adicionar</button><p role="status"></p></form>';document.body.append(d);d.querySelector('[aria-label=Fechar]').onclick=()=>d.close();d.onclose=()=>d.remove();
  d.querySelector('form').onsubmit=e=>{e.preventDefault();run(async()=>{try{const names=new FormData(e.target).get('names').split('\n').map(x=>x.trim()).filter(Boolean);await api.call('roster',{activity_id:activityId,names});d.close();await openActivity(activityId);}catch(error){d.querySelector('[role=status]').textContent=error.message;}});};d.showModal();
 }
 async function writing(store,doc,context){
  hideSurfaces();$('editorRoot').hidden=false;$('writingContext').hidden=false;document.body.dataset.workMode=context.mode;view='writing';work={store,context};
  say('writingPerson',context.person||'Escrever');say('writingTask',context.task||'');$('writingActions').innerHTML=context.actions||'';
  if(!$('contextNotice')){const n=document.createElement('p');n.id='contextNotice';n.className='context-notice';n.setAttribute('role','status');$('writingContext').insertAdjacentElement('afterend',n);}say('contextNotice','');
  await ALEditor.mount(store,doc,context);$('retrySync').hidden=!['student','review','personal'].includes(context.mode);
  $('writerBack').onclick=()=>run(async()=>{if(context.mode==='student'){if(await leaveWriting())await participantCard();}else if(context.mode==='model'){if(await leaveWriting())await openActivity(context.activity.id);}else if(context.mode==='review'||context.mode==='observe'){if(context.mode==='review'){await ALEditor.persist();await api.call('review_close',{activity_id:context.activity.id,production_id:context.productionId});}if(await leaveWriting())await openActivity(context.activity.id);}else await showHome();});
 }
 async function prepare(a){
  const store=new ALOnline.OnlineStore({db});store.scope='model:'+user.id+':'+a.id+':'+a.revision;
  const doc=await store.get(a.id)||{...AL.importFile('modelo.apertaletra',JSON.stringify(a.model)),id:a.id};
  await writing(store,doc,{mode:'model',activity:a,bound:true,person:'Preparar proposta',task:a.title,actions:'<button id="saveModel" class="primary">Guardar proposta</button>'});
  const options=document.createElement('div');options.id='modelOptions';options.className='model-options';
  const fields=AL.kind(doc)==='recipe'?[['title','Nome da receita'],['ingredients','Ingredientes'],['preparation','Modo de preparo']]:[['title','Título'],['body','Texto']];
  options.innerHTML='<strong>Trechos fornecidos pelo professor:</strong>'+fields.map(([key,label])=>`<label><input type="checkbox" name="protected" value="${key}" ${a.locked_fields.includes(key)?'checked':''}> ${label}</label>`).join('')+'<label>Botões <select id="modelMode"><option value="symbols">Símbolos</option><option value="both">Símbolos e palavras</option><option value="text">Palavras</option></select></label>';
  $('writingContext').insertAdjacentElement('afterend',options);$('modelMode').value=a.interface_mode;
  $('saveModel').onclick=()=>run(async()=>{if(!await ALEditor.persist())return;const captured=ALEditor.capture();const locks=[...document.querySelectorAll('input[name=protected]:checked')].map(x=>x.value);await api.call('activity_save',{activity_id:a.id,expected_revision:a.revision,title:a.title,payload:JSON.parse(AL.exportFile(captured)),locked_fields:locks,interface_mode:$('modelMode').value});options.remove();await leaveWriting();await openActivity(a.id);});
 }
 async function openProduction(activityId,productionId){
  const info=await api.call('production',{activity_id:activityId,production_id:productionId});
  const store=new ALClass.ProductionStore(api,info,{teacher:true,db});const doc=await store.get();
  await writing(store,doc,{mode:'observe',activity:info.activity,productionId,bound:true,readOnly:true,person:info.participant.display_name,task:info.activity.title,actions:'<button id="beginReview" class="primary">Intervir no texto</button><button id="showHistory" class="secondary">Versões</button>'});
  $('beginReview').onclick=()=>run(async()=>{const p=await api.call('review_open',{activity_id:activityId,production_id:productionId});info.production=p;await leaveWriting();const editStore=new ALClass.ProductionStore(api,info,{teacher:true,db});await writing(editStore,await editStore.get(),{mode:'review',activity:info.activity,productionId,bound:true,person:info.participant.display_name,task:'Intervenção do professor · versão anterior preservada',actions:'<button id="returnProduction" class="primary">Devolver para continuar</button><button id="showHistory" class="secondary">Versões</button>'});
   $('showHistory').onclick=()=>run(()=>historyDialog(activityId,productionId));
   $('returnProduction').onclick=()=>run(async()=>{await ALEditor.persist();await editStore.sync();if(editStore.state!=='synced')throw editStore.error||new Error('A intervenção ainda não foi sincronizada.');await api.call('return',{activity_id:activityId,production_id:productionId,expected_revision:editStore.base});await leaveWriting();await openActivity(activityId);});
  });$('showHistory').onclick=()=>run(()=>historyDialog(activityId,productionId));
 }
 async function historyDialog(activityId,productionId){
  const rows=await api.call('history',{activity_id:activityId,production_id:productionId});const d=document.createElement('dialog');d.className='class-dialog history-dialog';d.innerHTML='<div class="dialog-head"><h2>Versões da produção</h2><button aria-label="Fechar">×</button></div><p>Proposta, escrita e intervenção ficam distinguidas. Não são notas nem níveis de alfabetização.</p><div class="history-list"></div>';d.querySelector('button').onclick=()=>d.close();d.onclose=()=>d.remove();document.body.append(d);
  for(const row of rows){const item=document.createElement('details'),summary=document.createElement('summary');summary.textContent=({template:'Proposta do professor',student:'Escrita / antes da intervenção',teacher:'Intervenção do professor'})[row.author]+' · '+new Date(row.created_at).toLocaleString('pt-BR');const doc=AL.importFile('versao.apertaletra',JSON.stringify(row.payload)),body=document.createElement('div');body.className='history-text';const h=document.createElement('h3');h.textContent=doc.title;body.append(h);const c=document.createElement('div');c.innerHTML=AL.cleanHTML(doc.html);body.append(c);item.append(summary,body);d.querySelector('.history-list').append(item);}d.showModal();
 }
 async function localWriting(kind='free',selected=null){
  await local.open();await writing(local,selected||AL.fresh(kind),{mode:'local',person:'ApertaLetra',task:'Escrita no computador'});
  if(kind==='recipe'&&!selected)await ALEditor.newDocument('recipe');
 }
 async function localLibrary(){
  if(!await ALEditor.persist())return;const docs=await local.list();$('documentList').innerHTML=docs.map(d=>`<article class="participant-row"><strong>${esc(d.title||'Texto sem título')}</strong><button data-local-doc="${esc(d.id)}">Abrir</button></article>`).join('')||'<p>Ainda não há textos neste navegador.</p>';
  document.querySelectorAll('[data-local-doc]').forEach(b=>b.onclick=()=>run(async()=>{$('libraryDialog').close();await localWriting('free',await local.get(b.dataset.localDoc));}));$('libraryDialog').showModal();
 }
 function enterCode(code=''){
  stopPolling();studentPanel(joinHeader()+`<div class="join-card"><div class="join-symbol" aria-hidden="true">12 34</div><h1>Entrar com código</h1><form id="codeForm"><label for="activityCode">Código da atividade</label><input id="activityCode" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="00 00 00" value="${esc(pretty(code))}" required><label for="studentName">Seu nome</label><input id="studentName" autocomplete="off" maxlength="80" placeholder="Nome ou identificação"><div class="join-actions"><button class="primary" type="submit">Entrar →</button><button id="teacherChooses" class="secondary" type="button">Meu professor escolhe meu nome</button></div></form><p id="joinNotice" role="status"></p><p class="muted">Não precisa de e-mail nem senha.</p></div>`);wireJoinHome();
  $('activityCode').oninput=()=>{const clean=$('activityCode').value.replace(/\D/g,'').slice(0,6);$('activityCode').value=pretty(clean);};
  const join=async teacherChooses=>{const value=$('activityCode').value.replace(/\D/g,'');if(value.length!==6)throw new Error('Digite os seis números do código.');const name=$('studentName').value.trim()||(teacherChooses?'Professor escolhe meu nome':'');if(!name)throw new Error('Digite seu nome ou peça ao professor para escolher.');const token=api.newSession();joinInfo={token,code:value,name};rememberSession(joinInfo);const result=await api.call('join',{code:value,name},true);joinInfo={...joinInfo,...result};rememberSession(joinInfo);waiting(result);};
  $('codeForm').onsubmit=e=>{e.preventDefault();run(()=>join(false));};$('teacherChooses').onclick=()=>run(()=>join(true));
 }
 function waiting(result){
  stopPolling();studentPanel(joinHeader()+`<div class="join-card"><span class="waiting-mark" aria-hidden="true">•••</span><h1>Seu professor vai liberar</h1><p>Mostre este sinal na sua tela:</p><strong class="pairing-code">${esc(result.pairing_code||'')}</strong><p id="joinNotice" role="status">Aguardando…</p><button id="checkEntry" class="primary">Verificar entrada</button><button id="changePerson" class="plain">Trocar pessoa</button></div>`);wireJoinHome();
  let polling=false;const session=api.token;const poll=async()=>{if(polling)return;polling=true;try{const r=await api.call('read',{},true);if(api.token!==session)return;if(!r.pending){approved=r;stopPolling();participantCard(r);}}catch(e){say('joinNotice',e.message);}finally{polling=false;}};
  $('checkEntry').onclick=()=>run(poll);$('changePerson').onclick=()=>run(changePerson);interval=setInterval(()=>{if(!busy&&view==='join')poll();},4000);
 }
 async function participantCard(info=null){
  stopPolling();if(!info){info=await api.call('read',{},true);if(info.pending){waiting(info);return;}}approved=info;
  studentPanel(joinHeader()+`<div class="join-card"><span class="participant-mark large" aria-hidden="true">●</span><h1>${esc(info.participant.display_name)}</h1><p>${esc(info.activity.title)}</p><p class="status-chip">${labels[info.production.state]}</p><button id="continueWriting" class="primary wide">${info.production.state==='delivered'?'Ver meu texto':'Continuar a escrever'} →</button><button id="changePerson" class="plain">Não sou eu / trocar pessoa</button><p id="joinNotice" role="status"></p></div>`);wireJoinHome();$('continueWriting').onclick=()=>run(()=>studentWriting(info));$('changePerson').onclick=()=>run(changePerson);
 }
 async function changePerson(){
  if(work&&!await leaveWriting())return;stopPolling();try{await api.call('leave',{},true);}catch{/* local token is still discarded; cannot be reused from this UI */}api.token=null;joinInfo=null;approved=null;rememberSession(null);enterCode();
 }
 function readOnlyInfo(info){return info.activity.state!=='open'||info.production.state==='delivered'||Date.parse(info.production.reviewing_until||'')>Date.now();}
 async function studentWriting(info){
  const store=new ALClass.ProductionStore(api,info,{db});const doc=await store.get();
  await writing(store,doc,{mode:'student',bound:true,locked:info.activity.locked_fields,readOnly:readOnlyInfo(info),person:info.participant.display_name,task:info.activity.title,actions:'<button id="finishWriting" class="primary" aria-label="Terminei" title="Terminei"><span class="control-icon" aria-hidden="true">✓</span> <span class="control-label">Terminei</span></button><button id="receivedVersion" class="secondary" hidden>Reabrir versão recebida</button><button id="changePerson" class="plain">Trocar pessoa</button><button id="recoverLocalDraft" class="plain" hidden>Baixar rascunho anterior</button>'});
  const recoveries=await db.list(store.scope+':recovery');if(recoveries.length){$('recoverLocalDraft').hidden=false;$('recoverLocalDraft').onclick=()=>{const last=recoveries[recoveries.length-1];const url=URL.createObjectURL(new Blob([AL.exportFile(last.doc)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=AL.filename(last.doc.title)+'-rascunho.apertaletra';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};}
  const mode=info.activity.interface_mode||'symbols';document.querySelector(`[data-mode-choice="${mode}"]`)?.click();$('settingsDialog').close();
  $('changePerson').onclick=()=>run(changePerson);
  const updateState=latest=>{
   ALEditor.setPolicy({readOnly:readOnlyInfo(latest),locked:latest.activity.locked_fields});$('finishWriting').disabled=readOnlyInfo(latest);
   if(latest.production.revision>store.base){$('receivedVersion').hidden=false;say('contextNotice','Há uma versão do professor. Seu texto não foi substituído.');}
   else if(latest.activity.state!=='open')say('contextNotice','Atividade pausada. O professor pode reabrir.');
   else if(latest.production.state==='delivered')say('contextNotice','Entregue. Seu professor já pode abrir.');
   else if(Date.parse(latest.production.reviewing_until||'')>Date.now())say('contextNotice','Seu professor está revisando este texto.');
   else say('contextNotice','');
  };updateState(info);
  $('receivedVersion').onclick=()=>run(async()=>{await ALEditor.persist();const fresh=await store.acceptRemote();const current=store.info;await leaveWriting();await studentWriting(current);});
  $('finishWriting').onclick=()=>run(async()=>{await ALEditor.persist();await store.sync();if(store.state!=='synced')throw store.error||new Error('O texto ainda não foi enviado. Mantenha esta página ou baixe uma cópia.');const r=await api.call('finish',{expected_revision:store.base},true);approved=r;await leaveWriting();await participantCard(r);});
  stopPolling();interval=setInterval(async()=>{if(view!=='writing'||work?.store!==store||busy)return;try{const latest=await store.refresh();updateState(latest);}catch(e){say('contextNotice',e.message);if(e.status===403||e.status===401)ALEditor.setPolicy({readOnly:true});}},8000);
 }
 function account(){adultPanel('teacherPanel');$('teacherPanel').innerHTML=`<div class="section-plate"><h1>Minha conta</h1></div><p>${esc(user.email)}</p><p>Conta do adulto. As crianças participam por atividade, sem conta própria.</p><p>Os recursos docentes estão liberados para teste nesta etapa. Não há cobrança ativa.</p><button id="signOutTeacher" class="secondary">Sair da conta</button><p id="teacherNotice" role="status"></p>`;$('signOutTeacher').onclick=()=>run(logout);}
 async function logout(){if(!await leaveWriting())return;stopPolling();const ok=await cloud.logout();user=null;detail=null;$('adultEmail').value='';$('adultPassword').value='';$('teacherPanel').replaceChildren();adultPanel('welcomePanel');if(!ok){adultPanel('authPanel');say('authMessage','Saiu deste navegador. A confirmação de encerramento no servidor ficou pendente.');}}
 $('enterAccount').onclick=()=>{if(user){run(activities);return;}adultPanel('authPanel');say('backendNotice','Entre com sua conta adulta para preparar e acompanhar atividades.');};
 $('backWelcome').onclick=()=>run(showHome);$('adultHome').onclick=e=>{e.preventDefault();run(user?activities:showHome);};
 $('tryDemo').onclick=()=>run(()=>localWriting());$('enterCode').onclick=()=>enterCode();
 $('authForm').onsubmit=e=>{e.preventDefault();run(async()=>{say('authMessage','Entrando…');try{user=await cloud.login($('adultEmail').value.trim(),$('adultPassword').value);await activities();}finally{$('adultPassword').value='';}});};
 $('signupButton').onclick=()=>run(async()=>{if(!$('authForm').reportValidity())return;try{await cloud.signup($('adultEmail').value.trim(),$('adultPassword').value);say('authMessage','Confira seu e-mail, confirme o cadastro e volte aqui para entrar.');}finally{$('adultPassword').value='';}});
 $('navActivities').onclick=()=>run(activities);$('navMyTexts').onclick=()=>run(()=>localWriting());$('navAccount').onclick=()=>run(account);
 $('retrySync').onclick=()=>run(async()=>{await ALEditor.retry();if(work?.store.error)tell(work.store.error.message);});
 document.addEventListener('al:library',()=>{if(work?.context.mode==='local')run(localLibrary);else $('writerBack').click();});
 window.addEventListener('online',()=>{if(work&&!busy)run(()=>ALEditor.retry());});
 // Remove model controls whenever the context changes.
 const originalUnmount=ALEditor.unmount;ALEditor.unmount=()=>{$('modelOptions')?.remove();originalUnmount();};
 adultPanel('welcomePanel');
 const code=new URLSearchParams(location.search).get('atividade');const saved=remembered();
 if(saved?.token&&/^[a-f0-9]{64}$/.test(saved.token)&&(!code||code===saved.code)){
  api.token=saved.token;joinInfo=saved;participantCard().catch(()=>{rememberSession(null);enterCode(code||saved.code);});
 }else if(code&&/^\d{6}$/.test(code))enterCode(code);
 else cloud.restore().then(next=>{if(next){user=next;if(view==='welcomePanel')return run(activities);}});
 document.documentElement.dataset.portalReady='true';
})();

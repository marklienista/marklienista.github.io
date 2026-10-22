'use strict';
(() => {
 const $=id=>document.getElementById(id),cloud=new ALCloud.Cloud(AL_CONFIG),db=new ALOnline.DraftDB();
 let store=null,user=null,busy=false,screenEpoch=0;
 const say=(id,text)=>$(id).textContent=text;
 function panel(id){for(const p of ['welcomePanel','authPanel','textsPanel'])$(p).hidden=p!==id;$('adultRoot').dataset.panel=id;$('adultRoot').hidden=false;$('editorRoot').hidden=true;}
 async function run(fn){if(busy)return;busy=true;try{await fn();}catch(error){say('textsNotice',error.message||'Não foi possível concluir.');say('authMessage',error.message||'Não foi possível concluir.');}finally{busy=false;}}
 async function adult(){
  if(!store){panel('welcomePanel');return;}
  if(!await ALEditor.persist())return;
  ALEditor.unmount();panel('textsPanel');await listing();
 }
 async function listing(){
  const epoch=screenEpoch,active=store;if(!active)return;
  say('accountLabel',user?'CONTA ADULTA · '+user.email:'EXPERIMENTAÇÃO SEM CONTA');
  say('textsNotice',user?'Os textos sincronizados pertencem à sua conta. Rascunhos pendentes ficam separados neste navegador.':'Somente textos fictícios. Esta experimentação não envia textos para a nuvem.');
  $('leaveAccount').textContent=user?'Sair da conta':'Encerrar experimentação';$('adultTextList').replaceChildren();
  const docs=await active.list();if(epoch!==screenEpoch||store!==active)return;
  if(active.lastError)say('textsNotice','Não foi possível consultar a nuvem. A lista contém apenas as cópias e os rascunhos locais desta conta.');
  if(!docs.length){const p=document.createElement('p');p.textContent='Comece com uma escrita livre ou uma receita.';$('adultTextList').append(p);}
  for(const item of docs){
   const row=document.createElement('article');row.className='adult-text-row';const name=document.createElement('strong');name.textContent=item.title||'Texto sem título';const state=document.createElement('p');state.textContent=ALOnline.stateLabel(item.syncState);const date=document.createElement('p');date.textContent=(AL.kind(item)==='recipe'?'Receita':'Escrita livre')+' · '+new Date(item.updatedAt).toLocaleString('pt-BR');
   const open=document.createElement('button');open.textContent='Abrir';open.className='secondary';open.onclick=()=>run(async()=>{const latest=await active.get(item.id);if(!latest)throw new Error('Texto não disponível. Nenhuma produção foi substituída.');await writing(latest);});row.append(name,state,date,open);
   if(user&&['local','conflict','cached'].includes(item.syncState)){
    const retry=document.createElement('button');retry.className='plain';retry.textContent=item.syncState==='conflict'?'Salvar rascunho como nova cópia':'Tentar sincronizar';
    retry.onclick=()=>run(async()=>{if(item.syncState==='conflict')await active.copyConflict(item.id);else await active.sync(item.id);await listing();});row.append(retry);
   }
   $('adultTextList').append(row);
  }
  say('entitlementInfo',user?'Plano free por padrão. Nenhuma cobrança ou bloqueio de salvamento nesta etapa.':'Os arquivos editáveis continuam disponíveis pelo botão Baixar.');
  if(user){try{const plan=await cloud.entitlement();if(epoch===screenEpoch)say('entitlementInfo',`Plano ${plan.plan} · status ${plan.status}${plan.validUntil?' · validade '+new Date(plan.validUntil).toLocaleDateString('pt-BR'):''}. Sem cobrança ou restrição de salvamento nesta versão.`);}catch{/* Entitlement availability never blocks a save. */}}
 }
 async function writing(doc=null){
  $('adultRoot').hidden=true;$('editorRoot').hidden=false;
  await ALEditor.mount(store,doc);$('retrySync').hidden=!user;$('docTitle').focus();
 }
 async function activate(nextUser){
  screenEpoch++;user=nextUser;store=new ALOnline.OnlineStore({owner:user?.id||null,cloud:user?cloud:null,db});await store.open();panel('textsPanel');await listing();
 }
 $('enterAccount').onclick=()=>{panel('authPanel');say('backendNotice',cloud.enabled?'Conta exclusiva para o adulto responsável.':AL_CONFIG.unavailableReason);$('adultEmail').focus();};
 for(const id of ['loginButton','signupButton','adultEmail','adultPassword'])$(id).disabled=!cloud.enabled;
 $('backWelcome').onclick=()=>panel('welcomePanel');
 $('adultHome').onclick=event=>{event.preventDefault();if(store)run(adult);else panel('welcomePanel');};
 $('tryDemo').onclick=()=>run(async()=>{await activate(null);await writing();});
 $('authForm').onsubmit=event=>{event.preventDefault();run(async()=>{say('authMessage','Entrando…');let password=$('adultPassword').value;try{const next=await cloud.login($('adultEmail').value.trim(),password);say('authMessage','');await activate(next);}finally{password='';$('adultPassword').value='';}});};
 $('signupButton').onclick=()=>run(async()=>{
  if(!$('authForm').reportValidity())return;let password=$('adultPassword').value;try{const result=await cloud.signup($('adultEmail').value.trim(),password);say('authMessage',result.confirmationRequired?'Pedido de cadastro recebido. Confira seu e-mail e depois entre.':'Pedido de cadastro recebido. Use Entrar para acessar seus textos.');}finally{password='';$('adultPassword').value='';}
 });
 $('leaveAccount').onclick=()=>run(async()=>{
  if(!await ALEditor.persist())return;
  ALEditor.unmount();screenEpoch++;const wasAccount=!!user;store=null;user=null;$('adultTextList').replaceChildren();say('accountLabel','');say('entitlementInfo','');say('authMessage','');$('adultEmail').value='';$('adultPassword').value='';panel('welcomePanel');
  if(wasAccount&&!await cloud.logout()){
   panel('authPanel');say('authMessage','Sessão removida deste aplicativo. A revogação no servidor não foi confirmada por falha de rede. Feche a aba em computador compartilhado.');
  }
 });
 $('adultNewFree').onclick=()=>run(()=>writing(AL.fresh('free')));
 $('adultNewRecipe').onclick=()=>run(async()=>{await writing(AL.fresh('recipe'));await ALEditor.newDocument('recipe');});
 $('refreshTexts').onclick=()=>run(listing);
 $('retrySync').onclick=()=>run(()=>ALEditor.retry());
 document.addEventListener('al:library',()=>run(adult));
 window.addEventListener('online',()=>{if(store?.owner&&!busy){run(async()=>{if(!$('editorRoot').hidden)await ALEditor.retry();else await listing();});}});
 // Deliberate, adult-only rescue of legacy unowned documents. Export only; never auto-claim.
 $('loadLegacy').onclick=()=>run(async()=>{
  const legacy=new ALStore();const docs=await legacy.list();$('legacyList').replaceChildren();
  if(!docs.length){say('legacyList','Nenhuma produção anterior encontrada neste perfil.');return;}
  for(const doc of docs){const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=doc.title||'Texto sem título';button.textContent='Baixar cópia';button.className='secondary';button.onclick=()=>{try{const blob=new Blob([AL.exportFile(doc)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=AL.filename(doc.title)+'.apertaletra';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{label.textContent='Não foi possível exportar este texto. O original foi preservado.';}};row.append(label,button);$('legacyList').append(row);}
 });
 // Startup displays presentation before any editor or account data, including on reload.
 panel('welcomePanel');cloud.restore().then(next=>{if(next)return run(()=>activate(next));}).finally(()=>document.documentElement.dataset.portalReady='true');
})();

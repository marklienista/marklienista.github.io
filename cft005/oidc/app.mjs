import {assertConfig,makeClient,beginLogin,completeLogin,currentUser,signOutHere,refreshCurrentSession,authFailureMessage,sessionTag,probeInvalidRefresh} from './identity.mjs';
const status=document.getElementById('status');
const isCallback=location.pathname.endsWith('/callback.html');
const enter=document.getElementById('enter');
const check=document.getElementById('check');
const leave=document.getElementById('leave');
const refreshButton=document.getElementById('refresh');
const probeButton=document.getElementById('probe');
const audit=document.getElementById('audit');
let verifiedId=null, tag=null, verified=false, manualRefreshes=0, lastRefresh=null, invalidProbe=null;
function report(operation){
  if(audit) audit.textContent=JSON.stringify({operation,verified,identityTag:tag,manualRefreshes,lastRefresh,invalidProbe},null,2);
}
async function remember(user){
  if(user && verifiedId && user.id!==verifiedId) throw new Error('session_identity_changed');
  verified=Boolean(user);
  if(user){verifiedId=user.id;if(!tag) tag=await sessionTag(user.id);}
  else {verifiedId=null;tag=null;}
}
function message(text){status.textContent=text;}
async function run(){
  // Keep the one-use authorization code only in memory; clear the URL immediately.
  const callbackHref = isCallback ? (typeof globalThis.__cft005TakeCallback==='function' ? globalThis.__cft005TakeCallback() : location.href) : null;
  if (isCallback) history.replaceState(null, '', location.pathname);
  const response=await fetch('./config.json',{cache:'no-store'});
  if (!response.ok) {message('Aguardando configuração pública do provedor central. Nenhuma autenticação foi iniciada.');return;}
  const cfg=await response.json();
  const callbackUrl=new URL('./callback.html',location.href).href;
  const settings=assertConfig({...cfg,callbackUrl});
  if (!window.supabase?.createClient) throw new Error('sdk_unavailable');
  if(!isCallback&&typeof sessionStorage!=='undefined')sessionStorage.removeItem('cft005.oidc.negative-mode');
  if(isCallback&&sessionStorage.getItem('cft005.oidc.negative-mode')==='pkce-mismatch'){
    sessionStorage.removeItem('cft005.oidc.negative-mode');
    const {completeNegativeLogin}=await import('./negative.mjs');
    const result=await completeNegativeLogin(window.supabase,settings,callbackHref);
    message(result.result==='PASS'?'Retorno real com PKCE incorreto recusado pelo servidor.':'Ensaio de PKCE não aprovado.');
    const output=document.createElement('pre');output.setAttribute('aria-label','Resultados sanitizados');output.textContent=JSON.stringify(result,null,2);document.body.append(output);
    return;
  }
  const client=makeClient(window.supabase,settings);
  if(isCallback){
    await completeLogin(client,settings,callbackHref);
    location.replace('./index.html');
    return;
  }
  const refresh=async()=>{
    const user=await currentUser(client);
    await remember(user);
    message(user?'Sessão verificada no servidor.':'Ainda não há uma sessão nesta ferramenta.');
    leave.disabled=!user;
    if(refreshButton) refreshButton.disabled=!user;
    if(probeButton) probeButton.disabled=!user;
    report('SESSION_VERIFIED');
  };
  const sessionFailure=error=>{
    // A failed verification does not mean local credentials have been removed.
    // Keep cleanup available, including after a transient network failure.
    leave.disabled=false;
    if(refreshButton) refreshButton.disabled=true;
    if(probeButton) probeButton.disabled=true;
    verified=false;
    message(authFailureMessage(error));
    report('SESSION_CHECK_FAILED');
  };
  enter.disabled=check.disabled=false;
  enter.addEventListener('click',async()=>{
    enter.disabled=true;
    try {message('Abrindo autenticação central…');await beginLogin(client,settings);}
    catch {message('Falha ao iniciar a autenticação.');enter.disabled=false;}
  });
  if(refreshButton) refreshButton.addEventListener('click',async()=>{
    refreshButton.disabled=true;
    try{
      const priorId=verifiedId;
      lastRefresh=null;
      const user=await refreshCurrentSession(client,value=>{lastRefresh=value;});
      await remember(user);
      if(user){manualRefreshes++;lastRefresh.identityPreserved=Boolean(priorId && priorId===user.id);}
      leave.disabled=!user;
      refreshButton.disabled=!user;
      if(probeButton) probeButton.disabled=!user;
      message(user?'Sessão renovada e verificada no servidor.':'Sem sessão válida para renovar.');
      report('MANUAL_REFRESH');
    }catch(error){
      sessionFailure(error);
      // Keep manual-refresh disabled until 'Verificar sessão' succeeds.
    }
  });
  if(probeButton) probeButton.addEventListener('click',async()=>{
    probeButton.disabled=true;
    if(refreshButton) refreshButton.disabled=true;
    try{
      invalidProbe=await probeInvalidRefresh(window.supabase,settings,client,verifiedId);
      if(!invalidProbe.primarySessionUnchanged) throw new Error('session_identity_changed');
      message(invalidProbe.result==='PASS'?'Falha sintética de renovação recusada; sessão principal preservada.':'Teste de falha de renovação não conclusivo (E_PROBE).');
      report('INVALID_REFRESH_PROBE');
      probeButton.disabled=!verified;
      if(refreshButton) refreshButton.disabled=!verified;
    }catch(error){sessionFailure(error);}
  });
  check.addEventListener('click',async()=>{
    try {await refresh();}catch(error) {sessionFailure(error);}
  });
  leave.addEventListener('click',async()=>{
    try {await signOutHere(client);await refresh();}
    catch {message('Não foi possível encerrar a sessão local.');}
  });
  try {await refresh();}catch(error) {sessionFailure(error);}
}
run().catch(error => message(authFailureMessage(error)));

import {assertConfig,makeClient,beginLogin,completeLogin,currentUser,signOutHere,refreshCurrentSession,authFailureMessage} from './identity.mjs';
const status=document.getElementById('status');
const isCallback=location.pathname.endsWith('/callback.html');
const enter=document.getElementById('enter');
const check=document.getElementById('check');
const leave=document.getElementById('leave');
const refreshButton=document.getElementById('refresh');
function message(text){status.textContent=text;}
async function run(){
  // Keep the one-use authorization code only in memory; clear the URL immediately.
  const callbackHref = isCallback ? location.href : null;
  if (isCallback) history.replaceState(null, '', location.pathname);
  const response=await fetch('./config.json',{cache:'no-store'});
  if (!response.ok) {message('Aguardando configuração pública do provedor central. Nenhuma autenticação foi iniciada.');return;}
  const cfg=await response.json();
  const callbackUrl=new URL('./callback.html',location.href).href;
  const settings=assertConfig({...cfg,callbackUrl});
  if (!window.supabase?.createClient) throw new Error('sdk_unavailable');
  const client=makeClient(window.supabase,settings);
  if(isCallback){
    await completeLogin(client,settings,callbackHref);
    location.replace('./index.html');
    return;
  }
  const refresh=async()=>{
    const user=await currentUser(client);
    message(user?'Sessão verificada no servidor. Identificador: '+user.id:'Ainda não há uma sessão nesta ferramenta.');
    leave.disabled=!user;
    if(refreshButton) refreshButton.disabled=!user;
  };
  enter.disabled=check.disabled=false;
  enter.addEventListener('click',async()=>{
    enter.disabled=true;
    try {message('Abrindo autenticação central…');await beginLogin(client,settings);}
    catch {message('Falha ao iniciar a autenticação.');enter.disabled=false;}
  });
  if(refreshButton) refreshButton.addEventListener('click',async()=>{
    refreshButton.disabled=true;
    try{const user=await refreshCurrentSession(client);
      message(user?'Sessão renovada e verificada no servidor.':'Sem sessão válida para renovar.');
    }catch(error){message(authFailureMessage(error));}
    finally{refreshButton.disabled=false;}
  });
  check.addEventListener('click',async()=>{
    try {await refresh();}catch {message('Não foi possível verificar a sessão.');}
  });
  leave.addEventListener('click',async()=>{
    try {await signOutHere(client);await refresh();}
    catch {message('Não foi possível encerrar a sessão local.');}
  });
  await refresh();
}
run().catch(error => message(authFailureMessage(error)));

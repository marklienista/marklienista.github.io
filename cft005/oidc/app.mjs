import {assertConfig,makeClient,beginLogin,completeLogin,currentUser,signOutHere} from './identity.mjs';
const status=document.getElementById('status');
const isCallback=location.pathname.endsWith('/callback.html');
const enter=document.getElementById('enter');
const check=document.getElementById('check');
const leave=document.getElementById('leave');
function message(text){status.textContent=text;}
async function run(){
  const response=await fetch('./config.json',{cache:'no-store'});
  if (!response.ok) {message('Aguardando configuração pública do provedor central. Nenhuma autenticação foi iniciada.');return;}
  const cfg=await response.json();
  const callbackUrl=new URL('./callback.html',location.href).href;
  const settings=assertConfig({...cfg,callbackUrl});
  const client=makeClient(window.supabase,settings);
  if(isCallback){
    await completeLogin(client,settings,location.href);
    history.replaceState(null,'',location.pathname);
    location.replace('./index.html');
    return;
  }
  const refresh=async()=>{
    const user=await currentUser(client);
    message(user?'Sessão verificada no servidor. Identificador: '+user.id:'Ainda não há uma sessão nesta ferramenta.');
    leave.disabled=!user;
  };
  enter.disabled=check.disabled=false;
  enter.addEventListener('click',async()=>{
    enter.disabled=true;
    try {message('Abrindo autenticação central…');await beginLogin(client,settings);}
    catch {message('Falha ao iniciar a autenticação.');enter.disabled=false;}
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
run().catch(()=>message('Configuração inválida ou biblioteca de autenticação indisponível.'));

import {makeLifecycleProbe} from './lifecycle.mjs';
const status=document.getElementById('status'),audit=document.getElementById('audit');
const capture=document.getElementById('capture'),check=document.getElementById('check'),revoke=document.getElementById('revoke');
let probe,busy=false,timer;
function show(value){
  audit.textContent=JSON.stringify(value,null,2);
  status.textContent=value.phase==='WAITING_FOR_NATURAL_EXPIRY'?'Aguardando o vencimento real, sem renovar esta sessão.':value.phase==='EXPIRY_CHECKED'?'Vencimento verificado; recuperação registrada.':'Logout local e recusa do refresh emitido registrados.';
  capture.disabled=true;check.disabled=value.phase!=='WAITING_FOR_NATURAL_EXPIRY';revoke.disabled=value.expiry?.result!=='PASS'||Boolean(value.revocation);
  if(value.phase==='WAITING_FOR_NATURAL_EXPIRY'){
    clearTimeout(timer);timer=setTimeout(()=>act('checkExpiry'),Math.max(1000,Date.parse(value.checkAfter)-Date.now()));
  }
}
async function act(method){
  if(busy)return;busy=true;
  capture.disabled=check.disabled=revoke.disabled=true;
  try{show(await probe[method]());}
  catch{status.textContent='Ensaio não concluído (E_LIFECYCLE). Nenhum erro bruto foi exibido. Reentre pela página inicial se precisar recuperar a sessão.';}
  finally{busy=false;}
}
async function run(){
  const response=await fetch('./config.json',{cache:'no-store'});
  if(!response.ok)throw Error('config_missing');
  const cfg=await response.json();
  probe=makeLifecycleProbe(window.supabase,{...cfg,callbackUrl:new URL('./callback.html',location.href).href});
  capture.disabled=false;status.textContent='Pronto. Use somente a sessão sintética autorizada desta origem; feche outras abas desta mesma origem durante o ensaio.';
  capture.addEventListener('click',()=>act('capture'));check.addEventListener('click',()=>act('checkExpiry'));revoke.addEventListener('click',()=>act('revokeLocal'));
}
run().catch(()=>{status.textContent='Não foi possível preparar o ensaio (E_LIFECYCLE).';});

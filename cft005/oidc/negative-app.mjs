import {assertConfig} from './identity.mjs';
import {beginNegativeLogin,NEGATIVE_MODE_KEY} from './negative.mjs';
const status=document.getElementById('status'),button=document.getElementById('pkce'),abandon=document.getElementById('abandon');
async function run(){
  const r=await fetch('./config.json',{cache:'no-store'});if(!r.ok)throw Error('config_missing');
  const cfg=assertConfig({...await r.json(),callbackUrl:new URL('./callback.html',location.href).href});
  button.disabled=abandon.disabled=false;status.textContent='Pronto para testar a recusa PKCE ou interromper a entrada na tela do provedor.';
  const begin=async forceLogin=>{
    button.disabled=abandon.disabled=true;sessionStorage.setItem(NEGATIVE_MODE_KEY,'pkce-mismatch');
    try{await beginNegativeLogin(window.supabase,cfg,{forceLogin});}catch{sessionStorage.removeItem(NEGATIVE_MODE_KEY);status.textContent='Não foi possível iniciar o ensaio (E_NEGATIVE).';}
  };
  button.addEventListener('click',()=>begin(false));abandon.addEventListener('click',()=>begin(true));
}
run().catch(()=>{status.textContent='Não foi possível preparar o ensaio (E_NEGATIVE).';});

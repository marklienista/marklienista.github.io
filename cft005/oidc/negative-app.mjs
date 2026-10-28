import {assertConfig} from './identity.mjs';
import {beginNegativeLogin,NEGATIVE_MODE_KEY} from './negative.mjs';
const status=document.getElementById('status'),button=document.getElementById('pkce');
async function run(){
  const r=await fetch('./config.json',{cache:'no-store'});if(!r.ok)throw Error('config_missing');
  const cfg=assertConfig({...await r.json(),callbackUrl:new URL('./callback.html',location.href).href});
  button.disabled=false;status.textContent='Pronto para testar a recusa de um retorno real com verificador fictício incorreto.';
  button.addEventListener('click',async()=>{
    button.disabled=true;sessionStorage.setItem(NEGATIVE_MODE_KEY,'pkce-mismatch');
    try{await beginNegativeLogin(window.supabase,cfg);}catch{sessionStorage.removeItem(NEGATIVE_MODE_KEY);status.textContent='Não foi possível iniciar o ensaio (E_NEGATIVE).';}
  });
}
run().catch(()=>{status.textContent='Não foi possível preparar o ensaio (E_NEGATIVE).';});

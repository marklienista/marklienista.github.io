/* Picker necessário para autorização por arquivo no escopo drive.file do convidado. */
export async function pickManifest(accessToken,developerKey,projectNumber){
  if(!accessToken)throw Error('Conecte a sua conta Google antes.');
  if(!developerKey)throw Error('O seletor de arquivos compartilhados ainda não foi ativado para o Carômetro.');
  if(!/^\d+$/.test(String(projectNumber||'')))throw Error('Número do projeto Google Cloud não configurado.');
  if(!globalThis.gapi?.load)await new Promise((ok,fail)=>{
    const s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.onload=ok;s.onerror=()=>fail(Error('Picker indisponível.'));document.head.append(s);
  });
  await new Promise((ok,fail)=>gapi.load('picker',{callback:ok,onerror:()=>fail(Error('Picker indisponível.'))}));
  return new Promise((resolve,reject)=>{
    try{
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json');
      const picker=new google.picker.PickerBuilder().addView(view)
        .setOAuthToken(accessToken).setDeveloperKey(developerKey).setAppId(String(projectNumber))
        .setTitle('Selecione o arquivo carometro.json compartilhado com você')
        .setCallback(event=>{
          if(event.action===google.picker.Action.CANCEL)resolve(null);
          if(event.action===google.picker.Action.PICKED)resolve(event.docs?.[0]?.id||null);
        }).build();
      picker.setVisible(true);
    }catch(e){reject(e)}
  });
}

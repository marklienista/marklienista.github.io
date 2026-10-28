/* Seletor oficial Google Picker para autorizar somente o manifesto compartilhado.
   O identificador público da API é carregado da configuração central do app. */
let pickerPreparation;
async function loadPicker(){
  if(globalThis.google?.picker?.PickerBuilder)return;
  if(!pickerPreparation)pickerPreparation=(async()=>{
    if(!globalThis.gapi?.load){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://apis.google.com/js/api.js';
        script.async=true;
        script.onload=resolve;
        script.onerror=()=>reject(Error('Não foi possível carregar o seletor do Google Drive.'));
        document.head.append(script);
      });
    }
    await new Promise((resolve,reject)=>globalThis.gapi.load('picker',{
      callback:()=>globalThis.google?.picker?.PickerBuilder
        ?resolve()
        :reject(Error('O seletor do Google Drive não ficou disponível.')),
      onerror:()=>reject(Error('O Google Picker não respondeu.'))
    }));
  })().catch(error=>{pickerPreparation=null;throw error});
  return pickerPreparation;
}
export async function pickManifest(accessToken,developerKey,projectNumber,suggestedFileId=''){
  if(!accessToken)throw Error('Conecte sua conta Google antes de abrir arquivos compartilhados.');
  if(!/^AIza[\w-]{30,}$/.test(String(developerKey||'')))
    throw Error('A chave pública restrita do Google Picker não está configurada no FotoCrachá.');
  if(!/^\d+$/.test(String(projectNumber||'')))throw Error('Número do projeto Google Cloud não configurado.');
  await loadPicker();
  const id=String(suggestedFileId||'').trim();
  const exactFile=/^[A-Za-z0-9_-]{10,}$/.test(id)?id:'';
  return new Promise((resolve,reject)=>{
    try{
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/json')
        .setMode(google.picker.DocsViewMode.LIST);
      if(exactFile)view.setFileIds(exactFile);
      const picker=new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(developerKey)
        .setAppId(String(projectNumber))
        .setOrigin(location.origin)
        .setTitle('Escolha o cadastro carometro.json compartilhado com você')
        .setCallback(event=>{
          if(event.action===google.picker.Action.CANCEL)return resolve(null);
          if(event.action===google.picker.Action.PICKED){
            const doc=event.docs?.[0];
            if(!doc?.id)return reject(Error('Nenhum arquivo foi selecionado no Google Drive.'));
            if(doc.name&&doc.name!=='carometro.json')
              return reject(Error('Este não é o cadastro do FotoCrachá. Escolha carometro.json.'));
            return resolve(doc.id);
          }
        }).build();
      picker.setVisible(true);
    }catch(error){reject(error)}
  });
}

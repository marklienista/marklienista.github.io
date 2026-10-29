/* FotoCrachá 0.15 — navegação da ferramenta separada da edição.
   Não altera o modelo, o manifesto, a importação ou as regras do adaptador. */
import {DriveFiles} from './drive-files.js?v=0.13';
import {hasGroups,hasYears,classesFor,className,carometroTitle,ungroupedPeople,ALL,UNGROUPED} from './model.js?v=0.13';
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const validId=id=>/^[A-Za-z0-9_-]{10,}$/.test(String(id||''));
const folderLink=id=>{if(!validId(id))throw Error('Pasta inválida.');return 'https://drive.google.com/drive/folders/'+encodeURIComponent(id)};
function visit(url){const a=node('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click()}
export function mountNavigation({session:S,flush,openSpace,render,selectView,report,address}){
  let page='home',view='turmas',listRequest=0,shareRequest=0,share=null,shareBusy=false,settingsDraft=false,groupSignature='';
  const media=window.matchMedia('(max-width: 640px)');
  const groupTools=node('section','mobile-organization-tools');groupTools.id='mobileOrganizationTools';
  groupTools.append(node('h3','','Turmas e anos'));
  const toolButtons=node('div','inline');
  for(const [id,target,label] of [['configNewGroupBtn','newClassBtn','Nova turma ou grupo'],['configEditGroupBtn','renameClassBtn','Editar grupo selecionado'],['configPromoteBtn','promoteBtn','Passagem anual']]){
    const button=node('button','light',label);button.id=id;button.type='button';button.onclick=()=>$(target).click();toolButtons.append(button);
  }
  groupTools.append(toolButtons);$('view-configuracao').querySelector('.panel').append(groupTools);
  const selection=node('details','selection-options'),selectionSummary=node('summary','','Selecionar para imprimir');
  const selectionActions=document.querySelector('.selection-actions');selectionActions.before(selection);selection.append(selectionSummary,selectionActions);selection.open=!media.matches;
  selection.addEventListener('toggle',()=>{document.body.dataset.selecting=String(selection.open)});
  const safely=fn=>async()=>{try{return await fn()}catch(error){report(error.message||'Não foi possível concluir.','error');sync();return false}};
  function allowOpen(){
    if(settingsDraft&&!confirm('Há configurações ainda não aplicadas. Descartá-las para abrir outro carômetro ou trocar de conta?'))return false;
    return true;
  }
  function viewChanged(name){view=name;sync()}
  function enterEditor(reset=false){
    page='editor';if(reset){settingsDraft=false;view='turmas';groupSignature='';selectView('turmas')}
    sync();
  }
  function settingsOpened(){settingsDraft=false;sync()}
  function disconnected(){page='home';settingsDraft=false;listRequest++;clearShare();sync()}
  function sync(){
    const connected=S.isCloud(),editing=connected&&S.hasSpace()&&page==='editor';
    document.body.dataset.page=editing?'editor':'home';
    $('entryGate').hidden=editing;$('workspaceApp').hidden=!editing;
    $('entryDisconnected').hidden=connected;$('entryChoose').hidden=!connected;
    $('switchSpaceBtn').setAttribute('aria-current',editing?'false':'page');
    $('connectBtn').textContent=connected?'Google conectado':'Conectar Google';
    $('connectBtn').title=connected?'Conta conectada: '+S.drive.email:'Conectar uma conta Google Drive';
    $('connectBtn').setAttribute('aria-label',$('connectBtn').title);
    $('settingsBtn').hidden=!editing;
    $('resumeCarometro').hidden=!connected||!S.hasSpace();
    $('resumeTitle').textContent=S.hasSpace()?'Em uso: '+carometroTitle(S.space):'';
    const sheet=$('printSheet');if(sheet&&!editing)sheet.classList.remove('preview');
    if(!connected){listRequest++;if($('shareDialog').open)$('shareDialog').close();clearShare();return}
    $('entryAccount').textContent='Conta Google: '+S.drive.email;
    if(!editing)return;
    const editable=S.editable();
    for(const id of ['settingTitle','settingSchool','settingGroups','logoFile','settingsApplyBtn'])$(id).disabled=!editable;
    $('settingAnnual').disabled=!editable||!$('settingGroups').checked;
    $('settingsReadonly').hidden=editable;
    // Uma seleção compacta substitui a faixa longa de turmas somente no celular.
    const grouped=hasGroups(S.space),groups=classesFor(S.space,S.year),loose=ungroupedPeople(S.space);
    $('organizationPanel').dataset.annual=String(hasYears(S.space));
    $('mobileOrganizationTools').hidden=!grouped;
    $('configNewGroupBtn').disabled=!editable;
    $('configEditGroupBtn').disabled=!editable||!S.space.classes.some(c=>c.id===S.classId);
    $('configPromoteBtn').hidden=!hasYears(S.space);$('configPromoteBtn').disabled=$('promoteBtn').disabled;
    document.body.dataset.selecting=String(selection.open);
    $('mobileGroupWrap').hidden=!grouped;
    const options=[{id:ALL,label:'Todas as pessoas'},...groups.map(c=>({id:c.id,label:className(c)}))];
    if(loose.length)options.push({id:UNGROUPED,label:'Sem turma ou grupo'});
    const signature=JSON.stringify(options);
    if(groupSignature!==signature){
      const select=$('mobileGroupSelect');select.replaceChildren();
      for(const o of options){const option=node('option','',o.label);option.value=o.id;select.append(option)}
      groupSignature=signature;
    }
    $('mobileGroupSelect').value=S.classId;
    for(const bar of document.querySelectorAll('#studentsGrid .mini-actions')){
      if(bar.querySelector('.person-more'))continue;
      const buttons=[...bar.querySelectorAll(':scope > button')];
      if(!buttons.length)continue;
      const detail=node('details','person-more'),summary=node('summary','','Mais');
      const person=bar.closest('.student-card')?.querySelector('h3')?.textContent||'esta pessoa';
      summary.setAttribute('aria-label','Mais ações para '+person);
      const controls=node('div','person-more-controls');buttons.forEach(b=>controls.append(b));
      detail.append(summary,controls);detail.open=!media.matches;bar.append(detail);
    }
    // Não esconder erros de foto/salvamento para tornar o celular aparentemente mais simples.
    $('photoWarning').hidden=view!=='turmas'||!S.photoErrors.size||S.loadingPhotos;
  }
  async function home(){
    if(!await flush())return false;
    page='home';address();sync();
    if(S.isCloud())await listCarometros();
    return true;
  }
  async function account(){
    if(!await home())return;
    const target=S.isCloud()?$('changeAccountBtn'):$('entryConnectBtn');
    target.scrollIntoView({block:'center',behavior:media.matches?'auto':'smooth'});target.focus({preventScroll:true});
  }
  async function listCarometros(){
    if(!S.isCloud())return;
    const request=++listRequest,email=S.drive.email,root=$('spacesList');
    root.setAttribute('aria-busy','true');root.textContent='Localizando seus carômetros…';
    try{
      const files=await S.drive.spaces();
      if(request!==listRequest||!S.isCloud()||S.drive.email!==email)return;
      root.replaceChildren();
      if(!files.length){root.append(node('p','empty','Você ainda não tem carômetros. Crie um novo ou abra um link compartilhado.'));return}
      for(const file of files.slice(0,30)){
        const props=file.appProperties||{};
        let title=Object.hasOwn(props,'fcTitle')?(props.fcTitle||'Carômetro sem nome'):'';
        if(!title&&file.parents?.[0])try{title=(await S.drive.info(file.parents[0])).name?.replace(/^FotoCrachá\s*[—-]\s*/,'')||''}catch{}
        if(request!==listRequest||!S.isCloud()||S.drive.email!==email)return;
        title=title||'Carômetro sem nome';
        const card=node('article','carometro-card'),head=node('h3','',title),subtitle=node('p','sub');
        const date=file.modifiedTime?new Date(file.modifiedTime):null;
        subtitle.textContent=[props.fcInstitution||'',date&&!Number.isNaN(+date)?'Atualizado em '+date.toLocaleDateString('pt-BR'):'','ID '+file.id.slice(-6)].filter(Boolean).join(' · ');
        const actions=node('div','carometro-actions'),open=node('button','primary','Abrir'),shareButton=node('button','light','Compartilhar');
        open.type=shareButton.type='button';open.setAttribute('aria-label','Abrir '+title);shareButton.setAttribute('aria-label','Compartilhar '+title);
        open.onclick=safely(async()=>{open.disabled=true;try{return await openSpace(file.id)}finally{open.disabled=false}});
        shareButton.onclick=safely(()=>openShare(file.id,title));
        actions.append(open,shareButton);
        if(validId(file.parents?.[0])){const a=node('a','folder-shortcut','Pasta no Drive');a.href=folderLink(file.parents[0]);a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Pasta no Google Drive de '+title);actions.append(a)}
        card.append(head,subtitle,actions);root.append(card);
      }
      if(files.length>30)root.append(node('p','sub','Mostrando os 30 carômetros mais recentes. Use o link da pasta para abrir os demais.'));
    }catch(error){if(request===listRequest)root.textContent='Não foi possível listar os carômetros: '+error.message}
    finally{if(request===listRequest)root.removeAttribute('aria-busy')}
  }
  function clearShare(){
    shareRequest++;share?.drive.disconnect();share=null;shareBusy=false;
  }
  function sharingStatus(message,error=false){$('shareNotice').textContent=message;$('shareNotice').className=error?'alert error':'sub'}
  function sharingControls(){
    const ready=!!share&&S.isCloud()&&S.drive.email===share.email;
    for(const id of ['manageFolderBtn','copyFolderBtn','copyLinkBtn','refreshPermissionsBtn'])$(id).disabled=!ready||shareBusy;
    for(const id of ['inviteBtn','inviteEmail','inviteRole'])$(id).disabled=!ready||shareBusy||!share?.link.canShare;
  }
  function shareAccess(){
    if(!share||!S.isCloud()||S.drive.email!==share.email)throw Error('A conexão Google mudou. Feche e abra o compartilhamento novamente.');
    // Sessão transitória e independente: não altera o vínculo de gravação do carômetro em edição.
    Object.assign(share.drive,{token:S.drive.token,until:S.drive.until,email:S.drive.email,scopes:new Set(S.drive.scopes)});
    return share;
  }
  async function openShare(manifestId,title){
    if(!await flush())return false;
    clearShare();const request=shareRequest,email=S.drive.email;
    $('shareTitle').textContent='Compartilhar: '+title;$('inviteEmail').value='';$('inviteRole').value='reader';$('permissionsList').replaceChildren();
    sharingStatus('Conferindo a pasta e suas permissões…');sharingControls();$('shareDialog').showModal();
    const drive=new DriveFiles(S.config.clientId);
    try{
      Object.assign(drive,{token:S.drive.token,until:S.drive.until,email,scopes:new Set(S.drive.scopes)});
      const opened=await drive.open(manifestId);
      if(request!==shareRequest||!$('shareDialog').open||!S.isCloud()||S.drive.email!==email){drive.disconnect();return false}
      share={drive,link:opened.link,email,title};sharingControls();
      sharingStatus(opened.link.canShare?'Convide uma conta específica. O convite só é enviado depois da sua confirmação.':'Você pode consultar o link. Apenas quem tem permissão no Google pode gerenciar os convidados.');
      await loadPermissions();return true;
    }catch(error){drive.disconnect();if(request===shareRequest){sharingStatus(error.message,true);sharingControls()}return false}
  }
  async function loadPermissions(){
    const context=shareAccess(),request=shareRequest,root=$('permissionsList');root.textContent='Consultando acessos…';
    try{
      const permissions=await context.drive.permissions(context.link.folderId);
      if(request!==shareRequest)return;root.replaceChildren();
      if(permissions.some(p=>p.type==='anyone'||p.type==='domain'))root.append(node('p','alert warning','Esta pasta tem permissão pública ou para um domínio inteiro. Revise o acesso no Google Drive antes de usar dados pessoais.'));
      for(const permission of permissions.filter(p=>p.type==='user')){
        const row=node('div','permission'),label=node('span','',(permission.emailAddress||'Conta Google')+' · '+({owner:'Responsável',writer:'Editor',reader:'Leitor'}[permission.role]||permission.role));row.append(label);
        if(context.link.canShare&&permission.role!=='owner'){
          const remove=node('button','light','Retirar acesso');remove.type='button';
          remove.onclick=shareAction(async()=>{
            const current=shareAccess();
            if(!confirm('Retirar acesso de '+(permission.emailAddress||'essa conta')+' ao carômetro '+current.title+'?'))return;
            await current.drive.revoke(current.link.folderId,permission.id);await loadPermissions();
          });row.append(remove);
        }root.append(row);
      }
    }catch(error){if(request===shareRequest)root.textContent='Confira os acessos no Google Drive. '+error.message}
  }
  function shareAction(task){return async()=>{
    if(shareBusy)return;shareBusy=true;sharingControls();const request=shareRequest;
    try{await task()}catch(error){if(request===shareRequest)sharingStatus(error.message,true)}
    finally{if(request===shareRequest){shareBusy=false;sharingControls()}}
  }}
  async function copy(text){try{await navigator.clipboard.writeText(text);sharingStatus('Link copiado. A conta convidada também precisa ter acesso à pasta.')}catch{prompt('Copie o link:',text)}}
  $('inviteBtn').onclick=shareAction(async()=>{
    const context=shareAccess(),email=$('inviteEmail').value.trim(),role=$('inviteRole').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Informe um e-mail válido.');
    if(!confirm('Compartilhar '+context.title+' com '+email+' como '+(role==='writer'?'Editor':'Leitor')+'?'))return;
    await context.drive.share(context.link.folderId,email,role);sharingStatus('Convite enviado pelo Google. Copie o link de acesso para a pessoa.');await loadPermissions();
  });
  $('copyFolderBtn').onclick=shareAction(()=>copy(folderLink(shareAccess().link.folderId)));
  $('copyLinkBtn').onclick=shareAction(()=>{const context=shareAccess(),url=new URL(location.href);url.search='';url.searchParams.set('space',context.link.manifestId);return copy(url.href,'Link copiado. A pessoa entra com a conta que recebeu a pasta.')});
  $('manageFolderBtn').onclick=shareAction(()=>visit(folderLink(shareAccess().link.folderId)));
  $('refreshPermissionsBtn').onclick=shareAction(loadPermissions);
  $('shareDialog').addEventListener('close',clearShare);
  $('shareDialog').addEventListener('cancel',event=>{if(shareBusy){event.preventDefault();sharingStatus('Aguarde a confirmação da operação antes de fechar.')}});
  $('closeShareBtn').onclick=()=>{if(shareBusy){sharingStatus('Aguarde a confirmação da operação antes de fechar.');return}$('shareDialog').close()};
  $('resumeBtn').onclick=safely(()=>{if(!S.hasSpace())return;page='editor';if(S.link)address(S.link.manifestId);selectView(view);render()});
  $('settingsBackBtn').onclick=()=>selectView('turmas');
  $('settingsForm').addEventListener('input',()=>settingsDraft=true);
  $('settingsForm').addEventListener('change',()=>settingsDraft=true);
  $('mobileGroupSelect').onchange=()=>S.selectClass($('mobileGroupSelect').value);
  media.addEventListener('change',()=>{selection.open=!media.matches;for(const d of document.querySelectorAll('.person-more'))d.open=!media.matches;sync()});
  sync();
  return {render:sync,home,account,enterEditor,viewChanged,settingsOpened,allowOpen,disconnected,hasSettingsDraft:()=>settingsDraft};
}

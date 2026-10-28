import {Session} from './session.js?v=0.11';
import {prepareGoogleIdentity} from './drive.js?v=0.11';
import {addClass,renameClass,addStudent,editStudent,moveStudent,markStudentInactive,setPhoto,classStudents,studentClass,planPromotion,applyPromotion,mapPilotRows,comparePilot,applyPilot,parseDelimited,exportCsv,normalize} from './model.js?v=0.11';
import {readPilotFile} from './xlsx.js?v=0.11';
import {pickManifest} from './picker.js?v=0.11';
import {renderClassBar,renderStudentCards,renderPrintSheet,renderBadgeSheet,notify,presentModal,closeModal,fillSelect} from './view.js?v=0.11';
const $=id=>document.getElementById(id), S=new Session();
let pilot=[],promotionPlan=[];
const run=async fn=>{try{return await fn()}catch(e){console.error('FotoCrachá',e);notify(e?.message||'Não foi possível concluir.','error');render();return null}};
function classesForYear(){return S.space.classes.filter(c=>c.year===Number(S.year)&&!c.archived)}
function years(){
  const found=new Set(S.space.classes.map(c=>c.year));found.add(Number(S.year));
  return [...found].sort((a,b)=>b-a);
}
function currentClass(){return S.space.classes.find(c=>c.id===S.classId)||null}
function selectedCurrentStudents(){
  const current=new Set(S.space.enrollments.filter(e=>e.status==='active'&&S.space.classes.some(c=>c.id===e.classId&&c.year===Number(S.year))).map(e=>e.studentId));
  return S.space.students.filter(p=>S.selected.has(p.id)&&current.has(p.id));
}
function report(text,kind){notify(text,kind)}
// Informações temporárias de crachá não acompanham uma mudança de escola/conta.
function resetTemporaryPrint(){
  $('badgeExtra').value='';
  const sheet=document.getElementById('printSheet');
  sheet?.remove();
}
async function loadSpace(manifestId){
  const result=await S.load(manifestId);
  resetTemporaryPrint();
  return result;
}
let saveTimer=null,savePending=null,saveError=null,savePhase='idle',savedAt=null;
function saveStatus(){
  const node=$('saveStatus');
  if(!node)return;
  node.classList.toggle('save-error',savePhase==='error');
  node.classList.toggle('save-pending',savePhase==='pending'||savePhase==='saving');
  if(saveError){
    node.textContent='Não foi salvo no Google Drive: '+(saveError.message||'Erro desconhecido.');
  }else if(!S.editable()){
    node.textContent='Acesso somente leitura. Apenas quem tem permissão de edição pode salvar alterações.';
  }else if(savePhase==='saving'){
    node.textContent='Salvando alterações no Google Drive…';
  }else if(S.dirty||savePhase==='pending'){
    node.textContent='Alterações aguardando salvamento automático…';
  }else if(S.isLinked()){
    node.textContent='Tudo salvo no Google Drive'+(savedAt?' · '+savedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'.';
  }else{
    node.textContent='Preparando pasta no Google Drive…';
  }
  $('retrySaveBtn').hidden=!saveError||saveError.code==='CONFLICT';
  $('reloadRemoteBtn').hidden=!saveError||saveError.code!=='CONFLICT'||!S.isLinked();
}
function render(){
  const connected=S.isCloud(),hasSpace=S.hasSpace();
  const workspaceVisible=connected&&hasSpace;
  $('workspaceApp').hidden=!workspaceVisible;
  $('entryGate').hidden=workspaceVisible;
  $('entryDisconnected').hidden=connected;
  $('entryChoose').hidden=!connected;
  $('settingsBtn').hidden=!workspaceVisible||!S.editable();
  if(!connected){
    $('entryConnectBtn').textContent=hasSpace?'Reconectar ao Google Drive':'Conectar ao Google Drive';
    $('entryTitle').textContent=hasSpace?'Reconecte seu Google Drive para proteger as alterações':'Conecte seu Google Drive para começar';
  }
  if(connected&&!hasSpace){
    $('entryAccount').textContent=S.drive.email?'Conta conectada: '+S.drive.email:'Conta Google conectada';
    const pickerReady=!!S.config.pickerKey;
    $('entryPickerBtn').disabled=!pickerReady;
    $('pickerNotice').textContent=pickerReady
      ?'Para arquivos recebidos de outra pessoa, escolha carometro.json no seletor do Google. A pasta deve estar compartilhada com você.'
      :'A indicação de pasta funciona quando este aplicativo já tem acesso ao cadastro. Pastas compartilhadas por outra pessoa podem exigir o Google Picker, que ainda depende de uma chave pública.';
  }
  if(!workspaceVisible)return;
  $('spaceTitle').textContent=S.space.school.name||'Escola sem nome';
  $('modeText').textContent=(S.isLinked()?'Google Drive · '+(S.drive.email||'conta autorizada'):'Criando pasta no Google Drive…')+
    (S.link&&!S.link.canEdit?' · acesso para leitura':'');
  $('connectBtn').textContent=S.isCloud()?'Trocar conta Google':'Reconectar ao Google Drive';
  $('newSpaceBtn').disabled=!!savePending;
  $('openDriveFolderBtn').disabled=!S.link?.folderId;
  $('inviteBtn').disabled=!S.link?.canShare;
  $('pickerBtn').disabled=!S.config.pickerKey;
  saveStatus();
  fillSelect($('yearSelect'),years().map(y=>({value:y,label:String(y)})),S.year);
  if(!S.classId||!currentClass()||currentClass().year!==Number(S.year))S.classId=classesForYear()[0]?.id||null;
  renderClassBar(S.space,S.year,S.classId,id=>S.selectClass(id));
  const c=currentClass();
  $('currentClassTitle').textContent=c?.label||'Nenhuma turma neste ano';
  $('currentClassMeta').textContent=String(S.year)+' · TURMA';
  $('currentClassTeacher').textContent=c?.teacher?'Professor(a): '+c.teacher:'Professor(a) não informado(a) · use Editar turma';
  $('studentCount').textContent=c?classStudents(S.space,c.id).length+' estudantes · '+selectedCurrentStudents().length+' selecionados no ano':'Crie uma turma para começar.';
  $('renameClassBtn').disabled=!c||!S.editable();
  $('addStudentBtn').disabled=!c||!S.editable();
  $('promoteBtn').disabled=!classesForYear().length||!S.editable();
  $('newClassBtn').disabled=!S.editable();
  $('captureModeBtn').disabled=!c||!S.editable();
  if(c)renderStudentCards(S.space,c.id,S.photos,S.selected,$('searchStudents').value,$('onlyMissing').checked,{
    canEdit:S.editable(),
    onSelect:(id,checked)=>{if(checked)S.selected.add(id);else S.selected.delete(id);render()},
    onPhoto:(id,file)=>run(async()=>{await S.photo(id,file);report('Fotografia preparada. O FotoCrachá vai salvá-la automaticamente no Google Drive.','info')}),
    onEdit:openStudent,
    onRemovePhoto:id=>run(async()=>{if(!confirm('Remover a foto do carômetro? O arquivo anterior continuará no Drive até exclusão manual.'))return;S.removePhoto(id);report('Referência da foto retirada; nenhuma exclusão permanente foi realizada.','warning')}),
    onInactive:id=>run(async()=>{if(!confirm('Marcar o estudante como transferido nesta turma? O histórico será preservado.'))return;S.update(markStudentInactive(S.space,id,c.id));S.selected.delete(id)})
  });
  else{$('studentsGrid').replaceChildren();$('emptyStudents').hidden=false}
  $('studentCount').textContent=c?classStudents(S.space,c.id).length+' estudantes · '+selectedCurrentStudents().length+' selecionados no ano':'Crie uma turma para começar.';
}
/* Persistência automática: um escritor por vez nesta aba; nenhuma edição silenciosa após erro. */
function rememberSpaceLink(id){
  const url=new URL(location.href);
  url.searchParams.delete('folder');
  url.searchParams.set('space',id);
  history.replaceState(null,'',url.href);
}
function clearSpaceLink(){
  const url=new URL(location.href);
  url.searchParams.delete('space');url.searchParams.delete('folder');
  history.replaceState(null,'',url.href);
}
function queueAutosave(){
  if(!S.hasSpace()||!S.dirty||!S.isCloud()||!S.editable()||saveError)return;
  if(saveTimer)clearTimeout(saveTimer);
  savePhase='pending';
  saveStatus();
  saveTimer=setTimeout(()=>{saveTimer=null;void saveNow()},1200);
}
async function saveNow(){
  if(savePending)return savePending;
  if(!S.dirty)return true;
  if(saveError)return false;
  if(!S.isCloud()){
    saveError=Error('A sessão Google expirou. Reconecte para salvar as alterações.');
    savePhase='error';render();return false;
  }
  savePhase='saving';saveStatus();
  const work=(async()=>{
    try{
      const link=await S.save();
      if(!link?.manifestId)throw Error('O Google Drive não confirmou o arquivo do FotoCrachá.');
      savedAt=new Date();saveError=null;
      savePhase=S.dirty?'pending':'saved';
      rememberSpaceLink(link.manifestId);
      return true;
    }catch(error){
      if(error?.status===401){
        S.drive?.disconnect();
        const expired=Error('O Google encerrou a autorização de acesso. Reconecte a conta para concluir o salvamento.');
        expired.code='AUTH';saveError=expired;
      }else saveError=error;
      savePhase='error';
      report('Salvamento automático interrompido: '+(saveError.message||'Erro desconhecido.'),'error');
      render();
      return false;
    }finally{
      savePending=null;
      if(S.isCloud()&&S.hasSpace())saveStatus();
      if(S.dirty&&!saveError&&S.isCloud())queueAutosave();
    }
  })();
  savePending=work;
  return work;
}
async function flushEdits(){
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null}
  if(savePending)await savePending;
  if(S.dirty&&!saveError)await saveNow();
  if(S.dirty){
    report('Há alterações sem confirmação no Google Drive. Resolva o erro de salvamento antes de trocar de espaço ou conta.','warning');
    return false;
  }
  return true;
}
async function openSpace(id){
  if(!await flushEdits())return false;
  saveError=null;savePhase='idle';savedAt=null;
  const result=await loadSpace(id);
  savedAt=new Date();savePhase='saved';rememberSpaceLink(id);render();
  report(result.failed
    ?'Espaço aberto; '+result.failed+' imagens não puderam ser carregadas pelo Google Drive.'
    :'Espaço recuperado do Google Drive. Suas próximas alterações serão salvas automaticamente.',
    result.failed?'warning':'info');
  return true;
}
async function refreshSpaces(){
  if(!S.isCloud()||S.hasSpace())return;
  const root=$('spacesList');
  root.textContent='Procurando seus espaços no Google Drive…';
  try{
    const files=await S.drive.spaces();
    root.replaceChildren();
    if(!files.length){
      root.textContent='Nenhum espaço acessível foi encontrado. Crie um novo ou indique a pasta que já possui no Google Drive.';
      return;
    }
    const visible=files.slice(0,30);
    const decorated=await Promise.all(visible.map(async f=>{
      if(!f.parents?.[0])return {file:f,label:'Cadastro no Google Drive'};
      try{
        const folder=await S.drive.info(f.parents[0]);
        return {file:f,label:String(folder.name||'Cadastro no Google Drive')};
      }catch{return {file:f,label:'Cadastro no Google Drive'}}
    }));
    for(const item of decorated){
      const button=document.createElement('button');
      button.type='button';button.className='space-choice';
      const title=document.createElement('strong'),sub=document.createElement('small');
      title.textContent=item.label;
      const date=item.file.modifiedTime?new Date(item.file.modifiedTime).toLocaleDateString('pt-BR'):'sem data';
      sub.textContent='Alterado em '+date+' · abrir cadastro';
      button.append(title,sub);
      button.onclick=()=>run(async()=>openSpace(item.file.id));
      root.append(button);
    }
    if(files.length>visible.length){
      const info=document.createElement('p');info.className='sub';
      info.textContent='Outros espaços podem ser abertos pelo link da pasta ou do arquivo.';
      root.append(info);
    }
  }catch(error){
    root.textContent='Não foi possível listar os arquivos nesta conta: '+error.message+
      '. Você ainda pode indicar uma pasta, tentar o seletor do Google ou criar um espaço novo.';
  }
}
async function openProvidedFolder(){
  if(!S.isCloud())throw Error('Conecte sua conta Google.');
  const text=$('entryFolderLink').value.trim();
  if(!text)throw Error('Cole o link da pasta ou do arquivo no Google Drive.');
  const manifestId=await S.drive.openFromFolder(text);
  return openSpace(manifestId);
}
async function connectGoogle(){
  if(!S.config.clientId){presentModal('driveUnavailableDialog');return}
  const email=await S.connect();
  report('Google Drive conectado'+(email?' como '+email:'')+'.','info');
  if(S.hasSpace()){
    if(saveError?.code!=='CONFLICT')saveError=null;
    if(S.dirty)queueAutosave();
    render();return;
  }
  render();
  const params=new URL(location.href).searchParams;
  const fromLink=params.get('space');
  if(fromLink){
    try{if(await openSpace(fromLink))return}
    catch(error){report('O Google Drive não abriu o espaço do convite: '+error.message,'warning')}
  }
  const fromFolder=params.get('folder');
  if(fromFolder){
    try{const id=await S.drive.openFromFolder(fromFolder);if(await openSpace(id))return}
    catch(error){report('A pasta indicada não pôde ser aberta: '+error.message,'warning')}
  }
  await refreshSpaces();
}
async function disconnectGoogle(){
  if(!await flushEdits())return false;
  S.disconnect();resetTemporaryPrint();saveError=null;savePhase='idle';savedAt=null;clearSpaceLink();render();
  $('spacesList').replaceChildren();
  report('Conta Google desconectada deste navegador. Nenhum arquivo do Drive foi apagado.');
  return true;
}
async function switchSpace(){
  if(!await flushEdits())return false;
  S.resetToGate();resetTemporaryPrint();saveError=null;savePhase='idle';savedAt=null;clearSpaceLink();render();
  await refreshSpaces();
  return true;
}
function folderUrl(){
  if(!S.link?.folderId)throw Error('Este espaço ainda não tem pasta confirmada no Google Drive.');
  return 'https://drive.google.com/drive/folders/'+encodeURIComponent(S.link.folderId);
}
function showGoogleFolder(){
  // noopener evita dar à página externa acesso à janela do FotoCrachá.
  const url=folderUrl();
  const link=document.createElement('a');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  link.click();
}
async function clipboardFolder(){
  const url=folderUrl();
  try{await navigator.clipboard.writeText(url);report('Link da pasta copiado. A pessoa também precisa receber permissão de acesso no Google Drive.')}
  catch{prompt('Copie o endereço da pasta do Google Drive:',url)}
}
function openNewSpaceDialog(){
  $('newSpaceName').value='';
  presentModal('newSpaceDialog');
}

function bindNavigation(){
  document.querySelectorAll('.navtabs button').forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll('.navtabs button').forEach(b=>b.removeAttribute('aria-current'));
    btn.setAttribute('aria-current','page');
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+btn.dataset.view);
    if(btn.dataset.view==='impressao')previewPrint(false);
    if(btn.dataset.view==='partilha')run(loadPermissions);
  });
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>btn.closest('dialog').close());
  $('helpBtn').onclick=()=>presentModal('helpDialog');
  $('settingsBtn').onclick=()=>{
    $('settingSchool').value=S.space.school.name;
    presentModal('settingsDialog');
  };
}
function openClass(edit=false){
  if(edit&&!currentClass())return;
  $('classModalTitle').textContent=edit?'Editar turma':'Nova turma';
  $('className').value=edit?currentClass().label:'';
  $('classTeacher').value=edit?(currentClass().teacher||''):'';
  $('classYear').value=String(edit?currentClass().year:S.year);
  $('classYear').disabled=edit;
  $('classForm').dataset.mode=edit?'edit':'new';
  presentModal('classDialog');
}
function openStudent(id){
  const person=S.space.students.find(p=>p.id===id);
  $('studentId').value=id||'';
  $('studentModalTitle').textContent=person?'Editar estudante':'Novo estudante';
  $('studentName').value=person?.name||'';
  $('studentCode').value=person?.code||'';
  const cs=classesForYear();
  fillSelect($('studentClass'),cs.map(c=>({value:c.id,label:c.label})),person?studentClass(S.space,id,S.year)?.id||S.classId:S.classId);
  presentModal('studentDialog');
}
function initForms(){
  $('yearSelect').onchange=e=>S.chooseYear(Number(e.target.value));
  $('searchStudents').oninput=render;
  $('onlyMissing').onchange=render;
  $('newClassBtn').onclick=()=>openClass(false);
  $('captureModeBtn').onclick=()=>openCapture();
  $('renameClassBtn').onclick=()=>openClass(true);
  $('addStudentBtn').onclick=()=>openStudent(null);
  $('classForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const mode=$('classForm').dataset.mode;
    const changed=mode==='edit'?renameClass(S.space,S.classId,$('className').value,$('classTeacher').value):addClass(S.space,$('className').value,Number($('classYear').value),$('classTeacher').value);
    S.update(changed);
    if(mode!=='edit'){S.year=Number($('classYear').value);S.classId=changed.classes.at(-1)?.id}
    closeModal('classDialog');render();report('Turma atualizada.');
  });
  $('studentForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const id=$('studentId').value;
    const name=$('studentName').value,code=$('studentCode').value,cl=$('studentClass').value;
    if(!cl)throw Error('Selecione uma turma.');
    let next=id?editStudent(S.space,id,{name,code}):addStudent(S.space,{name,code,classId:cl});
    if(id)next=moveStudent(next,id,cl);
    S.update(next);closeModal('studentDialog');report(id?'Cadastro atualizado.':'Estudante incluído.');
  });
  $('selectAll').onclick=()=>{
    if(!S.classId)return;
    const all=classStudents(S.space,S.classId);const every=all.every(p=>S.selected.has(p.id));
    all.forEach(p=>every?S.selected.delete(p.id):S.selected.add(p.id));render();
  };
  $('newSpaceBtn').onclick=openNewSpaceDialog;
  $('entryNewBtn').onclick=openNewSpaceDialog;
  $('newSpaceForm').onsubmit=e=>run(async()=>{
    e.preventDefault();
    if(!await flushEdits())return;
    S.startSpace($('newSpaceName').value);
    resetTemporaryPrint();
    closeModal('newSpaceDialog');
    report('Espaço criado. As alterações serão salvas automaticamente no Google Drive.');
  });
  $('settingsForm').onsubmit=e=>run(async()=>{
    e.preventDefault();
    const name=$('settingSchool').value.trim();
    if(!name)throw Error('Informe o nome da escola.');
    const changed=structuredClone(S.space);changed.school.name=name;S.update(changed);
    if($('logoFile').files?.[0])await S.logo($('logoFile').files[0]);
    $('logoFile').value='';closeModal('settingsDialog');report('Configurações aplicadas. O salvamento acontece automaticamente.');
  });
}

let currentCaptureId=null;
function nextCapture(){
  const p=S.classId?classStudents(S.space,S.classId).find(p=>!p.photoId&&!S.photos.has(p.id)):null;
  currentCaptureId=p?.id||null;
  $('capturePrompt').textContent=p?'Próximo: '+p.name:'Não há estudantes sem fotografia nesta turma.';
  $('captureFile').disabled=!p;$('captureSkipBtn').disabled=!p;
}
function openCapture(){if(!S.classId)return;nextCapture();presentModal('captureDialog')}
function initCapture(){
  $('captureSkipBtn').onclick=()=>{
    const p=classStudents(S.space,S.classId).filter(p=>!p.photoId&&!S.photos.has(p.id));
    const index=p.findIndex(x=>x.id===currentCaptureId),nxt=p[(index+1)%p.length];
    if(nxt){currentCaptureId=nxt.id;$('capturePrompt').textContent='Próximo: '+nxt.name}
  };
  $('captureFile').onchange=()=>run(async()=>{
    const file=$('captureFile').files?.[0],id=currentCaptureId;if(!file||!id)return;
    await S.photo(id,file);$('captureFile').value='';nextCapture();
  });
}
function initPromotion(){
  $('promoteBtn').onclick=()=>run(async()=>{
    promotionPlan=planPromotion(S.space,Number(S.year),Number(S.year)+1);
    const root=$('promotionRows');root.replaceChildren();
    if(!promotionPlan.length)return report('Crie uma turma antes de fazer a passagem.','warning');
    promotionPlan.forEach((p,i)=>{
      const entry=document.createElement('div');entry.className='promotion-entry';
      const check=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.setAttribute('aria-label','Promover '+p.sourceLabel);check.onchange=()=>p.selected=check.checked;
      const from=document.createElement('span');from.textContent=p.sourceLabel+' · '+p.count+' estudantes';
      const to=document.createElement('input');to.type='text';to.value=p.targetLabel||'';to.setAttribute('aria-label','Turma de destino para '+p.sourceLabel);to.oninput=()=>p.targetLabel=to.value;
      entry.append(check,from,to);root.append(entry);
    });
    $('promotionModalTitle').textContent='Passagem de '+S.year+' para '+(Number(S.year)+1);
    presentModal('promotionDialog');
  });
  $('confirmPromotionBtn').onclick=()=>run(async()=>{
    const chosen=promotionPlan.filter(p=>p.selected);if(!chosen.length)throw Error('Selecione pelo menos uma turma.');
    if(chosen.some(p=>!p.targetLabel?.trim()))throw Error('Preencha os destinos selecionados.');
    if(!confirm('Criar as turmas do novo ano preservando os registros anteriores?'))return;
    const target=Number(S.year)+1;
    const result=applyPromotion(S.space,Number(S.year),target,promotionPlan);
    S.update(result.space);S.chooseYear(target);S.selected.clear();closeModal('promotionDialog');
    report('Passagem preparada: '+result.done.length+' turmas promovidas. Salvamento automático ativado.');
  });
}
async function loadPermissions(){
  const root=$('permissionsList');root.replaceChildren();
  if(!S.isCloud()||!S.link?.folderId)return;
  try{
    const all=await S.drive.permissions(S.link.folderId);
    const broad=all.filter(p=>p.type==='anyone'||p.type==='domain');
    if(broad.length){
      const warning=document.createElement('p');warning.className='alert warning';
      warning.textContent='Atenção: o Google Drive informa uma permissão ampla ('+
        broad.map(p=>p.type==='anyone'?'qualquer pessoa com o link':'domínio inteiro').join(', ')+
        '). Revise imediatamente o acesso à pasta no próprio Google Drive antes de usar imagens reais de estudantes.';
      root.append(warning);
    }
    const users=all.filter(p=>p.type==='user');
    if(!users.length){
      const none=document.createElement('p');none.className='sub';
      none.textContent='Nenhuma permissão individual apareceu nesta consulta. Gerencie o acesso diretamente pelo Google Drive.';
      root.append(none);
    }
    for(const p of users){
      const row=document.createElement('div');row.className='permission';
      const label=document.createElement('span');
      label.textContent=(p.emailAddress||'Conta Google')+' · '+
        (p.role==='writer'?'Pode editar':p.role==='owner'?'Responsável':'Pode visualizar');
      row.append(label);
      if(S.link.canShare&&p.role!=='owner'){
        const remove=document.createElement('button');
        remove.className='light';remove.textContent='Remover';remove.type='button';
        remove.onclick=()=>run(async()=>{
          if(!confirm('Retirar de '+(p.emailAddress||'esta pessoa')+' a permissão da pasta no Google Drive?'))return;
          await S.drive.revoke(S.link.folderId,p.id);
          await loadPermissions();
        });
        row.append(remove);
      }
      root.append(row);
    }
    if(!S.link.canShare){
      const note=document.createElement('p');note.className='sub';
      note.textContent='As permissões de compartilhamento são gerenciadas pelo responsável da pasta no Google Drive.';
      root.append(note);
    }
  }catch(error){root.textContent='Permissões indisponíveis: '+error.message+
    '. Abra a pasta no Google Drive para conferir os acessos.'}
}
function initSharing(){
  $('refreshPermissionsBtn').onclick=()=>run(loadPermissions);
  $('manageFolderBtn').onclick=()=>run(async()=>showGoogleFolder());
  $('openDriveFolderBtn').onclick=()=>run(async()=>showGoogleFolder());
  $('copyFolderBtn').onclick=()=>run(clipboardFolder);
  $('inviteBtn').onclick=()=>run(async()=>{
    if(!S.isCloud()||!S.link?.folderId||!S.link.canShare)throw Error('É necessário ser responsável por uma pasta do FotoCrachá no Google Drive.');
    const email=$('inviteEmail').value.trim();
    const role=$('inviteRole').value;
    if(!email)throw Error('Informe o e-mail do convidado.');
    if(!confirm('Convidar '+email+' como '+(role==='writer'?'Editor':'Leitor')+' da pasta no Google Drive?'))return;
    await S.drive.share(S.link.folderId,email,role);
    report('Permissão da pasta enviada pelo Google. A pessoa deve abrir a pasta com sua conta e pode precisar autorizar o arquivo pelo Google Picker.','info');
    await loadPermissions();
  });
  $('copyLinkBtn').onclick=()=>run(async()=>{
    if(!S.link?.manifestId)throw Error('O Google Drive ainda não confirmou o cadastro.');
    const url=new URL(location.href);url.search='';
    url.searchParams.set('space',S.link.manifestId);
    try{await navigator.clipboard.writeText(url.href);report('Link do FotoCrachá copiado. A pessoa ainda precisa receber acesso à pasta no Google Drive.')}
    catch{prompt('Copie o link do FotoCrachá:',url.href)}
  });
  $('pickerBtn').onclick=()=>run(async()=>{
    if(!S.isCloud())throw Error('Conecte ao Google Drive.');
    if(!S.config.pickerKey)throw Error('O Google Picker ainda não está ativado. Use uma pasta já autorizada ao aplicativo.');
    if(!await flushEdits())return;
    const id=await pickManifest(S.drive.token,S.config.pickerKey,S.config.projectNumber);
    if(id)await openSpace(id);
  });
  $('entryPickerBtn').onclick=()=>run(async()=>{
    if(!S.isCloud())throw Error('Conecte ao Google Drive.');
    if(!S.config.pickerKey)throw Error('O Google Picker ainda não foi ativado para este aplicativo.');
    const id=await pickManifest(S.drive.token,S.config.pickerKey,S.config.projectNumber);
    if(id)await openSpace(id);
  });
  $('refreshSpacesBtn').onclick=()=>run(refreshSpaces);
  $('openFolderBtn').onclick=()=>run(openProvidedFolder);
}
function updatePrintOptions(){
  const badges=$('printFormat').value==='badges';
  $('badgeOptions').hidden=!badges;
  $('carometroOptions').hidden=badges;
}
function initPrint(){
  $('printSelectedBtn').onclick=()=>{
    $('printSource').value='selected';
    previewPrint(true);
  };
  $('printFormat').onchange=()=>{updatePrintOptions();previewPrint(false)};
  $('printSource').onchange=()=>previewPrint(false);
  $('printColumns').onchange=()=>previewPrint(false);
  $('printCodes').onchange=()=>previewPrint(false);
  $('badgePhotoMode').onchange=()=>previewPrint(false);
  $('badgeExtra').onchange=()=>previewPrint(false);
  $('previewPrintBtn').onclick=()=>previewPrint(true);
  $('printBtn').onclick=()=>run(async()=>{
    if(!previewPrint(true))return;
    const images=[...document.querySelectorAll('#printSheet img')];
    await Promise.all(images.map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));
    window.print();
  });
  $('exportCsvBtn').onclick=()=>run(async()=>{
    if(!S.classId)throw Error('Escolha uma turma.');
    const content=exportCsv(S.space,S.classId);
    download(new Blob([content],{type:'text/csv;charset=utf-8'}),'fotocracha-lista-'+S.year+'.csv');
  });
  updatePrintOptions();
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function printPeople(){
  const classes=classesForYear();
  if($('printSource').value==='selected')return selectedCurrentStudents();
  if($('printSource').value==='class')return S.classId?classStudents(S.space,S.classId):[];
  const ids=new Set(classes.flatMap(c=>classStudents(S.space,c.id).map(p=>p.id)));
  return S.space.students.filter(p=>ids.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
function previewPrint(visible=true){
  const people=printPeople();
  if(!people.length){
    const sheet=document.getElementById('printSheet');
    if(sheet){sheet.replaceChildren();sheet.classList.remove('preview')}
    if(visible)report('Selecione estudantes da turma antes de preparar a impressão.','warning');
    return false;
  }
  if(visible){
    const tab=document.querySelector('[data-view=impressao]');
    if(tab.getAttribute('aria-current')!=='page')tab.click();
  }
  const badge=$('printFormat').value==='badges';
  const sheet=badge
    ? renderBadgeSheet(S.space,people,S.photos,S.logoUrl,S.year,{
        withPhoto:$('badgePhotoMode').value==='photo',
        extra:$('badgeExtra').value
      })
    : renderPrintSheet(S.space,people,S.photos,S.logoUrl,Number($('printColumns').value),$('printCodes').checked,S.year);
  if(visible){
    sheet.classList.add('preview');
    sheet.scrollIntoView({block:'start',behavior:'smooth'});
  }
  return true;
}
function makeTag(kind){
  const t=document.createElement('span');t.className='tag'+(['review'].includes(kind)?' review':['same'].includes(kind)?'':' warn');
  t.textContent={new:'Novo',move:'Mudar turma',rename:'Corrigir nome',same:'Sem alteração',review:'Conferir'}[kind]||kind;
  return t;
}
function showPilot(){
  $('pilotResults').hidden=false;
  $('pilotSummary').textContent=pilot.filter(x=>x.kind!=='same').length+' registros para revisar · '+pilot.filter(x=>x.selected).length+' selecionados';
  const body=$('pilotBody');body.replaceChildren();
  pilot.forEach((p,i)=>{
    if(p.kind==='same')return;
    const tr=document.createElement('tr');
    const cell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.disabled=p.kind==='review';check.setAttribute('aria-label','Aplicar alteração de '+p.name);
    check.onchange=()=>{p.selected=check.checked;$('pilotSummary').textContent=pilot.filter(x=>x.selected).length+' alterações selecionadas'};
    cell.append(check);tr.append(cell);
    for(const txt of [p.name+(p.code?' ('+p.code+')':''),p.classLabel||'Turma não encontrada']){
      const td=document.createElement('td');td.textContent=txt;tr.append(td);
    }
    const td=document.createElement('td');td.append(makeTag(p.kind));if(p.reason){const small=document.createElement('small');small.textContent=' '+p.reason;td.append(small)}tr.append(td);body.append(tr);
  });
}
function initPilot(){
  $('analyzePilotBtn').onclick=()=>run(async()=>{
    if(!S.classId)throw Error('Escolha uma turma e um ano.');
    const file=$('pilotFile').files?.[0];if(!file)throw Error('Escolha a lista piloto.');
    const data=await readPilotFile(file);
    const rows=data.rows||parseDelimited(data.csv);
    const mapped=mapPilotRows(rows,currentClass()?.label);
    pilot=comparePilot(S.space,mapped,S.year,S.classId);
    showPilot();
    report('Lista analisada somente neste navegador; revise as alterações. Nenhuma mudança aplicada automaticamente.');
  });
  $('applyPilotBtn').onclick=()=>run(async()=>{
    if(!S.editable())throw Error('Seu acesso é somente leitura.');
    const count=pilot.filter(i=>i.selected).length;
    if(!count)throw Error('Nenhuma alteração marcada.');
    if(!confirm('Aplicar '+count+' alterações selecionadas ao carômetro?'))return;
    const result=applyPilot(S.space,pilot);S.update(result.space);pilot=[];$('pilotResults').hidden=true;$('pilotFile').value='';
    report(result.applied+' alterações aplicadas. O FotoCrachá vai gravá-las no Google Drive.');
  });
}
function initGoogle(){
  $('entryConnectBtn').onclick=()=>run(connectGoogle);
  $('connectBtn').onclick=()=>run(async()=>S.isCloud()?disconnectGoogle():connectGoogle());
  $('changeAccountBtn').onclick=()=>run(disconnectGoogle);
  $('switchSpaceBtn').onclick=()=>run(switchSpace);
  $('retrySaveBtn').onclick=()=>run(async()=>{
    if(!saveError||saveError.code==='CONFLICT')return;
    saveError=null;savePhase='pending';
    if(await saveNow())report('Alterações confirmadas no Google Drive.','info');
  });
  $('reloadRemoteBtn').onclick=()=>run(async()=>{
    if(!S.link?.manifestId)throw Error('O cadastro no Google Drive não está associado a esta página.');
    if(!confirm('Descartar alterações não salvas nesta página e reabrir a versão atual do Google Drive? Essa ação não apaga o arquivo remoto.'))return;
    const id=S.link.manifestId;
    if(saveTimer){clearTimeout(saveTimer);saveTimer=null}
    if(savePending)await savePending;
    S.resetToGate();saveError=null;savePhase='idle';savedAt=null;
    await openSpace(id);
  });
}
window.addEventListener('beforeunload',e=>{
  if((S.hasSpace()&&S.dirty)||savePending){e.preventDefault();e.returnValue=''}
});
function start(){
  // O Client ID é definido para todo o aplicativo, não por parâmetros de convite.
  const address=new URL(location.href);
  if(address.searchParams.has('client')){
    address.searchParams.delete('client');
    history.replaceState(null,'',address.href);
  }
  S.onUpdate=()=>{render();queueAutosave()};
  window.addEventListener('focus',()=>{if(S.hasSpace()&&!S.isCloud())render()});
  bindNavigation();initForms();initCapture();initPromotion();initPilot();initPrint();initSharing();initGoogle();
  render();
  if(S.config.clientId){
    // Só carregamos o SDK se a integração estiver ativada nesta instalação.
    // A autorização propriamente dita acontece apenas após o clique do usuário.
    prepareGoogleIdentity().catch(()=>{});
  }
  if(new URL(location.href).searchParams.has('space')){
    report('Você recebeu o link de um espaço. Conecte-se à conta Google autorizada para abri-lo.','warning');
  }
}
start();

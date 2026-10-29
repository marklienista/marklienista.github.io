import {Session} from './session.js?v=0.12';
import {prepareGoogleIdentity} from './drive.js?v=0.12';
import {addClass,renameClass,addStudent,editStudent,moveStudent,markStudentInactive,classStudents,studentClass,planPromotion,applyPromotion,mapPilotRows,comparePilot,applyPilot,parseDelimited,exportCsv} from './model.js?v=0.11';
import {readPilotFile} from './xlsx.js?v=0.11';
import {renderClassBar,renderStudentCards,renderPrintSheet,renderBadgeSheet,notify,presentModal,closeModal,fillSelect} from './view.js?v=0.12';
const $=id=>document.getElementById(id),S=new Session();
let timer=null,saving=null,saveError=null,savedAt=null,pilot=[],promotion=[],captureId=null;
const report=(text,kind='info')=>notify(text,kind);
const run=async task=>{try{return await task()}catch(error){report(error.message||'Não foi possível concluir.','error');render();return null}};
const currentClass=()=>S.space.classes.find(c=>c.id===S.classId)||null;
const classes=()=>S.space.classes.filter(c=>c.year===Number(S.year)&&!c.archived);
const on=(id,fn)=>{$(id).onclick=()=>run(fn)};
function selectedPeople(){
  const active=new Set(classes().flatMap(c=>classStudents(S.space,c.id).map(p=>p.id)));
  return S.space.students.filter(p=>active.has(p.id)&&S.selected.has(p.id));
}
function resetPrint(){ $('badgeExtra').value='';$('printSheet')?.remove() }
function address(id=null){
  const url=new URL(location.href);url.searchParams.delete('folder');
  if(id)url.searchParams.set('space',id);else url.searchParams.delete('space');
  history.replaceState(null,'',url.href);
}
function renderSave(){
  const node=$('saveStatus');node.classList.toggle('save-error',!!saveError);
  if(saveError)node.textContent='Não foi salvo: '+saveError.message;
  else if(saving)node.textContent='Salvando alterações no Google Drive…';
  else if(S.dirty)node.textContent='Alterações aguardando salvamento automático…';
  else if(S.link&&!S.link.canEdit)node.textContent='Acesso somente leitura · alterações não permitidas pelo Google Drive.';
  else node.textContent='Tudo salvo no Google Drive'+(savedAt?' · '+savedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'.';
  $('retrySaveBtn').hidden=!saveError||saveError.code==='CONFLICT';
  $('reauthorizeBtn').hidden=!saveError||saveError.code==='CONFLICT';
  $('reloadRemoteBtn').hidden=!saveError||saveError.code!=='CONFLICT'||!S.link;
}
function render(){
  const cloud=S.isCloud(),active=cloud&&S.hasSpace();
  $('entryGate').hidden=active;$('workspaceApp').hidden=!active;
  $('entryDisconnected').hidden=cloud;$('entryChoose').hidden=!cloud;
  $('settingsBtn').hidden=!active||!S.editable();
  $('entryConnectBtn').textContent=S.hasSpace()?'Reconectar a mesma conta Google':'Conectar ao Google Drive';
  $('entryAccount').textContent=cloud?'Conta conectada: '+S.drive.email:'';
  if(!active)return;
  $('spaceTitle').textContent=S.space.school.name;
  $('modeText').textContent='Conta: '+S.drive.email+' · '+(S.link?.canEdit===false?'Leitor':'Editor')+' · arquivos na pasta deste espaço';
  $('newSpaceBtn').disabled=!!saving;$('openDriveFolderBtn').disabled=!S.link?.folderId;
  $('inviteBtn').disabled=!S.link?.canShare;renderSave();
  const years=[...new Set([...S.space.classes.map(c=>c.year),S.year])].sort((a,b)=>b-a);
  fillSelect($('yearSelect'),years.map(y=>({value:y,label:String(y)})),S.year);
  if(!currentClass()||currentClass().year!==Number(S.year))S.classId=classes()[0]?.id||null;
  const c=currentClass();renderClassBar(S.space,S.year,S.classId,id=>S.selectClass(id));
  $('currentClassTitle').textContent=c?.label||'Nenhuma turma neste ano';$('currentClassMeta').textContent=S.year+' · TURMA';
  $('currentClassTeacher').textContent=c?.teacher?'Professor(a): '+c.teacher:'Professor(a) não informado(a)';
  $('studentCount').textContent=c?classStudents(S.space,c.id).length+' estudantes · '+selectedPeople().length+' selecionados':'Crie uma turma para começar.';
  for(const id of ['renameClassBtn','addStudentBtn','captureModeBtn'])$(id).disabled=!c||!S.editable();
  $('newClassBtn').disabled=!S.editable();$('promoteBtn').disabled=!classes().length||!S.editable();
  const photoCount=S.photoErrors.size;
  $('photoWarning').hidden=!photoCount||S.loadingPhotos;
  $('photoWarningText').textContent=photoCount+' imagem(ns) não carregada(s). Confira a conexão e o acesso à pasta. Não é necessário autorizar cada fotografia.';
  $('retryPhotosBtn').disabled=S.loadingPhotos;
  if(c)renderStudentCards(S.space,c.id,S.photos,S.selected,$('searchStudents').value,$('onlyMissing').checked,{
    canEdit:S.editable(),photoErrors:S.photoErrors,loadingPhotos:S.loadingPhotos,
    onSelect:(id,checked)=>{checked?S.selected.add(id):S.selected.delete(id);render()},
    onPhoto:(id,file)=>run(async()=>{await S.photo(id,file);report('Fotografia preparada; salvamento automático em andamento.')}),
    onEdit:openStudent,
    onRemovePhoto:id=>run(async()=>{if(confirm('Retirar a fotografia do cadastro? O arquivo anterior não será apagado do Drive.'))S.removePhoto(id)}),
    onInactive:id=>run(async()=>{if(confirm('Registrar a transferência deste estudante, preservando o histórico?')){S.update(markStudentInactive(S.space,id,c.id));S.selected.delete(id)}})
  });
  else{$('studentsGrid').replaceChildren();$('emptyStudents').hidden=false}
}
function scheduleSave(){
  if(!S.dirty||!S.editable()||saveError||saving)return;
  if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void saveNow()},1200);renderSave();
}
async function saveNow(){
  if(saving)return saving;
  if(!S.dirty)return true;if(saveError)return false;
  if(!S.isCloud()){saveError=Error('Reconecte a mesma conta Google para salvar.');render();return false}
  const work=(async()=>{
    try{const link=await S.save();if(!link?.manifestId)throw Error('O Google não confirmou o cadastro.');savedAt=new Date();address(link.manifestId);return true}
    catch(error){saveError=error;if(error.status===401)S.drive?.disconnect();report('Salvamento interrompido: '+error.message,'error');return false}
    finally{saving=null;render();if(S.dirty&&!saveError)scheduleSave()}
  })();saving=work;renderSave();return work;
}
async function flush(){
  if(timer){clearTimeout(timer);timer=null}if(saving)await saving;
  if(S.dirty&&!saveError)await saveNow();
  if(S.dirty){report('Há alterações sem confirmação. Resolva o salvamento antes de mudar de espaço ou conta.','warning');return false}return true;
}
async function openSpace(id){
  if(!await flush())return false;
  saveError=null;savedAt=null;
  const result=await S.load(id);resetPrint();address(id);savedAt=new Date();render();
  report(result.failed?'Cadastro aberto. '+result.failed+' imagem(ns) não carregada(s); consulte o aviso acima das turmas.':'Espaço aberto com seus cadastros e fotografias. As alterações são salvas automaticamente.',result.failed?'warning':'info');return true;
}
async function listSpaces(){
  if(!S.isCloud()||S.hasSpace())return;
  const root=$('spacesList');root.textContent='Localizando cadastros FotoCrachá…';
  try{
    const files=await S.drive.spaces();root.replaceChildren();
    if(!files.length){root.textContent='Nenhum espaço encontrado. Cole o link de uma pasta compartilhada ou crie um espaço vazio.';return}
    for(const file of files.slice(0,30)){
      let label='Cadastro FotoCrachá';
      if(file.parents?.[0])try{label=(await S.drive.info(file.parents[0])).name||label}catch{}
      const button=document.createElement('button');button.type='button';button.className='space-choice';
      const title=document.createElement('strong'),subtitle=document.createElement('small');title.textContent=label;
      subtitle.textContent='Abrir espaço'+(file.modifiedTime?' · '+new Date(file.modifiedTime).toLocaleDateString('pt-BR'):'');
      button.append(title,subtitle);button.onclick=()=>run(()=>openSpace(file.id));root.append(button);
    }
  }catch(error){root.textContent='Não foi possível listar os espaços: '+error.message}
}
async function connectGoogle(){
  const email=await S.connect();report('Conectado como '+email+'.');render();
  if(S.hasSpace()){
    if(saveError?.code!=='CONFLICT')saveError=null;
    const photos=await S.loadPhotos();render();if(S.dirty)scheduleSave();
    if(photos.failed)report('Ainda existem imagens não carregadas. Confira o acesso à pasta.','warning');return;
  }
  const params=new URL(location.href).searchParams;
  try{
    if(params.get('space')){await openSpace(params.get('space'));return}
    if(params.get('folder')){await openSpace(await S.drive.openFromFolder(params.get('folder')));return}
  }catch(error){report('Não foi possível abrir o convite nesta conta. '+error.message,'warning')}
  await listSpaces();
}
async function disconnectGoogle(){
  if(!await flush())return;
  S.disconnect();resetPrint();saveError=null;savedAt=null;address();$('spacesList').replaceChildren();render();
  report('Desconectado. Nenhum arquivo foi apagado do Google Drive.');
}
async function switchSpace(){if(!await flush())return;S.resetToGate();resetPrint();saveError=null;savedAt=null;address();render();await listSpaces()}
function newSpace(){ $('newSpaceName').value='';presentModal('newSpaceDialog') }
function folderURL(){if(!S.link?.folderId)throw Error('Aguarde a confirmação da pasta no Google Drive.');return 'https://drive.google.com/drive/folders/'+encodeURIComponent(S.link.folderId)}
function visitFolder(){const a=document.createElement('a');a.href=folderURL();a.target='_blank';a.rel='noopener noreferrer';a.click()}
async function copy(text,message){try{await navigator.clipboard.writeText(text);report(message)}catch{prompt('Copie o link:',text)}}
function selectView(name){
  document.querySelectorAll('.navtabs button').forEach(b=>{if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+name);
  if(name==='impressao')previewPrint(false);else $('printSheet')?.classList.remove('preview');
  if(name==='partilha')void loadPermissions();
}
function openClass(edit=false){
  const c=currentClass();if(edit&&!c)return;
  $('classModalTitle').textContent=edit?'Editar turma':'Nova turma';$('className').value=edit?c.label:'';
  $('classTeacher').value=edit?(c.teacher||''):'';$('classYear').value=String(edit?c.year:S.year);$('classYear').disabled=edit;
  $('classForm').dataset.mode=edit?'edit':'new';presentModal('classDialog');
}
function openStudent(id=null){
  const p=S.space.students.find(p=>p.id===id);$('studentId').value=id||'';
  $('studentModalTitle').textContent=p?'Editar estudante':'Novo estudante';$('studentName').value=p?.name||'';$('studentCode').value=p?.code||'';
  fillSelect($('studentClass'),classes().map(c=>({value:c.id,label:c.label})),p?studentClass(S.space,p.id,S.year)?.id||S.classId:S.classId);
  presentModal('studentDialog');
}
function initForms(){
  $('yearSelect').onchange=e=>S.chooseYear(e.target.value);$('searchStudents').oninput=render;$('onlyMissing').onchange=render;
  on('newClassBtn',()=>openClass());on('renameClassBtn',()=>openClass(true));on('addStudentBtn',()=>openStudent());
  $('classForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const edit=$('classForm').dataset.mode==='edit',year=Number($('classYear').value);
    const next=edit?renameClass(S.space,S.classId,$('className').value,$('classTeacher').value):addClass(S.space,$('className').value,year,$('classTeacher').value);
    S.update(next);if(!edit){S.year=year;S.classId=next.classes.at(-1).id}closeModal('classDialog');render();
  });
  $('studentForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const id=$('studentId').value,name=$('studentName').value,code=$('studentCode').value,classId=$('studentClass').value;
    if(!classId)throw Error('Escolha uma turma.');
    let next=id?editStudent(S.space,id,{name,code}):addStudent(S.space,{name,code,classId});if(id)next=moveStudent(next,id,classId);
    S.update(next);closeModal('studentDialog');
  });
  on('selectAll',()=>{if(!S.classId)return;const people=classStudents(S.space,S.classId),all=people.every(p=>S.selected.has(p.id));people.forEach(p=>all?S.selected.delete(p.id):S.selected.add(p.id));render()});
  on('newSpaceBtn',newSpace);on('entryNewBtn',newSpace);
  $('newSpaceForm').onsubmit=e=>run(async()=>{e.preventDefault();if(!await flush())return;S.startSpace($('newSpaceName').value);resetPrint();closeModal('newSpaceDialog');report('Espaço vazio criado; o salvamento é automático.')});
  on('settingsBtn',()=>{$('settingSchool').value=S.space.school.name;presentModal('settingsDialog')});
  $('settingsForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const name=$('settingSchool').value.trim();if(!name)throw Error('Informe a escola.');
    const next=structuredClone(S.space);next.school.name=name;S.update(next);
    if($('logoFile').files?.[0])await S.logo($('logoFile').files[0]);$('logoFile').value='';closeModal('settingsDialog');
  });
}
function nextCapture(){
  const next=S.classId?classStudents(S.space,S.classId).find(p=>!p.photoId&&!S.photos.has(p.id)):null;
  captureId=next?.id||null;$('capturePrompt').textContent=next?'Próximo: '+next.name:'Não há estudantes sem fotografia nesta turma.';
  $('captureFile').disabled=!next;$('captureSkipBtn').disabled=!next;
}
function initCapture(){
  on('captureModeBtn',()=>{nextCapture();presentModal('captureDialog')});
  on('captureSkipBtn',()=>{const pending=classStudents(S.space,S.classId).filter(p=>!p.photoId&&!S.photos.has(p.id));const next=pending[(pending.findIndex(p=>p.id===captureId)+1)%pending.length];if(next){captureId=next.id;$('capturePrompt').textContent='Próximo: '+next.name}});
  $('captureFile').onchange=()=>run(async()=>{const file=$('captureFile').files?.[0],id=captureId;if(!file||!id)return;await S.photo(id,file);$('captureFile').value='';nextCapture()});
}
function initPromotion(){
  on('promoteBtn',()=>{
    promotion=planPromotion(S.space,S.year,Number(S.year)+1);$('promotionRows').replaceChildren();
    for(const p of promotion){const row=document.createElement('div');row.className='promotion-entry';const check=document.createElement('input'),label=document.createElement('span'),input=document.createElement('input');
      check.type='checkbox';check.checked=p.selected;check.setAttribute('aria-label','Promover '+p.sourceLabel);check.onchange=()=>p.selected=check.checked;
      label.textContent=p.sourceLabel+' · '+p.count+' estudantes';input.type='text';input.value=p.targetLabel||'';input.setAttribute('aria-label','Destino de '+p.sourceLabel);input.oninput=()=>p.targetLabel=input.value;
      row.append(check,label,input);$('promotionRows').append(row);
    }
    $('promotionModalTitle').textContent='Passagem de '+S.year+' para '+(Number(S.year)+1);presentModal('promotionDialog');
  });
  on('confirmPromotionBtn',()=>{
    const chosen=promotion.filter(p=>p.selected);if(!chosen.length||chosen.some(p=>!p.targetLabel?.trim()))throw Error('Selecione turmas e informe seus destinos.');
    if(!confirm('Criar as turmas do novo ano, sem apagar o histórico?'))return;
    const year=Number(S.year)+1,result=applyPromotion(S.space,Number(S.year),year,promotion);S.update(result.space);S.chooseYear(year);S.selected.clear();closeModal('promotionDialog');
  });
}
function showPilot(){
  $('pilotResults').hidden=false;$('pilotSummary').textContent=pilot.filter(p=>p.selected).length+' alterações selecionadas';$('pilotBody').replaceChildren();
  for(const p of pilot){if(p.kind==='same')continue;const row=document.createElement('tr'),choice=document.createElement('td'),check=document.createElement('input');
    check.type='checkbox';check.checked=p.selected;check.disabled=p.kind==='review';check.setAttribute('aria-label','Aplicar mudança de '+p.name);check.onchange=()=>{p.selected=check.checked;$('pilotSummary').textContent=pilot.filter(x=>x.selected).length+' alterações selecionadas'};choice.append(check);row.append(choice);
    const status={new:'Novo',move:'Mudar turma',rename:'Corrigir nome',review:'Conferir'}[p.kind]||p.kind;
    for(const text of [p.name+(p.code?' ('+p.code+')':''),p.classLabel,status+(p.reason?' — '+p.reason:'')]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}$('pilotBody').append(row);
  }
}
function initPilot(){
  on('analyzePilotBtn',async()=>{if(!S.classId)throw Error('Escolha uma turma.');const file=$('pilotFile').files?.[0];if(!file)throw Error('Selecione uma planilha XLSX ou CSV.');const data=await readPilotFile(file);const rows=data.rows||parseDelimited(data.csv);pilot=comparePilot(S.space,mapPilotRows(rows,currentClass().label),S.year,S.classId);showPilot();report('Confira as alterações antes de aplicar. Nenhum estudante ausente será apagado.')});
  on('applyPilotBtn',()=>{if(!S.editable())throw Error('Acesso somente leitura.');const n=pilot.filter(p=>p.selected).length;if(!n)throw Error('Selecione alterações.');if(!confirm('Aplicar '+n+' alterações?'))return;const result=applyPilot(S.space,pilot);S.update(result.space);pilot=[];$('pilotResults').hidden=true;$('pilotFile').value='';report('Alterações aplicadas; salvamento automático em andamento.')});
}
function printPeople(){
  if($('printSource').value==='selected')return selectedPeople();
  if($('printSource').value==='class')return S.classId?classStudents(S.space,S.classId):[];
  const ids=new Set(classes().flatMap(c=>classStudents(S.space,c.id).map(p=>p.id)));return S.space.students.filter(p=>ids.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
function printOptions(){const badges=$('printFormat').value==='badges';$('badgeOptions').hidden=!badges;$('carometroOptions').hidden=badges}
function previewPrint(scroll=true){
  const people=printPeople();if(!people.length){$('printSheet')?.remove();if(scroll)report('Selecione estudantes antes de imprimir.','warning');return false}
  const sheet=$('printFormat').value==='badges'?renderBadgeSheet(S.space,people,S.photos,S.logoUrl,S.year,{withPhoto:$('badgePhotoMode').value==='photo',extra:$('badgeExtra').value}):renderPrintSheet(S.space,people,S.photos,S.logoUrl,Number($('printColumns').value),$('printCodes').checked,S.year);
  sheet.classList.add('preview');if(scroll)sheet.scrollIntoView({block:'start',behavior:'smooth'});return true;
}
function initPrint(){
  on('printSelectedBtn',()=>{$('printSource').value='selected';selectView('impressao');previewPrint()});
  for(const id of ['printFormat','printSource','printColumns','printCodes','badgePhotoMode','badgeExtra'])$(id).onchange=()=>{printOptions();previewPrint(false)};
  on('previewPrintBtn',()=>previewPrint());
  on('printBtn',async()=>{if(!previewPrint())return;const missing=printPeople().filter(p=>p.photoId&&!S.photos.has(p.id)).length;
    if(missing&&!confirm(missing+' fotografia(s) não carregada(s). Imprimir mesmo assim?'))return;
    await Promise.all([...document.querySelectorAll('#printSheet img')].map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));window.print();
  });
  on('exportCsvBtn',()=>{if(!S.classId)throw Error('Escolha uma turma.');const url=URL.createObjectURL(new Blob([exportCsv(S.space,S.classId)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='fotocracha-lista-'+S.year+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)});printOptions();
}
async function loadPermissions(){
  const root=$('permissionsList');root.replaceChildren();if(!S.link?.folderId||!S.isCloud())return;
  try{const all=await S.drive.permissions(S.link.folderId);
    if(all.some(p=>p.type==='anyone'||p.type==='domain')){const warning=document.createElement('p');warning.className='alert warning';warning.textContent='Há uma permissão pública ou de domínio inteiro. Revise os acessos no Google Drive antes de usar fotografias reais.';root.append(warning)}
    for(const p of all.filter(p=>p.type==='user')){const row=document.createElement('div');row.className='permission';const text=document.createElement('span');text.textContent=(p.emailAddress||'Conta Google')+' · '+({owner:'Responsável',writer:'Editor',reader:'Leitor'}[p.role]||p.role);row.append(text);
      if(S.link.canShare&&p.role!=='owner'){const button=document.createElement('button');button.type='button';button.className='light';button.textContent='Retirar acesso';button.onclick=()=>run(async()=>{if(confirm('Retirar acesso de '+(p.emailAddress||'essa conta')+'?')){await S.drive.revoke(S.link.folderId,p.id);await loadPermissions()}});row.append(button)}root.append(row);
    }
  }catch(error){root.textContent='Confira os acessos no próprio Google Drive. '+error.message}
}
function initSharing(){
  on('manageFolderBtn',visitFolder);on('openDriveFolderBtn',visitFolder);on('copyFolderBtn',()=>copy(folderURL(),'Link da pasta copiado; compartilhe apenas com pessoas autorizadas.'));
  on('refreshPermissionsBtn',loadPermissions);
  on('inviteBtn',async()=>{if(!S.link?.canShare)throw Error('A conta não pode gerenciar esta pasta.');const email=$('inviteEmail').value.trim(),role=$('inviteRole').value;
    if(!email)throw Error('Informe o e-mail.');if(!confirm('Compartilhar a pasta com '+email+' como '+(role==='writer'?'Editor':'Leitor')+'?'))return;
    await S.drive.share(S.link.folderId,email,role);report('Pasta compartilhada pelo Google. Envie o link de acesso à pessoa convidada.');await loadPermissions();
  });
  on('copyLinkBtn',()=>{if(!S.link?.manifestId)throw Error('Aguarde a confirmação do salvamento.');const url=new URL(location.href);url.search='';url.searchParams.set('space',S.link.manifestId);return copy(url.href,'Link de acesso copiado. A pessoa entra com a conta que recebeu a pasta.')});
}
function initGoogle(){
  on('entryConnectBtn',connectGoogle);on('connectBtn',disconnectGoogle);on('changeAccountBtn',disconnectGoogle);on('switchSpaceBtn',switchSpace);on('refreshSpacesBtn',listSpaces);
  on('openFolderBtn',async()=>{if(!S.isCloud())throw Error('Conecte ao Google Drive.');await openSpace(await S.drive.openFromFolder($('entryFolderLink').value.trim()))});
  on('retrySaveBtn',async()=>{if(saveError?.code==='CONFLICT')return;saveError=null;if(await saveNow())report('Alterações confirmadas no Google Drive.')});
  on('reauthorizeBtn',async()=>{if(saving)await saving;S.drive?.disconnect();await connectGoogle()});
  on('reloadRemoteBtn',async()=>{if(!S.link)return;if(!confirm('Descartar mudanças não salvas desta aba e reabrir o cadastro do Google Drive?'))return;const id=S.link.manifestId;if(timer)clearTimeout(timer);timer=null;if(saving)await saving;S.resetToGate();saveError=null;await openSpace(id)});
  on('retryPhotosBtn',async()=>{const result=await S.loadPhotos();report(result.failed?'Ainda há imagens não carregadas. Confira a conta, a pasta e a conexão.':'Fotografias carregadas.',result.failed?'warning':'info')});
}
function start(){
  const url=new URL(location.href);if(url.searchParams.has('client')){url.searchParams.delete('client');history.replaceState(null,'',url.href)}
  S.onUpdate=()=>{render();scheduleSave()};
  document.querySelectorAll('.navtabs button').forEach(b=>b.onclick=()=>selectView(b.dataset.view));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  on('helpBtn',()=>presentModal('helpDialog'));
  initForms();initCapture();initPromotion();initPilot();initPrint();initSharing();initGoogle();render();
  if(S.config.clientId)prepareGoogleIdentity().catch(()=>{});
  window.addEventListener('beforeunload',e=>{if(S.dirty||saving){e.preventDefault();e.returnValue=''}});
  window.addEventListener('focus',()=>{if(S.hasSpace()&&!S.isCloud())render()});
}
start();

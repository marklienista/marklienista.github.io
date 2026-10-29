import {Session} from './session.js?v=0.13';
import {prepareGoogleIdentity} from './drive.js?v=0.12';
import {addClass,renameClass,addStudent,editStudent,moveStudent,markStudentInactive,classStudents,studentClass,planPromotion,applyPromotion,mapPilotRows,comparePilot,applyPilot,parseDelimited,exportCsv,configureSpace,hasGroups,hasYears,peopleFor,classesFor,carometroTitle,personName,className,optionalYear,ALL,UNGROUPED} from './model.js?v=0.13';
import {readPilotFile} from './xlsx.js?v=0.11';
import {renderClassBar,renderStudentCards,renderPrintSheet,renderBadgeSheet,notify,presentModal,closeModal,fillSelect} from './view.js?v=0.13';
const $=id=>document.getElementById(id),S=new Session();
let timer=null,saving=null,saveError=null,savedAt=null,pilot=[],promotion=[],captureId=null;
const report=(text,kind='info')=>notify(text,kind);
const run=async task=>{try{return await task()}catch(error){report(error.message||'Não foi possível concluir.','error');render();return null}};
const currentClass=()=>S.space.classes.find(c=>c.id===S.classId)||null;
const classes=()=>classesFor(S.space,S.year);
const currentPeople=()=>peopleFor(S.space,S.classId,S.year);
const on=(id,fn)=>{$(id).onclick=()=>run(fn)};
function selectedPeople(){const active=new Set(peopleFor(S.space,ALL,S.year).map(p=>p.id));return S.space.students.filter(p=>active.has(p.id)&&S.selected.has(p.id))}
function resetPrint(){$('badgeExtra').value='';$('printSheet')?.remove()}
function address(id=null){const url=new URL(location.href);url.searchParams.delete('folder');if(id)url.searchParams.set('space',id);else url.searchParams.delete('space');history.replaceState(null,'',url.href)}
function renderSave(){
  const node=$('saveStatus');node.classList.toggle('save-error',!!saveError);
  if(saveError)node.textContent='Não foi salvo: '+saveError.message;
  else if(saving)node.textContent='Salvando alterações no Google Drive…';else if(S.dirty)node.textContent='Alterações aguardando salvamento automático…';
  else if(S.link&&!S.link.canEdit)node.textContent='Acesso somente leitura · alterações não permitidas pelo Google Drive.';
  else node.textContent='Tudo salvo no Google Drive'+(savedAt?' · '+savedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'.';
  $('retrySaveBtn').hidden=!saveError||saveError.code==='CONFLICT';$('reauthorizeBtn').hidden=!saveError||saveError.code==='CONFLICT';$('reloadRemoteBtn').hidden=!saveError||saveError.code!=='CONFLICT'||!S.link;
}
function render(){
  const cloud=S.isCloud(),active=cloud&&S.hasSpace();$('entryGate').hidden=active;$('workspaceApp').hidden=!active;$('entryDisconnected').hidden=cloud;$('entryChoose').hidden=!cloud;
  $('settingsBtn').hidden=!active||!S.editable();$('entryConnectBtn').textContent=S.hasSpace()?'Reconectar a mesma conta Google':'Conectar ao Google Drive';$('entryAccount').textContent=cloud?'Conta conectada: '+S.drive.email:'';
  if(!active)return;
  const grouped=hasGroups(S.space),annual=hasYears(S.space);
  if(!grouped)S.classId=ALL;else if(![ALL,UNGROUPED].includes(S.classId)&&!classes().some(c=>c.id===S.classId))S.classId=ALL;
  $('spaceTitle').textContent=carometroTitle(S.space);$('institutionLine').textContent=S.space.school.name||'';$('institutionLine').hidden=!S.space.school.name;
  $('modeText').textContent='Conta: '+S.drive.email+' · '+(S.link?.canEdit===false?'Leitor':'Editor');$('newSpaceBtn').disabled=!!saving;$('openDriveFolderBtn').disabled=!S.link?.folderId;$('inviteBtn').disabled=!S.link?.canShare;renderSave();
  $('organizationPanel').hidden=!grouped;$('yearControls').hidden=!annual;$('promoteBtn').hidden=!annual;
  if(annual){const years=[...new Set(S.space.classes.map(c=>c.year).filter(Number.isInteger))];if(Number.isInteger(S.year)&&!years.includes(S.year))years.push(S.year);years.sort((a,b)=>b-a);fillSelect($('yearSelect'),[{value:'',label:'Sem ano definido'},...years.map(y=>({value:y,label:String(y)}))],S.year??'')}
  renderClassBar(S.space,S.year,S.classId,id=>S.selectClass(id));
  const c=currentClass();$('currentClassTitle').textContent=grouped&&c?className(c):S.classId===UNGROUPED?'Pessoas sem turma ou grupo':'Pessoas do carômetro';
  $('currentClassMeta').textContent=annual&&S.year!==null?String(S.year)+' · '+(c?'TURMA OU GRUPO':'PESSOAS'):'PESSOAS';
  $('currentClassTeacher').textContent=grouped&&c?.teacher?'Professor(a) / responsável: '+c.teacher:'';$('currentClassTeacher').hidden=!$('currentClassTeacher').textContent;
  $('studentCount').textContent=currentPeople().length+' pessoas · '+selectedPeople().length+' selecionadas';
  $('renameClassBtn').hidden=!grouped||!c;$('renameClassBtn').disabled=!c||!S.editable();$('addStudentBtn').disabled=!S.editable();$('captureModeBtn').disabled=!currentPeople().length||!S.editable();
  $('newClassBtn').disabled=!S.editable();$('promoteBtn').disabled=!classes().length||S.year===null||!S.editable();$('organizeBtn').hidden=grouped||!S.editable();
  $('photoWarning').hidden=!S.photoErrors.size||S.loadingPhotos;$('photoWarningText').textContent=S.photoErrors.size+' imagem(ns) não carregada(s). Confira a conexão e o acesso à pasta.';$('retryPhotosBtn').disabled=S.loadingPhotos;
  renderStudentCards(S.space,S.classId,S.photos,S.selected,$('searchStudents').value,$('onlyMissing').checked,{
    canEdit:S.editable(),photoErrors:S.photoErrors,loadingPhotos:S.loadingPhotos,year:S.year,
    onSelect:(id,checked)=>{checked?S.selected.add(id):S.selected.delete(id);render()},
    onPhoto:(id,file)=>run(async()=>{await S.photo(id,file);report('Fotografia preparada; salvamento automático em andamento.')}),onEdit:openStudent,
    onRemovePhoto:id=>run(async()=>{if(confirm('Retirar a fotografia do cadastro? O arquivo anterior não será apagado do Drive.'))S.removePhoto(id)}),
    onInactive:id=>run(async()=>{if(c&&confirm('Encerrar o vínculo com este grupo, preservando o histórico?')){S.update(markStudentInactive(S.space,id,c.id));S.selected.delete(id)}})
  });
  $('printAllOption').textContent=annual?'Todas as pessoas do período':'Todas as pessoas do carômetro';
}
function scheduleSave(){if(!S.dirty||!S.editable()||saveError||saving)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void saveNow()},1200);renderSave()}
async function saveNow(){
  if(saving)return saving;if(!S.dirty)return true;if(saveError)return false;if(!S.isCloud()){saveError=Error('Reconecte a mesma conta Google para salvar.');render();return false}
  const work=(async()=>{try{const link=await S.save();if(!link?.manifestId)throw Error('O Google não confirmou o cadastro.');savedAt=new Date();address(link.manifestId);return true}
    catch(error){saveError=error;if(error.status===401)S.drive?.disconnect();report('Salvamento interrompido: '+error.message,'error');return false}
    finally{saving=null;render();if(S.dirty&&!saveError)scheduleSave()}})();saving=work;renderSave();return work;
}
async function flush(){if(timer){clearTimeout(timer);timer=null}if(saving)await saving;if(S.dirty&&!saveError)await saveNow();if(S.dirty){report('Há alterações sem confirmação. Resolva o salvamento antes de mudar de carômetro ou conta.','warning');return false}return true}
async function openSpace(id){if(!await flush())return false;saveError=null;savedAt=null;const result=await S.load(id);resetPrint();address(id);savedAt=new Date();render();report(result.failed?'Carômetro aberto. '+result.failed+' imagem(ns) não carregada(s); consulte o aviso.':'Carômetro aberto. As alterações são salvas automaticamente.',result.failed?'warning':'info');return true}
async function listSpaces(autoOpen=false){
  if(!S.isCloud()||S.hasSpace())return;const root=$('spacesList');root.textContent='Localizando seus carômetros…';
  try{const files=await S.drive.spaces();root.replaceChildren();if(!files.length){root.textContent='Nenhum carômetro encontrado. Crie um novo ou abra o link de um carômetro compartilhado.';return}
    if(autoOpen&&files.length===1){try{await openSpace(files[0].id);return}catch(error){report('O carômetro não pôde ser aberto: '+error.message,'warning')}}
    for(const file of files.slice(0,30)){
      const props=file.appProperties||{};let title=Object.hasOwn(props,'fcTitle')?(props.fcTitle||'Carômetro sem nome'):'';
      if(!title&&file.parents?.[0])try{title=(await S.drive.info(file.parents[0])).name?.replace(/^FotoCrachá\s*[—-]\s*/,'')||''}catch{}
      title=title||'Carômetro sem nome';const button=document.createElement('button');button.type='button';button.className='space-choice';const heading=document.createElement('strong'),sub=document.createElement('small');heading.textContent=title;
      const details=[props.fcInstitution||'',file.modifiedTime?'Atualizado em '+new Date(file.modifiedTime).toLocaleDateString('pt-BR'):'','ID '+file.id.slice(-6)];sub.textContent=details.filter(Boolean).join(' · ');button.append(heading,sub);button.onclick=()=>run(()=>openSpace(file.id));root.append(button);
    }
    if(files.length>30){const more=document.createElement('p');more.className='sub';more.textContent='Mostrando os 30 carômetros mais recentes. Outros podem ser abertos pelo link da pasta.';root.append(more)}
  }catch(error){root.textContent='Não foi possível listar os carômetros: '+error.message}
}
async function connectGoogle(){
  const email=await S.connect();report('Conectado como '+email+'.');render();if(S.hasSpace()){if(saveError?.code!=='CONFLICT')saveError=null;const photos=await S.loadPhotos();render();if(S.dirty)scheduleSave();if(photos.failed)report('Ainda existem imagens não carregadas. Confira o acesso à pasta.','warning');return}
  const params=new URL(location.href).searchParams;try{if(params.get('space')){await openSpace(params.get('space'));return}if(params.get('folder')){await openSpace(await S.drive.openFromFolder(params.get('folder')));return}}catch(error){report('Não foi possível abrir o convite nesta conta. '+error.message,'warning')}
  await listSpaces(true);
}
async function disconnectGoogle(){if(!await flush())return;S.disconnect();resetPrint();saveError=null;savedAt=null;address();$('spacesList').replaceChildren();render();report('Desconectado. Nenhum arquivo foi apagado do Google Drive.')}
async function switchSpace(){if(!await flush())return;S.resetToGate();resetPrint();saveError=null;savedAt=null;address();render();await listSpaces(false)}
function toggleYearChoice(prefix){const grouped=$(prefix+'Groups').checked;$(prefix+'AnnualWrap').hidden=!grouped;$(prefix+'Annual').disabled=!grouped}
function newSpace(){$('newSpaceName').value='';$('newInstitution').value='';$('newGroups').checked=false;$('newAnnual').checked=false;toggleYearChoice('new');presentModal('newSpaceDialog')}
function openSettings(){$('settingTitle').value=S.space.title||'';$('settingSchool').value=S.space.school.name||'';$('settingGroups').checked=hasGroups(S.space);$('settingAnnual').checked=hasYears(S.space);toggleYearChoice('setting');presentModal('settingsDialog')}
function folderURL(){if(!S.link?.folderId)throw Error('Aguarde a confirmação da pasta no Google Drive.');return 'https://drive.google.com/drive/folders/'+encodeURIComponent(S.link.folderId)}
function visitFolder(){const a=document.createElement('a');a.href=folderURL();a.target='_blank';a.rel='noopener noreferrer';a.click()}
async function copy(text,message){try{await navigator.clipboard.writeText(text);report(message)}catch{prompt('Copie o link:',text)}}
function selectView(name){document.querySelectorAll('.navtabs button').forEach(b=>{if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+name);if(name==='impressao')previewPrint(false);else $('printSheet')?.classList.remove('preview');if(name==='partilha')void loadPermissions()}
function openClass(edit=false){
  const c=currentClass();if(edit&&!c)return;$('classModalTitle').textContent=edit?'Editar turma ou grupo':'Nova turma ou grupo';$('className').value=edit?c.label:'';$('classTeacher').value=edit?(c.teacher||''):'';
  $('classYear').value=edit?(c.year??''):(S.year??'');$('classYearWrap').hidden=!hasYears(S.space);$('classForm').dataset.mode=edit?'edit':'new';presentModal('classDialog');
}
function openStudent(id=null){
  const p=S.space.students.find(p=>p.id===id);$('studentId').value=id||'';$('studentModalTitle').textContent=p?'Editar pessoa':'Adicionar pessoa';$('studentName').value=p?.name||'';$('studentCode').value=p?.code||'';
  const grouped=hasGroups(S.space);$('studentGroupWrap').hidden=!grouped;
  const assigned=p?studentClass(S.space,p.id,hasYears(S.space)?S.year:undefined)?.id:null;
  fillSelect($('studentClass'),[{value:'',label:'Sem turma ou grupo'},...classes().map(c=>({value:c.id,label:className(c)}))],p?assigned||'':currentClass()?.id||'');presentModal('studentDialog');
}
function initForms(){
  $('yearSelect').onchange=e=>S.chooseYear(e.target.value);$('searchStudents').oninput=render;$('onlyMissing').onchange=render;
  on('newClassBtn',()=>openClass());on('renameClassBtn',()=>openClass(true));on('addStudentBtn',()=>openStudent());
  $('classForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const edit=$('classForm').dataset.mode==='edit',year=hasYears(S.space)?optionalYear($('classYear').value):(edit?currentClass()?.year??null:null);
    const next=edit?renameClass(S.space,S.classId,$('className').value,$('classTeacher').value,year):addClass(S.space,$('className').value,year,$('classTeacher').value);
    if(!edit){S.classId=next.classes.at(-1).id;if(hasYears(next))S.year=year}S.update(next);closeModal('classDialog');render();
  });
  $('studentForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const id=$('studentId').value,name=$('studentName').value,code=$('studentCode').value,grouped=hasGroups(S.space),classId=grouped?$('studentClass').value||null:null;
    let next=id?editStudent(S.space,id,{name,code}):addStudent(S.space,{name,code,classId});if(id&&grouped)next=moveStudent(next,id,classId,hasYears(S.space)?S.year:undefined);S.update(next);closeModal('studentDialog');
  });
  on('selectAll',()=>{const people=currentPeople(),all=people.every(p=>S.selected.has(p.id));people.forEach(p=>all?S.selected.delete(p.id):S.selected.add(p.id));render()});on('newSpaceBtn',newSpace);on('entryNewBtn',newSpace);
  $('newGroups').onchange=()=>toggleYearChoice('new');$('settingGroups').onchange=()=>toggleYearChoice('setting');
  $('newSpaceForm').onsubmit=e=>run(async()=>{e.preventDefault();if(!await flush())return;S.startSpace({title:$('newSpaceName').value,institution:$('newInstitution').value,groupsEnabled:$('newGroups').checked,annualEnabled:$('newGroups').checked&&$('newAnnual').checked});resetPrint();closeModal('newSpaceDialog');report('Carômetro criado. Você pode começar adicionando pessoas; os demais campos são opcionais.')});
  on('settingsBtn',openSettings);on('organizeBtn',openSettings);
  $('settingsForm').onsubmit=e=>run(async()=>{
    e.preventDefault();const next=configureSpace(S.space,{title:$('settingTitle').value,institution:$('settingSchool').value,groupsEnabled:$('settingGroups').checked,annualEnabled:$('settingGroups').checked&&$('settingAnnual').checked});
    if(!hasGroups(next))S.classId=ALL;if(!hasYears(next))S.year=null;else if(S.year===null){const years=next.classes.map(c=>c.year).filter(Number.isInteger);S.year=years.length?Math.max(...years):null}
    S.update(next);if($('logoFile').files?.[0])await S.logo($('logoFile').files[0]);$('logoFile').value='';resetPrint();closeModal('settingsDialog');
  });
}
function nextCapture(){const next=currentPeople().find(p=>!p.photoId&&!S.photos.has(p.id));captureId=next?.id||null;$('capturePrompt').textContent=next?'Próxima pessoa: '+personName(next):'Todas as pessoas desta lista já têm fotografia.';$('captureFile').disabled=!next;$('captureSkipBtn').disabled=!next}
function initCapture(){on('captureModeBtn',()=>{nextCapture();presentModal('captureDialog')});on('captureSkipBtn',()=>{const pending=currentPeople().filter(p=>!p.photoId&&!S.photos.has(p.id)),next=pending[(pending.findIndex(p=>p.id===captureId)+1)%pending.length];if(next){captureId=next.id;$('capturePrompt').textContent='Próxima pessoa: '+personName(next)}});$('captureFile').onchange=()=>run(async()=>{const file=$('captureFile').files?.[0],id=captureId;if(!file||!id)return;await S.photo(id,file);$('captureFile').value='';nextCapture()})}
function initPromotion(){
  on('promoteBtn',()=>{
    if(!hasYears(S.space)||S.year===null)throw Error('A passagem anual é opcional. Ative anos e escolha um ano para usar esse recurso.');promotion=planPromotion(S.space,S.year,S.year+1);$('promotionRows').replaceChildren();
    for(const p of promotion){const row=document.createElement('div');row.className='promotion-entry';const check=document.createElement('input'),text=document.createElement('span'),input=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.setAttribute('aria-label','Passar '+p.sourceLabel+' para outro ano');check.onchange=()=>p.selected=check.checked;text.textContent=p.sourceLabel+' · '+p.count+' pessoas';input.type='text';input.value=p.targetLabel||'';input.setAttribute('aria-label','Destino de '+p.sourceLabel);input.oninput=()=>p.targetLabel=input.value;row.append(check,text,input);$('promotionRows').append(row)}
    $('promotionModalTitle').textContent='Passagem de '+S.year+' para '+(S.year+1);presentModal('promotionDialog');
  });
  on('confirmPromotionBtn',()=>{const chosen=promotion.filter(p=>p.selected);if(!chosen.length||chosen.some(p=>!p.targetLabel?.trim()))throw Error('Selecione grupos e informe os destinos.');if(!confirm('Criar grupos do novo ano sem apagar o histórico?'))return;const year=S.year+1,result=applyPromotion(S.space,S.year,year,promotion);S.update(result.space);S.chooseYear(year);S.selected.clear();closeModal('promotionDialog')});
}
function showPilot(){
  $('pilotResults').hidden=false;$('pilotSummary').textContent=pilot.filter(p=>p.selected).length+' alterações selecionadas';$('pilotBody').replaceChildren();
  for(const p of pilot){if(p.kind==='same')continue;const row=document.createElement('tr'),choice=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.disabled=p.kind==='review';check.setAttribute('aria-label','Aplicar mudança de '+p.name);check.onchange=()=>{p.selected=check.checked;$('pilotSummary').textContent=pilot.filter(x=>x.selected).length+' alterações selecionadas'};choice.append(check);row.append(choice);
    const status={new:'Nova pessoa',move:'Mudar grupo',rename:'Corrigir nome',review:'Conferir'}[p.kind]||p.kind;for(const text of [p.name+(p.code?' ('+p.code+')':''),hasGroups(S.space)?p.classLabel||'—':'—',status+(p.reason?' — '+p.reason:'')]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}$('pilotBody').append(row);
  }
}
function initPilot(){
  on('analyzePilotBtn',async()=>{const file=$('pilotFile').files?.[0];if(!file)throw Error('Selecione uma planilha XLSX ou CSV.');const data=await readPilotFile(file),rows=data.rows||parseDelimited(data.csv);pilot=comparePilot(S.space,mapPilotRows(rows,currentClass()?.label||''),S.year,currentClass()?.id||null);showPilot();report('Confira as alterações. Pessoas ausentes na lista nunca são apagadas automaticamente.')});
  on('applyPilotBtn',()=>{if(!S.editable())throw Error('Acesso somente leitura.');const n=pilot.filter(p=>p.selected).length;if(!n)throw Error('Selecione alterações.');if(!confirm('Aplicar '+n+' alterações?'))return;const result=applyPilot(S.space,pilot);S.update(result.space);pilot=[];$('pilotResults').hidden=true;$('pilotFile').value='';report('Alterações aplicadas; salvamento automático em andamento.')});
}
function printPeople(){if($('printSource').value==='selected')return selectedPeople();if($('printSource').value==='class')return currentPeople();return peopleFor(S.space,ALL,S.year)}
function printOptions(){const badges=$('printFormat').value==='badges';$('badgeOptions').hidden=!badges;$('carometroOptions').hidden=badges}
function previewPrint(scroll=true){
  const people=printPeople();if(!people.length){$('printSheet')?.remove();if(scroll)report('Adicione ou selecione pessoas antes de imprimir.','warning');return false}
  const sheet=$('printFormat').value==='badges'?renderBadgeSheet(S.space,people,S.photos,S.logoUrl,S.year,{withPhoto:$('badgePhotoMode').value==='photo',extra:$('badgeExtra').value,groupId:$('printSource').value==='class'?currentClass()?.id:null}):renderPrintSheet(S.space,people,S.photos,S.logoUrl,Number($('printColumns').value),$('printCodes').checked,S.year,$('printSource').value==='class'?currentClass()?.id:null);sheet.classList.add('preview');if(scroll)sheet.scrollIntoView({block:'start',behavior:'smooth'});return true;
}
function initPrint(){
  on('printSelectedBtn',()=>{$('printSource').value='selected';selectView('impressao');previewPrint()});for(const id of ['printFormat','printSource','printColumns','printCodes','badgePhotoMode','badgeExtra'])$(id).onchange=()=>{printOptions();previewPrint(false)};
  on('previewPrintBtn',()=>previewPrint());on('printBtn',async()=>{if(!previewPrint())return;const missing=printPeople().filter(p=>p.photoId&&!S.photos.has(p.id)).length;if(missing&&!confirm(missing+' fotografia(s) não carregada(s). Imprimir mesmo assim?'))return;await Promise.all([...document.querySelectorAll('#printSheet img')].map(img=>img.decode?.().catch(()=>{})||Promise.resolve()));window.print()});
  on('exportCsvBtn',()=>{const url=URL.createObjectURL(new Blob([exportCsv(S.space,S.classId,S.year)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='fotocracha-lista.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)});printOptions();
}
async function loadPermissions(){
  const root=$('permissionsList');root.replaceChildren();if(!S.link?.folderId||!S.isCloud())return;
  try{const all=await S.drive.permissions(S.link.folderId);if(all.some(p=>p.type==='anyone'||p.type==='domain')){const warning=document.createElement('p');warning.className='alert warning';warning.textContent='Há uma permissão pública ou de domínio inteiro. Revise os acessos no Google Drive antes de usar fotografias reais.';root.append(warning)}
    for(const p of all.filter(p=>p.type==='user')){const row=document.createElement('div');row.className='permission';const text=document.createElement('span');text.textContent=(p.emailAddress||'Conta Google')+' · '+({owner:'Responsável',writer:'Editor',reader:'Leitor'}[p.role]||p.role);row.append(text);if(S.link.canShare&&p.role!=='owner'){const button=document.createElement('button');button.type='button';button.className='light';button.textContent='Retirar acesso';button.onclick=()=>run(async()=>{if(confirm('Retirar acesso de '+(p.emailAddress||'essa conta')+'?')){await S.drive.revoke(S.link.folderId,p.id);await loadPermissions()}});row.append(button)}root.append(row)}
  }catch(error){root.textContent='Confira os acessos no próprio Google Drive. '+error.message}
}
function initSharing(){
  on('manageFolderBtn',visitFolder);on('openDriveFolderBtn',visitFolder);on('copyFolderBtn',()=>copy(folderURL(),'Link da pasta copiado; compartilhe apenas com pessoas autorizadas.'));on('refreshPermissionsBtn',loadPermissions);
  on('inviteBtn',async()=>{if(!S.link?.canShare)throw Error('A conta não pode gerenciar esta pasta.');const email=$('inviteEmail').value.trim(),role=$('inviteRole').value;if(!email)throw Error('Informe o e-mail.');if(!confirm('Compartilhar este carômetro com '+email+' como '+(role==='writer'?'Editor':'Leitor')+'?'))return;await S.drive.share(S.link.folderId,email,role);report('Carômetro compartilhado pelo Google. Envie o link de acesso à pessoa convidada.');await loadPermissions()});
  on('copyLinkBtn',()=>{if(!S.link?.manifestId)throw Error('Aguarde a confirmação do salvamento.');const url=new URL(location.href);url.search='';url.searchParams.set('space',S.link.manifestId);return copy(url.href,'Link copiado. A pessoa entra com a conta que recebeu a pasta.')});
}
function initGoogle(){
  on('entryConnectBtn',connectGoogle);on('connectBtn',disconnectGoogle);on('changeAccountBtn',disconnectGoogle);on('switchSpaceBtn',switchSpace);on('refreshSpacesBtn',()=>listSpaces(false));
  on('openFolderBtn',async()=>{if(!S.isCloud())throw Error('Conecte ao Google Drive.');await openSpace(await S.drive.openFromFolder($('entryFolderLink').value.trim()))});
  on('retrySaveBtn',async()=>{if(saveError?.code==='CONFLICT')return;saveError=null;if(await saveNow())report('Alterações confirmadas no Google Drive.')});on('reauthorizeBtn',async()=>{if(saving)await saving;S.drive?.disconnect();await connectGoogle()});
  on('reloadRemoteBtn',async()=>{if(!S.link)return;if(!confirm('Descartar mudanças não salvas desta aba e reabrir o cadastro do Google Drive?'))return;const id=S.link.manifestId;if(timer)clearTimeout(timer);timer=null;if(saving)await saving;S.resetToGate();saveError=null;await openSpace(id)});
  on('retryPhotosBtn',async()=>{const result=await S.loadPhotos();report(result.failed?'Ainda há imagens não carregadas. Confira a conta, a pasta e a conexão.':'Fotografias carregadas.',result.failed?'warning':'info')});
}
function start(){
  const url=new URL(location.href);if(url.searchParams.has('client')){url.searchParams.delete('client');history.replaceState(null,'',url.href)}S.onUpdate=()=>{render();scheduleSave()};
  document.querySelectorAll('.navtabs button').forEach(b=>b.onclick=()=>selectView(b.dataset.view));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());on('helpBtn',()=>presentModal('helpDialog'));
  initForms();initCapture();initPromotion();initPilot();initPrint();initSharing();initGoogle();render();if(S.config.clientId)prepareGoogleIdentity().catch(()=>{});
  window.addEventListener('beforeunload',e=>{if(S.dirty||saving){e.preventDefault();e.returnValue=''}});window.addEventListener('focus',()=>{if(S.hasSpace()&&!S.isCloud())render()});
}
start();

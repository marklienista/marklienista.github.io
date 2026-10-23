import {Session} from './session.js';
import {addClass,renameClass,addStudent,editStudent,moveStudent,markStudentInactive,setPhoto,classStudents,studentClass,planPromotion,applyPromotion,mapPilotRows,comparePilot,applyPilot,parseDelimited,exportCsv,normalize} from './model.js';
import {readPilotFile} from './xlsx.js';
import {pickManifest} from './picker.js';
import {renderClassBar,renderStudentCards,renderPrintSheet,notify,presentModal,closeModal,fillSelect} from './view.js';
const $=id=>document.getElementById(id), S=new Session();
let pilot=[],promotionPlan=[];
const run=async fn=>{try{return await fn()}catch(e){console.error('Carômetro',e);notify(e?.message||'Não foi possível concluir.','error');return null}};
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
function render(){
  $('spaceTitle').textContent=S.space.school.name||'Carômetro sem nome';
  const mode=S.isCloud()?(S.isLinked()?'Google Drive · '+(S.drive.email||'conta autorizada'):'Google conectado · ainda não salvo'):'Demonstração temporária · Google Drive desconectado';
  $('modeText').textContent=mode+(S.dirty?' · alterações não salvas':'');
  $('connectBtn').textContent=S.isCloud()?'Trocar / reconectar Drive':'Conectar Google Drive';
  $('saveBtn').disabled=!S.isCloud()||!S.editable()||(!S.dirty&&S.isLinked());
  $('saveBtn').textContent=S.isLinked()?'Salvar no Drive':'Criar no Drive';
  fillSelect($('yearSelect'),years().map(y=>({value:y,label:String(y)})),S.year);
  if(!S.classId||!currentClass()||currentClass().year!==Number(S.year))S.classId=classesForYear()[0]?.id||null;
  renderClassBar(S.space,S.year,S.classId,id=>S.selectClass(id));
  const c=currentClass();
  $('currentClassTitle').textContent=c?.label||'Nenhuma turma neste ano';
  $('currentClassMeta').textContent=String(S.year)+' · TURMA';
  $('studentCount').textContent=c?classStudents(S.space,c.id).length+' estudantes · '+selectedCurrentStudents().length+' selecionados no ano':'Crie uma turma para começar.';
  $('renameClassBtn').disabled=!c||!S.editable();
  $('addStudentBtn').disabled=!c||!S.editable();
  $('promoteBtn').disabled=!classesForYear().length||!S.editable();
  $('newClassBtn').disabled=!S.editable();
  $('captureModeBtn').disabled=!c||!S.editable();
  if(c)renderStudentCards(S.space,c.id,S.photos,S.selected,$('searchStudents').value,$('onlyMissing').checked,{
    onSelect:(id,checked)=>{if(checked)S.selected.add(id);else S.selected.delete(id);render()},
    onPhoto:(id,file)=>run(async()=>{await S.photo(id,file);report('Fotografia de teste preparada na memória. Use Salvar no Drive para mantê-la.','warning')}),
    onEdit:openStudent,
    onRemovePhoto:id=>run(async()=>{if(!confirm('Remover a foto do carômetro? O arquivo anterior continuará no Drive até exclusão manual.'))return;S.removePhoto(id);report('Referência da foto retirada; nenhuma exclusão permanente foi realizada.','warning')}),
    onInactive:id=>run(async()=>{if(!confirm('Marcar o estudante como transferido nesta turma? O histórico será preservado.'))return;S.update(markStudentInactive(S.space,id,c.id));S.selected.delete(id)})
  });
  else{$('studentsGrid').replaceChildren();$('emptyStudents').hidden=false}
  $('studentCount').textContent=c?classStudents(S.space,c.id).length+' estudantes · '+selectedCurrentStudents().length+' selecionados no ano':'Crie uma turma para começar.';
}
S.onUpdate=render;
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
    $('googleClientId').value=S.config.clientId;
    $('googlePickerKey').value=S.config.pickerKey;
    presentModal('settingsDialog');
  };
}
function openClass(edit=false){
  if(edit&&!currentClass())return;
  $('classModalTitle').textContent=edit?'Renomear turma':'Nova turma';
  $('className').value=edit?currentClass().label:'';
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
    const changed=mode==='edit'?renameClass(S.space,S.classId,$('className').value):addClass(S.space,$('className').value,Number($('classYear').value));
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
  $('newSpaceBtn').onclick=()=>presentModal('newSpaceDialog');
  $('newSpaceForm').onsubmit=e=>run(async()=>{
    e.preventDefault();if(S.dirty&&S.isLinked()&&!confirm('Existem alterações não salvas no Drive. Criar outro carômetro mesmo assim?'))return;
    S.startSpace($('newSpaceName').value);closeModal('newSpaceDialog');report('Espaço criado. Crie uma turma e depois conecte o Drive para salvar.');
  });
  $('settingsForm').onsubmit=e=>run(async()=>{
    e.preventDefault();S.saveConfig($('googleClientId').value,$('googlePickerKey').value);
    const name=$('settingSchool').value.trim();
    if(!name)throw Error('Informe o nome da escola.');
    const changed=structuredClone(S.space);changed.school.name=name;S.update(changed);
    if($('logoFile').files?.[0])await S.logo($('logoFile').files[0]);
    $('logoFile').value='';closeModal('settingsDialog');report('Configurações aplicadas. Salve no Drive se desejar manter.');
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
    report('Passagem preparada: '+result.done.length+' turmas promovidas. Salve no Drive para confirmar o registro.');
  });
}
async function loadPermissions(){
  const root=$('permissionsList');root.replaceChildren();
  if(!S.isCloud()||!S.link?.folderId)return;
  if(!S.link.canShare){root.textContent='Apenas o responsável pode gerenciar os convites.';return}
  try{
    const all=await S.drive.permissions(S.link.folderId);
    all.filter(p=>p.type==='user').forEach(p=>{
      const row=document.createElement('div');row.className='permission';
      const label=document.createElement('span');label.textContent=(p.emailAddress||'Conta Google')+' · '+(p.role==='writer'?'Pode editar':p.role==='owner'?'Responsável':'Pode visualizar');
      row.append(label);
      if(p.role!=='owner'){
        const remove=document.createElement('button');remove.className='light';remove.textContent='Remover';remove.type='button';
        remove.onclick=()=>run(async()=>{if(!confirm('Retirar esta permissão no Drive?'))return;await S.drive.revoke(S.link.folderId,p.id);await loadPermissions()});row.append(remove);
      }
      root.append(row);
    });
  }catch(e){root.textContent='Permissões indisponíveis: '+e.message}
}
function initSharing(){
  $('inviteBtn').onclick=()=>run(async()=>{
    if(!S.isCloud()||!S.link?.folderId||!S.link.canShare)throw Error('Conecte e salve um espaço sob sua responsabilidade no Drive.');
    const email=$('inviteEmail').value.trim();
    if(!confirm('Compartilhar com '+email+' pelo Google Drive?'))return;
    await S.drive.share(S.link.folderId,email,$('inviteRole').value);
    report('Permissão enviada pelo Google. O convidado deve autorizar o arquivo no aplicativo; o acesso completo às fotos requer teste.','warning');
    await loadPermissions();
  });
  $('copyLinkBtn').onclick=()=>run(async()=>{
    if(!S.link?.manifestId)throw Error('Salve no Drive antes de gerar o link.');
    const u=new URL(location.href);u.search='';u.searchParams.set('space',S.link.manifestId);
    if(S.config.clientId)u.searchParams.set('client',S.config.clientId);
    try{await navigator.clipboard.writeText(u.href);report('Link copiado. Compartilhe somente com pessoas autorizadas no Google Drive.')}
    catch{prompt('Copie o link:',u.href)}
  });
  $('pickerBtn').onclick=()=>run(async()=>{
    if(!S.isCloud())throw Error('Conecte o Drive.');
    const id=await pickManifest(S.drive.token,S.config.pickerKey);
    if(!id)return;
    if(S.dirty&&!confirm('Descartar alterações ainda não salvas neste carômetro?'))return;
    const r=await S.load(id);
    report(r.failed?'Carômetro aberto, mas '+r.failed+' imagens não puderam ser acessadas pelo convidado.':'Carômetro compartilhado aberto.');
  });
  $('loadIdBtn').onclick=()=>run(async()=>{
    if(!S.isCloud())throw Error('Conecte o Drive.');
    const id=prompt('Cole o ID do arquivo carometro.json');if(!id)return;
    if(S.dirty&&!confirm('Descartar mudanças não salvas?'))return;
    const r=await S.load(id.trim());
    report(r.failed?'Registro aberto; algumas fotografias não foram autorizadas pelo Drive.':'Registro aberto do Drive.');
  });
}
function initPrint(){
  $('printSelectedBtn').onclick=()=>{document.querySelector('[data-view=impressao]').click();$('printSource').value='selected';previewPrint(true)};
  $('previewPrintBtn').onclick=()=>previewPrint(true);
  $('printBtn').onclick=()=>{previewPrint(false);window.print()};
  $('exportCsvBtn').onclick=()=>run(async()=>{
    if(!S.classId)throw Error('Escolha uma turma.');
    const content=exportCsv(S.space,S.classId);
    download(new Blob([content],{type:'text/csv;charset=utf-8'}),'carometro-lista-'+S.year+'.csv');
  });
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
  const sheet=renderPrintSheet(S.space,people,S.photos,S.logoUrl,Number($('printColumns').value),$('printCodes').checked,S.year);
  sheet.classList.toggle('preview',visible);
  if(visible){
    document.querySelector('[data-view=impressao]').click();
    sheet.classList.add('preview');sheet.scrollIntoView({block:'start',behavior:'smooth'});
  }
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
    report(result.applied+' alterações aplicadas. Salve no Drive para persistir.');
  });
}
function initGoogle(){
  $('connectBtn').onclick=()=>run(async()=>{
    if(!S.config.clientId){$('settingsBtn').click();report('Configure primeiro o Client ID OAuth Web do Google Cloud.','warning');return}
    const email=await S.connect();render();
    report('Google Drive autorizado'+(email?' para '+email:'')+'. Tokens não são salvos.','info');
    const id=new URL(location.href).searchParams.get('space');
    if(id){
      if(S.dirty&&!confirm('Descartar alterações locais para abrir o convite?'))return;
      try{const r=await S.load(id);report(r.failed?'Convite aberto, mas imagens requerem autorização por arquivo.':'Carômetro compartilhado aberto.')}
      catch(e){report('O acesso ao arquivo compartilhado não foi comprovado. Use o Google Picker ou confirme a permissão: '+e.message,'warning')}
    } else {
      const existing=await S.drive.spaces();
      if(existing.length){
        const button=document.createElement('button');button.className='light';button.id='openExistingBtn';button.textContent='Abrir carômetro do Drive';button.type='button';
        const old=$('openExistingBtn');if(old)old.remove();
        button.onclick=()=>run(async()=>{
          const files=await S.drive.spaces();
          const choice=prompt('Selecione o número do arquivo:\n'+files.map((f,i)=>(i+1)+' · '+(f.modifiedTime||'')).join('\n'));
          if(!choice)return;
          const item=files[Number(choice)-1];if(!item)throw Error('Número inválido.');
          if(S.dirty&&!confirm('Descartar mudanças locais não salvas?'))return;
          const result=await S.load(item.id);report(result.failed?'Aberto; '+result.failed+' fotos sem acesso.':'Carômetro recuperado do Google Drive.');
        });
        $('connectBtn').after(button);
      }
    }
  });
  $('saveBtn').onclick=()=>run(async()=>{
    const link=await S.save();
    report('Carômetro salvo no Drive. Arquivo ID '+link.manifestId+'.');
  });
}
window.addEventListener('beforeunload',e=>{
  if(S.dirty&&S.isLinked()){e.preventDefault();e.returnValue=''}
});
function start(){
  const client=new URL(location.href).searchParams.get('client');
  if(client&&!S.config.clientId){S.saveConfig(client,S.config.pickerKey)}
  bindNavigation();initForms();initCapture();initPromotion();initPilot();initPrint();initSharing();initGoogle();
  render();
  if(new URL(location.href).searchParams.has('space')){
    report('Você recebeu um link. Configure o Google Cloud e conecte o Drive para autorizar o arquivo compartilhado.','warning');
  }
}
start();

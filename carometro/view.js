import {classStudents,studentClass} from './model.js';
const make=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
export function renderClassBar(space,year,selectedClassId,onSelect) {
  const root=document.getElementById('classList');
  root.replaceChildren();
  space.classes.filter(c=>c.year===Number(year)&&!c.archived).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')).forEach(c=>{
    const b=make('button','class-pill'+(c.id===selectedClassId?' active':''),c.label);
    const count=make('small','',String(classStudents(space,c.id).length));b.append(count);
    b.type='button';b.setAttribute('aria-pressed',String(c.id===selectedClassId));b.onclick=()=>onSelect(c.id);root.append(b);
  });
}
export function renderStudentCards(space,classId,photoUrls,selected,query,missingOnly,actions){
  const root=document.getElementById('studentsGrid');root.replaceChildren();
  const students=classStudents(space,classId).filter(p=>(!query||(p.name+' '+p.code).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))&&(!missingOnly||!p.photoId&&!photoUrls.has(p.id)));
  document.getElementById('emptyStudents').hidden=students.length!==0;
  students.forEach(student=>{
    const card=make('article','student-card');
    const check=make('input','selector');check.type='checkbox';check.checked=selected.has(student.id);check.setAttribute('aria-label','Selecionar '+student.name);
    check.onchange=()=>actions.onSelect(student.id,check.checked);card.append(check);
    const photo=make('div','photo');
    const src=photoUrls.get(student.id);
    if(src){const img=make('img');img.src=src;img.alt='Fotografia de teste de '+student.name;photo.append(img)}
    else photo.textContent='◩';
    card.append(photo,make('h3','',student.name));
    if(student.code)card.append(make('p','',student.code));
    if(!src)card.append(make('span','badge',student.photoId?'Carregando ou sem acesso':'Sem foto'));
    const actionsEl=make('div','mini-actions');
    const label=make('label','',src?'Trocar foto':'Fotografar');
    const input=make('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','Escolher foto para '+student.name);input.setAttribute('capture','environment');
    input.onchange=e=>{const file=e.target.files?.[0];if(file)actions.onPhoto(student.id,file)};
    label.append(input);actionsEl.append(label);
    const edit=make('button','','Editar');edit.type='button';edit.onclick=()=>actions.onEdit(student.id);actionsEl.append(edit);
    if(src){const clear=make('button','','Retirar foto');clear.type='button';clear.onclick=()=>actions.onRemovePhoto(student.id);actionsEl.append(clear)}
    const end=make('button','','Transferência');end.type='button';end.onclick=()=>actions.onInactive(student.id);actionsEl.append(end);
    card.append(actionsEl);root.append(card);
  });
}
export function renderPrintSheet(space,students,photoUrls,logoUrl,columns,showCodes,year) {
  let sheet=document.getElementById('printSheet');
  if(!sheet){sheet=make('section');sheet.id='printSheet';document.querySelector('.container').append(sheet)}
  sheet.replaceChildren();sheet.style.setProperty('--print-columns',String(columns));
  const head=make('header','print-head'),h=make('div');h.append(make('h1','',space.school.name||'Carômetro'));
  const classes=new Set(students.map(p=>studentClass(space,p.id,year)?.label).filter(Boolean));
  h.append(make('p','',String(year)+' · '+([...classes].join(', ')||'Turmas selecionadas')+' · '+students.length+' estudantes'));head.append(h);
  if(logoUrl){const img=make('img');img.src=logoUrl;img.alt='Logotipo da escola';head.append(img)}
  sheet.append(head);
  const grid=make('div','print-grid');
  students.forEach(p=>{
    const entry=make('article','print-student'),url=photoUrls.get(p.id);
    if(url){const img=make('img');img.src=url;img.alt='';entry.append(img)}
    else entry.append(make('div','no-photo','Sem foto'));
    entry.append(make('strong','',p.name));
    if(showCodes&&p.code)entry.append(make('small','',p.code));
    if(classes.size>1)entry.append(make('small','',studentClass(space,p.id,year)?.label||''));
    grid.append(entry);
  });
  sheet.append(grid);return sheet;
}
export function notify(text,kind='info'){
  const wrap=document.getElementById('alerts');wrap.replaceChildren();
  const p=make('div','alert '+(kind==='error'?'error':kind==='warning'?'warning':''),text);wrap.append(p);
  if(kind==='error')p.setAttribute('role','alert');
  return p;
}
export function presentModal(id){const el=document.getElementById(id);if(!el.open)el.showModal();return el}
export function closeModal(id){document.getElementById(id).close()}
export function fillSelect(el,options,value){
  el.replaceChildren();
  for(const o of options){const option=make('option','',o.label);option.value=String(o.value);el.append(option)}
  if(value!==undefined)el.value=String(value);
}
export function printHtml(){document.getElementById('printSheet')?.classList.add('preview')}

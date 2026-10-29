import {peopleFor,classStudents,studentClass,classesFor,hasGroups,hasYears,carometroTitle,personName,className,ALL,UNGROUPED,ungroupedPeople} from './model.js?v=0.13';
const make=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
export function renderClassBar(space,year,selectedClassId,onSelect){
  const root=document.getElementById('classList');root.replaceChildren();root.hidden=!hasGroups(space);if(!hasGroups(space))return;
  const choices=[{id:ALL,label:'Todas as pessoas',count:peopleFor(space,ALL,year).length},...classesFor(space,year).map(c=>({id:c.id,label:className(c),count:classStudents(space,c.id).length}))];
  const loose=ungroupedPeople(space);if(loose.length)choices.push({id:UNGROUPED,label:'Sem turma ou grupo',count:loose.length});
  for(const c of choices){const b=make('button','class-pill'+(c.id===selectedClassId?' active':''),c.label);b.append(make('small','',String(c.count)));b.type='button';b.setAttribute('aria-pressed',String(c.id===selectedClassId));b.onclick=()=>onSelect(c.id);root.append(b)}
}
export function renderStudentCards(space,classId,photoUrls,selected,query,missingOnly,actions){
  const root=document.getElementById('studentsGrid');root.replaceChildren();
  const people=peopleFor(space,classId,actions.year).filter(p=>(!query||(p.name+' '+p.code).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))&&(!missingOnly||!p.photoId&&!photoUrls.has(p.id)));
  document.getElementById('emptyStudents').hidden=people.length!==0;
  for(const p of people){
    const card=make('article','student-card'),check=make('input','selector');check.type='checkbox';check.checked=selected.has(p.id);check.setAttribute('aria-label','Selecionar '+personName(p));check.onchange=()=>actions.onSelect(p.id,check.checked);card.append(check);
    const photo=make('div','photo'),src=photoUrls.get(p.id);if(src){const img=make('img');img.src=src;img.alt='Fotografia de '+personName(p);photo.append(img)}else photo.textContent='◩';card.append(photo,make('h3','',personName(p)));
    if(p.code)card.append(make('p','',p.code));
    if(!src){const issue=actions.photoErrors?.get(p.id),status=!p.photoId?'Sem foto':issue?(issue.code==='SPACE_BOUNDARY'?'Imagem fora da pasta do carômetro':'Falha ao carregar foto'):actions.loadingPhotos?'Carregando fotografia…':'Foto não carregada';const badge=make('span','badge',status);if(issue?.message)badge.title=issue.message;card.append(badge)}
    if(actions.canEdit){
      const bar=make('div','mini-actions'),label=make('label','',src?'Trocar foto':'Fotografar'),input=make('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','Escolher foto para '+personName(p));input.setAttribute('capture','environment');input.onchange=e=>{const f=e.target.files?.[0];if(f)actions.onPhoto(p.id,f)};label.append(input);bar.append(label);
      const edit=make('button','','Editar');edit.type='button';edit.onclick=()=>actions.onEdit(p.id);bar.append(edit);
      if(src){const clear=make('button','','Retirar foto');clear.type='button';clear.onclick=()=>actions.onRemovePhoto(p.id);bar.append(clear)}
      if(actions.onInactive&&space.classes.some(c=>c.id===classId)){const end=make('button','','Encerrar vínculo');end.type='button';end.onclick=()=>actions.onInactive(p.id);bar.append(end)}card.append(bar);
    }root.append(card);
  }
}
function preparePrintSheet(layout){let sheet=document.getElementById('printSheet');if(!sheet){sheet=make('section');sheet.id='printSheet';document.querySelector('.container').append(sheet)}sheet.replaceChildren();sheet.dataset.layout=layout;sheet.classList.remove('preview');return sheet}
function printedClass(space,p,year,groupId=null){
  if(!hasGroups(space))return null;
  if(groupId&&space.enrollments.some(e=>e.studentId===p.id&&e.classId===groupId&&e.status==='active'))return space.classes.find(c=>c.id===groupId)||null;
  return studentClass(space,p.id,hasYears(space)?year:undefined);
}
export function renderPrintSheet(space,people,photoUrls,logoUrl,columns,showCodes,year,groupId=null){
  const sheet=preparePrintSheet('carometro');sheet.style.setProperty('--print-columns',String(columns));
  const head=make('header','print-head'),text=make('div'),title=String(space.title??'').trim(),institution=String(space.school?.name||'').trim();
  text.append(make('h1','',title||'Carômetro'));if(institution)text.append(make('p','print-institution',institution));
  const groups=new Map(people.map(p=>{const c=printedClass(space,p,year,groupId);return [c?.id,c]}).filter(([id])=>id));
  const details=[];if(hasYears(space)&&year!==null&&year!==undefined&&year!=='')details.push(String(year));
  if(groups.size)details.push([...groups.values()].map(c=>c.label).filter(Boolean).join(', '));details.push(people.length+' pessoas');text.append(make('p','',details.filter(Boolean).join(' · ')));
  const single=groups.size===1?[...groups.values()][0]:null;
  // Cabeçalho docente só quando todas as pessoas pertencem ao mesmo grupo.
  const allInSingle=single&&people.every(p=>printedClass(space,p,year,groupId)?.id===single.id);
  if(allInSingle&&single.teacher)text.append(make('p','print-teacher','Professor(a) / responsável: '+single.teacher));
  head.append(text);if(logoUrl){const img=make('img');img.src=logoUrl;img.alt='Logotipo';head.append(img)}sheet.append(head);
  const grid=make('div','print-grid');
  for(const p of people){const entry=make('article','print-student'),url=photoUrls.get(p.id);if(url){const img=make('img');img.src=url;img.alt='';entry.append(img)}else entry.append(make('div','no-photo','Sem foto'));
    if(p.name)entry.append(make('strong','',p.name));if(showCodes&&p.code)entry.append(make('small','',p.code));
    if(!allInSingle){const c=printedClass(space,p,year,groupId);if(c?.label)entry.append(make('small','',c.label));if(c?.teacher)entry.append(make('small','print-teacher','Responsável: '+c.teacher))}grid.append(entry);
  }sheet.append(grid);return sheet;
}
/* A nota é transitória: nunca entra no manifesto. Campos vazios não geram rótulos impressos. */
export function renderBadgeSheet(space,people,photoUrls,logoUrl,year,options={}){
  const sheet=preparePrintSheet('badges');sheet.style.removeProperty('--print-columns');const withPhoto=options.withPhoto!==false,extra=String(options.extra||'').trim().slice(0,120),institution=String(space.school?.name||'').trim();
  for(let index=0;index<people.length;index+=8){
    const page=make('section','badge-page'),header=make('header','badge-page-head');
    const left=institution||String(space.title||'').trim();if(left)header.append(make('strong','',left));
    const detail=['Crachás'];if(hasYears(space)&&year!==null&&year!==undefined&&year!=='')detail.push(String(year));detail.push('folha '+(Math.floor(index/8)+1));header.append(make('span','',detail.join(' · ')));page.append(header);
    const grid=make('div','badge-grid');for(const p of people.slice(index,index+8)){
      const c=printedClass(space,p,year,options.groupId),badge=make('article','badge-item');badge.setAttribute('aria-label','Crachá de '+personName(p));
      if(institution||logoUrl){const top=make('div','badge-item-top');if(institution)top.append(make('span','badge-school',institution));if(logoUrl){const img=make('img','badge-logo');img.src=logoUrl;img.alt='';top.append(img)}badge.append(top)}
      const main=make('div','badge-item-main'+(withPhoto?'':' badge-without-photo'));
      if(withPhoto){const photo=make('div','badge-portrait'),url=photoUrls.get(p.id);if(url){const img=make('img');img.src=url;img.alt='';photo.append(img)}else photo.append(make('span','','Sem foto'));main.append(photo)}
      const text=make('div','badge-text');if(p.name)text.append(make('strong','badge-person-name',p.name));if(c?.label)text.append(make('span','badge-class',c.label));if(c?.teacher)text.append(make('span','badge-teacher','Responsável: '+c.teacher));main.append(text);badge.append(main);
      if(extra)badge.append(make('div','badge-extra-note',extra));grid.append(badge);
    }page.append(grid);sheet.append(page);
  }return sheet;
}
export function notify(text,kind='info'){const wrap=document.getElementById('alerts');wrap.replaceChildren();const p=make('div','alert '+(kind==='error'?'error':kind==='warning'?'warning':''),text);wrap.append(p);if(kind==='error')p.setAttribute('role','alert');return p}
export function presentModal(id){const el=document.getElementById(id);if(!el.open)el.showModal();return el}
export function closeModal(id){document.getElementById(id).close()}
export function fillSelect(el,options,value){el.replaceChildren();for(const o of options){const option=make('option','',o.label);option.value=String(o.value??'');el.append(option)}if(value!==undefined)el.value=String(value??'')}
export function printHtml(){document.getElementById('printSheet')?.classList.add('preview')}

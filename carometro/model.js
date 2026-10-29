/* FotoCrachá 0.13: carômetros simples e organização opcional; schema 1 compatível. */
export const SCHEMA_VERSION=1;
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const id=()=>globalThis.crypto?.randomUUID?.()||'c'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const clone=v=>structuredClone(v);
export const today=()=>new Date().toISOString().slice(0,10);
export const normalize=norm;
const touch=s=>{s.updatedAt=new Date().toISOString();return s};
export const ALL='all',UNGROUPED='ungrouped';
export function optionalYear(value){
  if(value===undefined||value===null||value==='')return null;
  const n=Number(value);if(!Number.isInteger(n)||n<1990||n>2120)throw Error('Informe um ano entre 1990 e 2120 ou deixe em branco.');return n;
}
export const hasGroups=s=>typeof s.settings?.groupsEnabled==='boolean'?s.settings.groupsEnabled:s.classes.length>0;
export const hasYears=s=>hasGroups(s)&&(typeof s.settings?.annualEnabled==='boolean'?s.settings.annualEnabled:s.classes.some(c=>c.year!==null&&c.year!==undefined));
export const carometroTitle=s=>clean(s.title??s.school?.name)||'Carômetro sem nome';
export const personName=p=>clean(p.name)||'Pessoa sem nome';
export const className=c=>clean(c?.label)||'Grupo sem nome';
export function emptySpace(name='',year=null){
  return {schema_version:1,id:id(),title:clean(name),school:{name:clean(name),logoFileId:null},classes:[],students:[],enrollments:[],settings:{columns:4,showCodes:false,printTitle:'Carômetro',groupsEnabled:false,annualEnabled:false},revision:0,updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()};
}
export function newCarometro({title='',institution='',groupsEnabled=false,annualEnabled=false}={}){
  return configureSpace(emptySpace(),{title,institution,groupsEnabled,annualEnabled});
}
export function configureSpace(data,{title=data.title??'',institution=data.school?.name??'',groupsEnabled=hasGroups(data),annualEnabled=hasYears(data)}={}){
  const s=clone(data),t=clean(title),n=clean(institution);
  if(t.length>140||n.length>140)throw Error('Nome do carômetro ou da instituição acima de 140 caracteres.');
  s.title=t;s.school={...s.school,name:n};s.settings={...s.settings,groupsEnabled:!!groupsEnabled,annualEnabled:!!groupsEnabled&&!!annualEnabled};return touch(s);
}
export function validateSpace(raw){
  if(!raw||raw.schema_version!==1||!Array.isArray(raw.classes)||!Array.isArray(raw.students)||!Array.isArray(raw.enrollments))throw Error('Arquivo do carômetro incompatível ou incompleto.');
  if(raw.classes.length>500||raw.students.length>20000||raw.enrollments.length>200000)throw Error('Arquivo muito grande.');
  const s=clone(raw);s.school=s.school||{name:'',logoFileId:null};s.school.name=clean(s.school.name);
  s.title=clean(raw.title===undefined?s.school.name:raw.title);
  const grouped=typeof raw.settings?.groupsEnabled==='boolean'?raw.settings.groupsEnabled:raw.classes.length>0;
  const annual=typeof raw.settings?.annualEnabled==='boolean'?raw.settings.annualEnabled:raw.classes.some(c=>c.year!==null&&c.year!==undefined&&c.year!=='');
  s.classes=s.classes.map(c=>({...c,year:optionalYear(c.year),label:clean(c.label),teacher:clean(c.teacher).slice(0,120)}));
  s.students=s.students.map(p=>({...p,name:clean(p.name),code:clean(p.code)}));
  s.settings={columns:4,showCodes:false,printTitle:'Carômetro',...(s.settings||{}),groupsEnabled:grouped,annualEnabled:grouped&&annual};
  const cls=new Set(s.classes.map(c=>c.id)),sts=new Set(s.students.map(p=>p.id));
  if(cls.size!==s.classes.length||sts.size!==s.students.length)throw Error('Identificadores repetidos no cadastro.');
  if(s.enrollments.some(e=>!cls.has(e.classId)||!sts.has(e.studentId)))throw Error('Arquivo com vínculos inconsistentes.');return s;
}
export function classesFor(s,year=null){return s.classes.filter(c=>!c.archived&&(!hasYears(s)||optionalYear(c.year)===optionalYear(year)))}
export function ungroupedPeople(s){
  const ever=new Set(s.enrollments.map(e=>e.studentId));
  return s.students.filter(p=>!p.archived&&(!ever.has(p.id)||p.unassigned===true));
}
export function peopleFor(s,classId=ALL,year=null){
  let people;
  if(!hasGroups(s))people=s.students.filter(p=>!p.archived);
  else if(classId===UNGROUPED)people=ungroupedPeople(s);
  else if(classId&&classId!==ALL)people=classStudents(s,classId);
  else{const cids=new Set(classesFor(s,year).map(c=>c.id)),ids=new Set(s.enrollments.filter(e=>e.status==='active'&&cids.has(e.classId)).map(e=>e.studentId));ungroupedPeople(s).forEach(p=>ids.add(p.id));people=s.students.filter(p=>!p.archived&&ids.has(p.id))}
  return [...people].sort((a,b)=>clean(a.name).localeCompare(clean(b.name),'pt-BR'));
}
export function addClass(data,label='',year=null,teacher=''){
  const s=clone(data),y=optionalYear(year),n=clean(label),t=clean(teacher);
  if(n.length>100||t.length>120)throw Error('Nome do grupo ou responsável muito longo.');
  if(n&&s.classes.some(c=>optionalYear(c.year)===y&&norm(c.label)===norm(n)))throw Error('Esse grupo já existe nesse período.');
  s.classes.push({id:id(),year:y,label:n,teacher:t,archived:false});
  s.settings={...s.settings,groupsEnabled:true,annualEnabled:hasYears(s)||y!==null};return touch(s);
}
export function renameClass(data,classId,newLabel,teacher,year){
  const s=clone(data),c=s.classes.find(c=>c.id===classId),n=clean(newLabel);if(!c||n.length>100)throw Error('Grupo inválido.');
  const y=year===undefined?optionalYear(c.year):optionalYear(year),t=teacher===undefined?clean(c.teacher):clean(teacher);
  if(t.length>120)throw Error('Nome do responsável acima de 120 caracteres.');
  if(n&&s.classes.some(o=>o.id!==classId&&optionalYear(o.year)===y&&norm(o.label)===norm(n)))throw Error('Grupo já existente nesse período.');
  c.label=n;c.teacher=t;c.year=y;return touch(s);
}
export function addStudent(data,{name='',code='',classId=null}={}){
  const s=clone(data),n=clean(name),c=clean(code);if(n.length>140||c.length>80)throw Error('Nome ou identificação muito longo.');
  if(c&&s.students.some(p=>norm(p.code)===norm(c)))throw Error('Identificação já cadastrada.');
  if(classId&&!s.classes.some(k=>k.id===classId))throw Error('Grupo não encontrado.');
  const sid=id();s.students.push({id:sid,name:n,code:c,photoId:null,photoMime:null,createdAt:new Date().toISOString()});
  if(classId)s.enrollments.push({id:id(),studentId:sid,classId,status:'active',startedAt:today(),endedAt:null});return touch(s);
}
export function editStudent(data,studentId,{name='',code=''}){
  const s=clone(data),p=s.students.find(p=>p.id===studentId);if(!p)throw Error('Pessoa não encontrada.');const n=clean(name),c=clean(code);
  if(n.length>140||c.length>80)throw Error('Dados muito longos.');if(c&&s.students.some(o=>o.id!==studentId&&norm(o.code)===norm(c)))throw Error('Identificação repetida.');p.name=n;p.code=c;return touch(s);
}
export function studentClass(s,studentId,year){
  const cs=new Map(s.classes.filter(c=>year===undefined||optionalYear(c.year)===optionalYear(year)).map(c=>[c.id,c]));
  const e=s.enrollments.find(e=>e.studentId===studentId&&e.status==='active'&&cs.has(e.classId));return e?cs.get(e.classId):null;
}
export function classStudents(s,classId){const ids=new Set(s.enrollments.filter(e=>e.classId===classId&&e.status==='active').map(e=>e.studentId));return s.students.filter(p=>!p.archived&&ids.has(p.id)).sort((a,b)=>clean(a.name).localeCompare(clean(b.name),'pt-BR'))}
export function moveStudent(data,studentId,targetClassId,year){
  const s=clone(data),p=s.students.find(p=>p.id===studentId),target=targetClassId?s.classes.find(c=>c.id===targetClassId):null;
  if(!p||targetClassId&&!target)throw Error('Pessoa ou grupo não encontrado.');
  const y=target?optionalYear(target.year):optionalYear(year);
  const active=s.enrollments.filter(e=>e.studentId===studentId&&e.status==='active'&&s.classes.some(c=>c.id===e.classId&&(!hasYears(s)||optionalYear(c.year)===y)));
  if(target&&active.some(e=>e.classId===targetClassId))return s;
  active.forEach(e=>{e.status='moved';e.endedAt=today()});
  if(target){s.enrollments.push({id:id(),studentId,classId:targetClassId,status:'active',startedAt:today(),endedAt:null});delete p.unassigned}
  else p.unassigned=true;return touch(s);
}
export function markStudentInactive(data,studentId,classId,reason='transferred'){
  const s=clone(data),e=s.enrollments.find(e=>e.studentId===studentId&&e.classId===classId&&e.status==='active');
  if(!e)throw Error('Vínculo ativo não encontrado.');e.status=reason==='completed'?'completed':'transferred';e.endedAt=today();return touch(s);
}
export function nextGrade(label){const n=clean(label),m=n.match(/^(\d{1,2})([ºª°]?)\s*(ano|s[ée]rie)\b(.*)$/i);if(!m||Number(m[1])>=9)return null;return String(Number(m[1])+1)+(m[2]||'º')+' '+m[3]+m[4]}
export function planPromotion(s,fromYear,toYear=Number(fromYear)+1){
  const from=optionalYear(fromYear),to=optionalYear(toYear);if(from===null||to===null||to<=from)throw Error('Escolha anos válidos para a passagem anual.');
  return s.classes.filter(c=>c.year===from&&!c.archived).map(c=>({sourceId:c.id,sourceLabel:className(c),targetLabel:nextGrade(c.label),count:classStudents(s,c.id).length,selected:!!nextGrade(c.label)}));
}
export function applyPromotion(data,fromYear,toYear,plan){
  let s=clone(data);const from=optionalYear(fromYear),to=optionalYear(toYear);if(from===null||to===null||to<=from)throw Error('Ano de destino inválido.');const done=[];
  for(const item of plan.filter(p=>p.selected)){
    const source=s.classes.find(c=>c.id===item.sourceId&&c.year===from),label=clean(item.targetLabel);if(!source||!label)throw Error('Grupo de origem ou destino inválido.');
    let dest=s.classes.find(c=>c.year===to&&norm(c.label)===norm(label));if(!dest){s=addClass(s,label,to);dest=s.classes.at(-1)}
    const current=classStudents(s,source.id);for(const p of current)if(!studentClass(s,p.id,to))s=moveStudent(s,p.id,dest.id);done.push({from:source.label,to:dest.label,count:current.length});
  }return {space:touch(s),done};
}
export function setPhoto(data,studentId,photoId,mime='image/jpeg'){const s=clone(data),p=s.students.find(p=>p.id===studentId);if(!p)throw Error('Pessoa não encontrada.');p.photoId=photoId||null;p.photoMime=photoId?mime:null;return touch(s)}
export function escapeCsv(value){let x=String(value??'');if(/^[=+\-@\t\r]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'}
export function exportCsv(s,classId=ALL,year=null){
  const rows=[['Nome','Identificação','Turma ou grupo','Ano','Professor ou responsável'].map(escapeCsv).join(';')];
  for(const p of peopleFor(s,classId,year)){
    const c=hasGroups(s)?studentClass(s,p.id,hasYears(s)?year:undefined):null;
    rows.push([p.name,p.code,c?.label||'',hasYears(s)?c?.year??'':'',c?.teacher||''].map(escapeCsv).join(';'));
  }return '\ufeff'+rows.join('\r\n');
}
export function parseDelimited(raw){
  const text=String(raw||'').replace(/^\ufeff/,''),first=text.split(/\r?\n/,1)[0]||'',delimiter=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],part='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){part+='"';i++}else quoted=!quoted}
    else if(ch===delimiter&&!quoted){row.push(part);part=''}else if((ch==='\n'||ch==='\r')&&!quoted){row.push(part);if(row.some(x=>x.trim()))rows.push(row);row=[];part='';if(ch==='\r'&&text[i+1]==='\n')i++}else part+=ch}
  if(quoted)throw Error('Arquivo CSV com aspas sem fechamento.');row.push(part);if(row.some(x=>x.trim()))rows.push(row);if(rows.length>25000)throw Error('Lista acima de 25 mil linhas.');return rows;
}
export function mapPilotRows(rows,defaultClass=''){
  if(!rows?.length)throw Error('Lista vazia.');const header=rows[0].map(norm),find=terms=>header.findIndex(h=>terms.some(t=>h===t||h.includes(t)));
  const ni=find(['nome','aluno','estudante','educando','pessoa','participante']),ci=find(['matricula','registro','codigo','identificacao','ra']),ti=find(['turma','classe','sala','grupo']);
  if(ni<0)throw Error('A lista precisa ter uma coluna Nome.');return rows.slice(1).map((cols,i)=>({line:i+2,name:clean(cols[ni]),code:ci>=0?clean(cols[ci]):'',classLabel:ti>=0?clean(cols[ti]):clean(defaultClass)})).filter(r=>r.name);
}
export function comparePilot(s,rows,year,defaultClassId){
  const def=s.classes.find(c=>c.id===defaultClassId),output=[],seen=new Set(),seenNew=new Set();
  for(const r of rows){
    const label=clean(r.classLabel||def?.label),target=hasGroups(s)&&label?classesFor(s,year).find(c=>norm(c.label)===norm(label)):null;
    const byCode=r.code?s.students.filter(p=>norm(p.code)===norm(r.code)):[],byName=s.students.filter(p=>norm(p.name)===norm(r.name));
    const found=byCode.length===1?byCode[0]:!r.code&&byName.length===1?byName[0]:null;
    let kind='new',reason='';const key=r.code?'code:'+norm(r.code):'name:'+norm(r.name);
    if(hasGroups(s)&&label&&!target){kind='review';reason='Grupo não encontrado'}
    else if(byCode.length>1||!r.code&&byName.length>1){kind='review';reason='Nome ou identificação ambígua'}
    else if(r.code&&!byCode.length&&byName.length){kind='review';reason='Mesmo nome com identificação diferente'}
    else if(found){
      const current=studentClass(s,found.id,hasYears(s)?year:undefined);
      if(seen.has(found.id)){kind='review';reason='Pessoa repetida na lista'}
      else if(hasGroups(s)&&target&&current?.id!==target.id){kind='move';reason='Mudança de grupo'}
      else if(norm(found.name)!==norm(r.name)){kind='rename';reason='Correção do nome'}else kind='same';seen.add(found.id);
    }else if(seenNew.has(key)){kind='review';reason='Pessoa repetida na lista'}
    seenNew.add(key);output.push({...r,kind,reason,targetId:target?.id||null,studentId:found?.id||null,selected:['new','move','rename'].includes(kind)});
  }return output;
}
export function applyPilot(data,items){let s=clone(data),applied=0;
  for(const item of items.filter(i=>i.selected)){
    if(!['new','move','rename'].includes(item.kind))continue;
    if(item.kind==='new')s=addStudent(s,{name:item.name,code:item.code,classId:item.targetId||null});
    if(item.kind==='move'){if(!item.targetId)continue;s=moveStudent(s,item.studentId,item.targetId)}
    if(item.kind==='rename'){const p=s.students.find(x=>x.id===item.studentId);s=editStudent(s,item.studentId,{name:item.name,code:item.code||p.code})}applied++;
  }return {space:touch(s),applied};
}
export function safeFilename(value){return norm(value).replace(/[^a-z0-9]+/g,'-').slice(0,55)||'carometro'}
export function demoSpace(){let s=emptySpace('Escola Exemplo');s=addClass(s,'2º ano A',2026);return s}

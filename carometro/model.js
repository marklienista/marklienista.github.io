/* FotoCrachá | modelo puro v1, compatível com registros anteriores de carômetro */
export const SCHEMA_VERSION = 1;
const clean = v => String(v ?? '').trim().replace(/\s+/g, ' ');
const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const id = () => (globalThis.crypto?.randomUUID?.() || 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2));
const clone = v => structuredClone(v);
export const today = () => new Date().toISOString().slice(0,10);
export const normalize = norm;
export function emptySpace(name='Escola Exemplo',year=2026) {
  return {schema_version:SCHEMA_VERSION,id:id(),school:{name:clean(name),logoFileId:null},classes:[],students:[],enrollments:[],settings:{columns:4,showCodes:false,printTitle:'Carômetro'},revision:0,updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()};
}
export function demoSpace() {
  let s=emptySpace('Escola Exemplo',2026);
  s=addClass(s,'2º ano A',2026);
  s=addClass(s,'2º ano B',2026);
  s=addClass(s,'3º ano A',2026);
  const names=['Ana Clara','Bruno Lima','Camila Souza','Daniel Alves','Elisa Martins','Felipe Costa','Gabriela Prado','Henrique Nunes'];
  names.forEach((name,i)=>{s=addStudent(s,{name,code:'DEMO'+String(i+1).padStart(3,'0'),classId:s.classes[0].id})});
  return s;
}
export function validateSpace(raw) {
  if (!raw || raw.schema_version!==1 || !Array.isArray(raw.classes) || !Array.isArray(raw.students) || !Array.isArray(raw.enrollments)) throw Error('Arquivo do carômetro incompatível ou incompleto.');
  if(raw.classes.length>500 || raw.students.length>20000 || raw.enrollments.length>200000) throw Error('Arquivo muito grande.');
  const s=clone(raw);
  s.school=s.school||{name:'Escola',logoFileId:null};
  // Campo opcional: escolas já existentes seguem válidas, sem migração do Drive.
  s.classes=s.classes.map(c=>({...c,teacher:clean(c.teacher).slice(0,120)}));
  s.settings={columns:4,showCodes:false,printTitle:'Carômetro',...(s.settings||{})};
  const cls=new Set(s.classes.map(c=>c.id));
  const sts=new Set(s.students.map(p=>p.id));
  if(s.enrollments.some(e=>!cls.has(e.classId)||!sts.has(e.studentId))) throw Error('Arquivo com matrículas inconsistentes.');
  return s;
}
export function addClass(data,label,year,teacher='') {
  const s=clone(data), y=Number(year), n=clean(label),t=clean(teacher);
  if(!n||n.length>100||!Number.isInteger(y)||y<1990||y>2120) throw Error('Turma ou ano inválido.');
  if(t.length>120)throw Error('Nome do professor acima de 120 caracteres.');
  if(s.classes.some(c=>c.year===y && norm(c.label)===norm(n))) throw Error('Essa turma já existe neste ano.');
  s.classes.push({id:id(),year:y,label:n,teacher:t,archived:false});
  return touch(s);
}
function touch(s){s.updatedAt=new Date().toISOString();return s}
export function renameClass(data,classId,newLabel,teacher) {
  const s=clone(data), c=s.classes.find(c=>c.id===classId), n=clean(newLabel);
  if(!c||!n||n.length>100)throw Error('Turma inválida.');
  if(s.classes.some(o=>o.id!==classId&&o.year===c.year&&norm(o.label)===norm(n)))throw Error('Turma já existente.');
  // A assinatura antiga continua válida para usos sem alteração de professor.
  const t=teacher===undefined?clean(c.teacher):clean(teacher);
  if(t.length>120)throw Error('Nome do professor acima de 120 caracteres.');
  c.label=n;c.teacher=t;return touch(s);
}
export function addStudent(data,{name,code='',classId}) {
  const s=clone(data),n=clean(name),c=clean(code);
  if(!n||n.length>140||c.length>80)throw Error('Nome ou matrícula inválida.');
  if(c&&s.students.some(p=>norm(p.code)===norm(c)))throw Error('Matrícula já cadastrada.');
  if(!s.classes.some(k=>k.id===classId))throw Error('Turma não encontrada.');
  const sid=id();
  s.students.push({id:sid,name:n,code:c,photoId:null,photoMime:null,createdAt:new Date().toISOString()});
  s.enrollments.push({id:id(),studentId:sid,classId,status:'active',startedAt:today(),endedAt:null});
  return touch(s);
}
export function editStudent(data,studentId,{name,code}) {
  const s=clone(data),p=s.students.find(p=>p.id===studentId);
  if(!p)throw Error('Aluno não encontrado.');
  const n=clean(name),c=clean(code);
  if(!n||n.length>140||c.length>80)throw Error('Dados inválidos.');
  if(c&&s.students.some(o=>o.id!==studentId&&norm(o.code)===norm(c)))throw Error('Matrícula repetida.');
  p.name=n;p.code=c;return touch(s);
}
export function studentClass(s,studentId,year) {
  const classes=new Map(s.classes.filter(c=>year===undefined||c.year===Number(year)).map(c=>[c.id,c]));
  const e=s.enrollments.find(e=>e.studentId===studentId&&e.status==='active'&&classes.has(e.classId));
  return e?classes.get(e.classId):null;
}
export function classStudents(s,classId) {
  const ids=new Set(s.enrollments.filter(e=>e.classId===classId&&e.status==='active').map(e=>e.studentId));
  return s.students.filter(p=>ids.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
export function moveStudent(data,studentId,targetClassId) {
  const s=clone(data),target=s.classes.find(c=>c.id===targetClassId);
  if(!target||!s.students.some(p=>p.id===studentId))throw Error('Aluno ou turma não encontrado.');
  const current=s.enrollments.filter(e=>e.studentId===studentId&&e.status==='active'&&s.classes.some(c=>c.id===e.classId&&c.year===target.year));
  if(current.some(e=>e.classId===targetClassId))return s;
  current.forEach(e=>{e.status='moved';e.endedAt=today()});
  s.enrollments.push({id:id(),studentId,classId:targetClassId,status:'active',startedAt:today(),endedAt:null});
  return touch(s);
}
export function markStudentInactive(data,studentId,classId,reason='transferred') {
  const s=clone(data);
  const e=s.enrollments.find(e=>e.studentId===studentId&&e.classId===classId&&e.status==='active');
  if(!e)throw Error('Matrícula ativa não encontrada.');
  e.status=reason==='completed'?'completed':'transferred';e.endedAt=today();return touch(s);
}
export function nextGrade(label) {
  const n=clean(label),m=n.match(/^(\d{1,2})([ºª°]?)\s*(ano|s[ée]rie)\b(.*)$/i);
  if(!m)return null;
  const curr=Number(m[1]);
  if(curr>=9)return null;
  return String(curr+1)+(m[2]||'º')+' '+m[3]+m[4];
}
export function planPromotion(s,fromYear,toYear=Number(fromYear)+1) {
  if(toYear<=Number(fromYear))throw Error('O ano de destino deve ser posterior.');
  const active=s.classes.filter(c=>c.year===Number(fromYear)&&!c.archived);
  return active.map(c=>({sourceId:c.id,sourceLabel:c.label,targetLabel:nextGrade(c.label),count:classStudents(s,c.id).length,selected:!!nextGrade(c.label)}));
}
export function applyPromotion(data,fromYear,toYear,plan) {
  let s=clone(data);if(toYear<=fromYear)throw Error('Ano de destino inválido.');
  const done=[];
  for(const item of plan.filter(p=>p.selected)){
    const source=s.classes.find(c=>c.id===item.sourceId&&c.year===Number(fromYear));
    const targetLabel=clean(item.targetLabel);
    if(!source||!targetLabel)throw Error('Turma de origem ou destino inválida.');
    let dest=s.classes.find(c=>c.year===Number(toYear)&&norm(c.label)===norm(targetLabel));
    if(!dest){s=addClass(s,targetLabel,toYear);dest=s.classes[s.classes.length-1]}
    const current=classStudents(s,source.id);
    for(const p of current){
      if(!studentClass(s,p.id,toYear))s=moveStudent(s,p.id,dest.id);
    }
    done.push({from:source.label,to:dest.label,count:current.length});
  }
  return {space:touch(s),done};
}
export function setPhoto(data,studentId,photoId,mime='image/jpeg') {
  const s=clone(data),p=s.students.find(p=>p.id===studentId);
  if(!p)throw Error('Estudante não encontrado.');
  p.photoId=photoId||null;p.photoMime=photoId?mime:null;return touch(s);
}
export function escapeCsv(v) {
  let x=String(v??'');
  if(/^[=+\-@\t\r]/.test(x))x="'"+x;
  return '"'+x.replace(/"/g,'""')+'"';
}
export function exportCsv(s,classId) {
  const out=[['Nome','Matrícula','Turma','Ano'].map(escapeCsv).join(';')];
  const c=s.classes.find(c=>c.id===classId);
  if(!c)throw Error('Turma ausente.');
  classStudents(s,classId).forEach(p=>out.push([p.name,p.code,c.label,c.year].map(escapeCsv).join(';')));
  return '\ufeff'+out.join('\r\n');
}
export function parseDelimited(raw) {
  const text=String(raw||'').replace(/^\ufeff/,'');
  const first=text.split(/\r?\n/,1)[0]||'';
  const delimiter=[';',',','\t'].sort((a,b)=>(first.split(b).length-first.split(a).length))[0];
  const rows=[];let row=[],part='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){part+='"';i++}else quoted=!quoted}
    else if(ch===delimiter&&!quoted){row.push(part);part=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){row.push(part);if(row.some(x=>x.trim()))rows.push(row);row=[];part='';if(ch==='\r'&&text[i+1]==='\n')i++}
    else part+=ch;
  }
  if(quoted)throw Error('Arquivo CSV com aspas sem fechamento.');
  row.push(part);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length>25000)throw Error('Lista acima do limite de 25 mil linhas.');
  return rows;
}
export function mapPilotRows(rows,defaultClass='') {
  if(!rows?.length)throw Error('Lista vazia.');
  const header=rows[0].map(norm);
  const find=(terms)=>header.findIndex(h=>terms.some(t=>h===t||h.includes(t)));
  const ni=find(['nome','aluno','estudante','educando']);
  const ci=find(['matricula','registro','codigo','ra']);
  const ti=find(['turma','classe','sala']);
  if(ni<0)throw Error('A lista precisa ter coluna de nome do aluno.');
  return rows.slice(1).map((cols,i)=>({line:i+2,name:clean(cols[ni]),code:ci>=0?clean(cols[ci]):'',classLabel:ti>=0?clean(cols[ti]):clean(defaultClass)})).filter(r=>r.name);
}
export function comparePilot(s,rows,year,defaultClassId) {
  const def=s.classes.find(c=>c.id===defaultClassId);
  const output=[],seen=new Set();
  for(const r of rows) {
    const target=s.classes.find(c=>c.year===Number(year)&&norm(c.label)===norm(r.classLabel||def?.label));
    const byCode=r.code?s.students.filter(p=>norm(p.code)===norm(r.code)):[];
    const byName=s.students.filter(p=>norm(p.name)===norm(r.name));
    let found=byCode.length===1?byCode[0]:(!r.code&&byName.length===1?byName[0]:null);
    let kind='new', reason='';
    if(!target){kind='review';reason='Turma não encontrada'}
    else if(byCode.length>1||(!r.code&&byName.length>1)){kind='review';reason='Nome ou matrícula ambígua'}
    else if(r.code&&!byCode.length&&byName.length){kind='review';reason='Mesmo nome com matrícula diferente'}
    else if(found) {
      const current=studentClass(s,found.id,year);
      if(found.id&&seen.has(found.id)){kind='review';reason='Aluno repetido na lista'}
      else if(current?.id!==target.id){kind='move';reason='Mudança de turma'}
      else if(norm(found.name)!==norm(r.name)){kind='rename';reason='Correção do nome'}
      else kind='same';
      seen.add(found.id);
    }
    output.push({...r,kind,reason,targetId:target?.id||null,studentId:found?.id||null,selected:['new','move','rename'].includes(kind)});
  }
  // Ausência de uma lista nunca gera exclusão ou transferência automática.
  return output;
}
export function applyPilot(data,items) {
  let s=clone(data);let applied=0;
  for(const item of items.filter(i=>i.selected)){
    if(!item.targetId || !['new','move','rename'].includes(item.kind))continue;
    if(item.kind==='new')s=addStudent(s,{name:item.name,code:item.code,classId:item.targetId});
    if(item.kind==='move')s=moveStudent(s,item.studentId,item.targetId);
    if(item.kind==='rename'){
      const p=s.students.find(x=>x.id===item.studentId);
      s=editStudent(s,item.studentId,{name:item.name,code:item.code||p.code});
    }
    applied++;
  }
  return {space:touch(s),applied};
}
export function safeFilename(value){return (norm(value).replace(/[^a-z0-9]+/g,'-').slice(0,55)||'carometro')}

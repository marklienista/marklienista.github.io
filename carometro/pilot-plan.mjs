/* Importação em duas fases: proposta sem escrita; aplicação apenas após revisão.
   Preserva fotos/IDs/histórico. Nunca exclui por ausência na lista. */
import {key} from './pilot-pdf.mjs';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const uid=()=>crypto.randomUUID();
const labelKey=v=>key(v).replace(/(\d+)\s*[ºª°]?\s*(?:ANO|SERIE)\s*/g,'$1').replace(/\s+/g,'');
const stateKey=r=>[r.institutionCode||key(r.institution),r.classCode||labelKey(r.classLabel),r.year||''].join('|');
const identity=r=>r.code?'C:'+key(r.codeType)+':'+r.code:'N:'+key(r.name);
const approvedStatus=(status,allowed)=>allowed.map(key).includes(key(status));
const OLD_STATUS=new Set(['RS','TS','TF','VI','DE','CS','CL','SC','FL','NC','DL','CD']);
function groupFor(space,row,options){
 if(!options.useGroups||!row.classLabel)return null;
 const year=options.useYears?row.year:null;
 const samePeriod=c=>(c.year??null)===(year??null);
 const bySource=row.classCode?space.classes.filter(c=>c.sourceCode===row.classCode&&samePeriod(c)):[];
 const matches=bySource.length?bySource:space.classes.filter(c=>samePeriod(c)&&labelKey(c.label)===labelKey(row.classLabel));
 return {key:stateKey({...row,year}),label:row.classLabel,year,teacher:options.useTeachers?row.teacher:'',sourceCode:row.classCode,id:matches.length===1?matches[0].id:null,ambiguous:matches.length>1};
}
export function makePilotPlan(space,doc,provided={}){
 const options={idType:doc.identifierTypes[0]||'',useIds:true,useGroups:true,useYears:true,useInstitution:!space.school?.name,useTeachers:true,useCallNumbers:true,activeStatuses:['AT','ATIVO','ATIVA'],includeUnknown:false,selectedSections:doc.sections.map(s=>s.key),sectionOverrides:{},...provided};
 const selected=new Set(options.selectedSections),actions=[],warnings=[];
 const sections=doc.sections.filter(s=>selected.has(s.key));
 const institutions=new Set(sections.map(s=>s.institutionCode||key(s.institution)).filter(Boolean));
 if(institutions.size>1)throw Error('Selecione turmas de apenas uma instituição por importação.');
 const institution=sections[0]?.institution||'',unitCode=sections[0]?.institutionCode||'';
 if(space.school?.sourceCode&&unitCode&&space.school.sourceCode!==unitCode)throw Error('A lista pertence a outra unidade. Use outro carômetro; identificadores de escolas diferentes não serão unidos.');
 const rows=doc.records.map(r=>{
  const ov=options.sectionOverrides[r.sectionKey]||{};
  const ident=r.identifiers.find(i=>key(i.type)===key(options.idType));
  return {...r,...ov,code:options.useIds?clean(ident?.value):'',codeType:options.useIds?key(options.idType):'',teacher:clean(ov.teacher??r.teacher)};
 });
 const activeAll=new Set(rows.filter(r=>approvedStatus(r.status,options.activeStatuses)).map(identity));
 const activeNameAll=new Set(rows.filter(r=>approvedStatus(r.status,options.activeStatuses)).map(r=>key(r.name)));
 const incoming=rows.filter(r=>selected.has(r.sectionKey)),buckets=new Map();
 for(const r of incoming){const k=identity(r);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r)}
 const covered=new Set(),targetGroups=new Set();let historical=0,unknown=0,duplicates=0;
 for(const list of buckets.values()){
  const active=list.filter(r=>approvedStatus(r.status,options.activeStatuses));
  const unique=new Map(active.map(r=>[[stateKey(r),key(r.name),r.code,r.callNumber].join('|'),r]));
  duplicates+=active.length-unique.size;
  if(unique.size>1){actions.push({kind:'review',name:active[0].name,code:active[0].code,selected:false,blocked:true,reason:'Mais de um vínculo ativo ou nome para a mesma identificação. Confira no documento.',rows:active});continue}
  let row=[...unique.values()][0];
  if(!row){
   const unrecognized=list.filter(r=>!OLD_STATUS.has(r.status));unknown+=unrecognized.length;
   if(unrecognized.length&&options.includeUnknown){row=unrecognized[0];row={...row,forceReview:true}}
   else{
    historical+=list.filter(r=>OLD_STATUS.has(r.status)).length;
    const old=list[0];if(activeAll.has(identity(old))||activeNameAll.has(key(old.name)))continue;
    const matched=old.code?space.students.filter(p=>clean(p.code)===old.code&&(!p.codeType||key(p.codeType)===old.codeType)):space.students.filter(p=>key(p.name)===key(old.name));
    if(matched.length!==1)continue;
    const person=matched[0];covered.add(person.id);
    const group=groupFor(space,old,options);
    const linked=group?.id&&space.enrollments.some(e=>e.studentId===person.id&&e.classId===group.id&&e.status==='active');
    if(linked||(!options.useGroups&&!person.archived))actions.push({kind:'deactivate',name:person.name,code:person.code,personId:person.id,row:old,group,selected:false,blocked:false,reason:'Situação '+old.status+' na fonte. Encerrar vínculo somente se você confirmar; cadastro e foto serão preservados.'});
    continue;
   }
  }else historical+=list.length-active.length;
  const group=groupFor(space,row,options);if(group?.id)targetGroups.add(group.id);
  if(group?.ambiguous||row.review||row.name.length>140||row.code.length>80||(group&&group.label.length>100)){actions.push({kind:'review',name:row.name,code:row.code,row,group,selected:false,blocked:true,reason:row.review||(group?.ambiguous?'Mais de um grupo pode corresponder à turma.':'Campo acima do limite. Confira os dados antes de importar.')});continue}
  const codes=row.code?space.students.filter(p=>clean(p.code)===row.code):[];
  const names=space.students.filter(p=>key(p.name)===key(row.name));
  let person=null,weak=false,reason=[];
  if(codes.length>1||!codes.length&&names.length>1){actions.push({kind:'review',name:row.name,code:row.code,row,group,selected:false,blocked:true,reason:'Correspondência ambígua: nome ou identificação repetidos no cadastro.'});continue}
  if(codes.length===1){
   person=codes[0];
   if(person.codeType&&key(person.codeType)!==row.codeType||person.codeScope&&unitCode&&person.codeScope!==unitCode){actions.push({kind:'review',name:row.name,code:row.code,row,selected:false,blocked:true,reason:'O número coincide, mas o tipo ou a instituição da identificação é diferente.'});continue}
   if(key(person.name)!==key(row.name)){weak=true;reason.push('Conferir nome diferente com a mesma identificação')}
  }else if(names.length===1){
   person=names[0];weak=true;
   if(row.code&&person.code&&row.code!==clean(person.code)){actions.push({kind:'review',name:row.name,code:row.code,row,selected:false,blocked:true,reason:'Mesmo nome com outra identificação. Não unir nem duplicar automaticamente.'});continue}
  }
  if(person)covered.add(person.id);
  const base={name:row.name,code:row.code,row,group,personId:person?.id||null,blocked:false};
  if(!person){actions.push({...base,kind:'new',selected:!row.forceReview,reason:row.code?'Novo cadastro ('+row.codeType+').':'Novo cadastro sem identificador; conferir nome.'});continue}
  const changes={};
  if(row.name&&person.name!==row.name){changes.name=row.name;reason.push('Atualizar nome')}
  if(row.code&&!person.code){changes.code=row.code;reason.push('Acrescentar identificação')}
  if(row.code&&(!person.codeType||(unitCode&&!person.codeScope))){changes.idMetadata=true;reason.push('Registrar tipo/origem da identificação')}
  if(person.archived){changes.reactivate=true;weak=true;reason.push('Reativar pessoa arquivada')}
  const current=group?space.enrollments.find(e=>e.studentId===person.id&&e.status==='active'&&e.classId===group.id):null;
  if(group&&!current){changes.group=true;reason.push('Mover/vincular à turma '+group.label)}
  if(group&&options.useCallNumbers&&row.callNumber&&current?.callNumber!==row.callNumber){changes.callNumber=true;reason.push('Atualizar número de chamada')}
  const kind=Object.keys(changes).length?'update':'same';
  actions.push({...base,kind,changes,selected:kind==='update'&&!weak&&!row.forceReview,reason:reason.join('; ')||'Já corresponde ao cadastro.',requiresReview:weak&&kind!=='same'});
 }
 const groups=new Map();for(const a of actions)if(a.group)groups.set(a.group.key,a.group);
 const groupChanges=[...groups.values()].filter(g=>!g.id||(g.teacher&&space.classes.find(c=>c.id===g.id)?.teacher!==g.teacher));
 for(const g of groupChanges.filter(g=>g.id&&g.teacher)){
  const old=space.classes.find(c=>c.id===g.id);actions.push({kind:'group-update',name:'Responsável — '+g.label,code:'',group:g,selected:!old.teacher,blocked:false,reason:'Responsável: '+(old.teacher||'não informado')+' → '+g.teacher,requiresReview:!!old.teacher});
 }
 const missing=space.students.filter(p=>!p.archived&&!covered.has(p.id)&&(options.useGroups?space.enrollments.some(e=>e.studentId===p.id&&targetGroups.has(e.classId)&&e.status==='active'):true));
 if(doc.issues.length)warnings.push('Há '+doc.issues.length+' página(s)/linha(s) que exigem conferência; nenhuma foi inventada.');
 if(unknown&&!options.includeUnknown)warnings.push(unknown+' registro(s) sem situação reconhecida ficaram fora da seleção.');
 if(!sections.some(s=>s.teacher))warnings.push('Professor/responsável não foi encontrado no documento. Campos já cadastrados serão preservados.');
 return {base:JSON.stringify(space),options,institution,unitCode,actions,groupChanges,missingCount:missing.length,historical,duplicates,warnings,docPages:doc.pages};
}
export function applyPilotPlan(space,plan){
 if(JSON.stringify(space)!==plan.base)throw Error('O carômetro mudou depois da prévia. Analise novamente antes de aplicar.');
 const s=structuredClone(space),now=new Date().toISOString(),date=now.slice(0,10),groupIds=new Map();let applied=0;
 const selected=plan.actions.filter(a=>a.selected&&!a.blocked&&['new','update','deactivate','group-update'].includes(a.kind));
 if(!selected.length)return {space:s,applied:0};
 if(plan.options.useInstitution&&plan.institution){s.school.name=plan.institution;if(plan.unitCode)s.school.sourceCode=plan.unitCode}
 const ensureGroup=g=>{
  if(!g)return null;if(groupIds.has(g.key))return groupIds.get(g.key);
  let c=g.id?s.classes.find(c=>c.id===g.id):null;
  if(!c){c={id:uid(),label:g.label,year:g.year??null,teacher:g.teacher||'',archived:false};if(g.sourceCode)c.sourceCode=g.sourceCode;s.classes.push(c)}
  groupIds.set(g.key,c.id);return c.id;
 };
 for(const action of selected){
  if(action.kind==='group-update'){const c=s.classes.find(c=>c.id===action.group.id);if(c){c.teacher=action.group.teacher;applied++}continue}
  const r=action.row;let p=action.personId?s.students.find(p=>p.id===action.personId):null;
  if(action.kind==='deactivate'){
   if(!p)continue;
   if(action.group?.id){const e=s.enrollments.find(e=>e.studentId===p.id&&e.classId===action.group.id&&e.status==='active');if(e){e.status='transferred';e.sourceStatus=r.status;e.endedAt=date}}
   else p.archived=true;
   applied++;continue;
  }
  if(!p){p={id:uid(),name:r.name,code:r.code||'',photoId:null,photoMime:null,createdAt:now};s.students.push(p)}
  else{if(action.changes?.name)p.name=r.name;if(action.changes?.code)p.code=r.code;if(action.changes?.reactivate)delete p.archived}
  if(r.code){p.codeType=r.codeType;if(plan.unitCode)p.codeScope=plan.unitCode}
  const groupId=ensureGroup(action.group);
  if(groupId){
   let enrollment=s.enrollments.find(e=>e.studentId===p.id&&e.classId===groupId&&e.status==='active');
   if(!enrollment){
    for(const e of s.enrollments.filter(e=>e.studentId===p.id&&e.status==='active')){
     const old=s.classes.find(c=>c.id===e.classId);
     if((old?.year??null)===(action.group.year??null)){e.status='moved';e.endedAt=date}
    }
    enrollment={id:uid(),studentId:p.id,classId:groupId,status:'active',startedAt:date,endedAt:null};s.enrollments.push(enrollment);delete p.unassigned;
   }
   if(plan.options.useCallNumbers&&r.callNumber)enrollment.callNumber=r.callNumber;
  }
  applied++;
 }
 if(groupIds.size){s.settings.groupsEnabled=true;if(plan.options.useYears)s.settings.annualEnabled=true}
 if(s.students.length>20000||s.classes.length>500||s.enrollments.length>200000)throw Error('O resultado excede a capacidade deste carômetro; reduza as turmas selecionadas.');
 s.updatedAt=now;return {space:s,applied};
}

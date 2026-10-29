import {readPdfPilot,key} from './pilot-pdf.mjs?v=0.14';
import {makePilotPlan,applyPilotPlan} from './pilot-plan.mjs?v=0.14';
/* Usa a sessão existente. Não cria outra conexão Google nem salva o PDF original. */
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node};
const check=(text,value=true)=>{const label=el('label','', 'check-inline'),input=el('input');input.type='checkbox';input.checked=value;label.append(input,document.createTextNode(text));return {label,input}};
const labelled=(text,input)=>{const label=el('label',text);label.append(input);return label};
export function mountPdfImport({session:S,flush,report,afterApply=()=>{},readPdf=readPdfPilot}){
 const target=document.getElementById('view-listas'),panel=el('div','','panel');target.replaceChildren(panel);
 let doc=null,plan=null,origin=null,sectionInputs=[],busy=false;
 const header=el('h2','Importar lista piloto — PDF, Excel ou CSV');
 const description=el('p','Escolha o PDF gerado pela escola. Confira os campos, as turmas e as mudanças antes de aplicar. O original fica neste navegador e não é enviado ao Google Drive.');
 const privacy=el('p','Datas de nascimento, sexo e origem não serão salvos. RGA, RA, RG e número de chamada são campos diferentes. Sem fotografia e sem professor na lista, os dados existentes são preservados.','sub');
 const file=el('input');file.type='file';file.accept='.pdf,.xlsx,.csv,.txt';
 const analyze=el('button','Ler arquivo','primary');analyze.type='button';
 const status=el('p','','sub');status.setAttribute('role','status');
 const legacy=el('p','XLSX/CSV continuam disponíveis; PDF com texto é a entrada prioritária. Digitalizações/fotografias precisam de OCR e não são interpretadas nesta versão.','sub');
 const config=el('div');config.hidden=true;
 const info=el('p'),fields=el('div','','soft'),groups=el('div','','table-scroll'),review=el('button','Conferir mudanças','primary');review.type='button';
 const result=el('div');result.hidden=true;
 const summary=el('p'),warnings=el('div'),tableWrap=el('div','','table-scroll'),table=el('table'),thead=el('thead'),tbody=el('tbody');
 const headings=el('tr');for(const t of ['Aplicar','Nome / identificação','Turma / página','Mudança'])headings.append(el('th',t));thead.append(headings);table.append(thead,tbody);tableWrap.append(table);
 const apply=el('button','Aplicar alterações selecionadas','primary');apply.type='button';
 const reset=el('button','Limpar leitura','light');reset.type='button';
 const useIds=check('Importar identificação',true),useCall=check('Guardar número de chamada no vínculo',true),useGroups=check('Organizar conforme turmas/grupos da lista',true),useYears=check('Usar o ano encontrado',true),useInstitution=check('Preencher instituição do carômetro',false),useTeacher=check('Usar professor/responsável quando estiver informado',true),includeUnknown=check('Considerar também registros sem situação reconhecida (revisão obrigatória)',false);
 const idType=el('select'),activeStatuses=el('input');activeStatuses.value='AT, ATIVO, ATIVA';activeStatuses.type='text';activeStatuses.maxLength=100;
 fields.append(useIds.label,labelled('Identificador principal detectado',idType),useCall.label,useGroups.label,useYears.label,useInstitution.label,useTeacher.label,labelled('Situações que significam vínculo ativo',activeStatuses),includeUnknown.label);
 config.append(info,fields,groups,review);result.append(summary,warnings,tableWrap,apply);
 panel.append(header,description,labelled('Lista da escola',file),analyze,status,legacy,privacy,config,result,reset);
 const counts=()=>{const totals={};for(const a of plan?.actions||[])totals[a.kind]=(totals[a.kind]||0)+1;const chosen=plan?.actions.filter(a=>a.selected&&!a.blocked&&a.kind!=='same').length||0;
  summary.textContent=chosen+' alterações selecionadas · '+(totals.new||0)+' novos · '+(totals.update||0)+' atualizações · '+(totals.same||0)+' já conferidos · '+(totals.deactivate||0)+' saídas para confirmar · '+(totals.review||0)+' pendências.';apply.disabled=!chosen||!S.editable();};
 function clear(){doc=null;plan=null;origin=null;sectionInputs=[];config.hidden=true;result.hidden=true;file.value='';status.textContent='Leitura limpa. Nenhum cadastro foi alterado.';tbody.replaceChildren()}
 const safe=task=>async()=>{if(busy)return;try{await task()}catch(error){status.textContent=error.message||'Não foi possível ler a lista.';report(status.textContent,'error')}finally{busy=false;analyze.disabled=false;review.disabled=false}};
 const invalidate=()=>{plan=null;result.hidden=true;status.textContent='Opções alteradas. Clique em Conferir mudanças para gerar outra prévia.'};
 fields.onchange=invalidate;
 function renderConfiguration(){
  const active=doc.records.filter(r=>['AT','ATIVO','ATIVA'].includes(r.status)).length;
  info.textContent=doc.pages+' página(s) · '+doc.sections.length+' turma(s)/grupo(s) · '+doc.records.length+' registros · '+active+' marcados como ativos. Professor: '+(doc.sections.some(s=>s.teacher)?'localizado; confira abaixo':'não localizado')+'.';
  useInstitution.input.checked=!S.space.school?.name&&!!doc.sections[0]?.institution;
  useInstitution.label.lastChild.textContent=' Preencher instituição: '+(doc.sections[0]?.institution||'não localizada');
  idType.replaceChildren();for(const type of doc.identifierTypes){const opt=el('option',type);opt.value=type;idType.append(opt)}
  if(!doc.identifierTypes.length){idType.append(el('option','Não localizado'));useIds.input.checked=false}
  useGroups.input.checked=doc.sections.some(s=>!!s.classLabel);useYears.input.checked=doc.sections.some(s=>Number.isInteger(s.year));
  groups.replaceChildren();const t=el('table'),head=el('tr');for(const text of ['Importar','Turma/grupo','Ano','Professor/responsável (opcional)','Páginas'])head.append(el('th',text));t.append(head);sectionInputs=[];
  for(const section of doc.sections){
   const tr=el('tr'),cb=el('input'),name=el('input'),year=el('input'),teacher=el('input');cb.type='checkbox';cb.checked=true;cb.setAttribute('aria-label','Importar '+(section.classLabel||'grupo'));name.value=section.classLabel;name.maxLength=100;year.type='number';year.min='1990';year.max='2120';year.value=section.year||'';teacher.value=section.teacher;teacher.maxLength=120;
   name.setAttribute('aria-label','Nome da turma detectada');year.setAttribute('aria-label','Ano detectado');teacher.setAttribute('aria-label','Professor ou responsável');
   for(const node of [cb,name,year,teacher]){const td=el('td');td.append(node);tr.append(td)}tr.append(el('td',section.pages.join(', ')));t.append(tr);sectionInputs.push({section,cb,name,year,teacher});
  }
  t.onchange=invalidate;groups.append(t);config.hidden=false;status.textContent='Arquivo lido. Confirme os campos e as turmas; nada foi salvo.';
 }
 async function fromSheet(f){
  const {readPilotFile}=await import('./xlsx.js?v=0.11'),{parseDelimited}=await import('./model.js?v=0.13');
  const data=await readPilotFile(f),rows=data.rows||parseDelimited(data.csv),header=rows[0]||[];
  const norm=v=>key(v).replace(/[^A-Z0-9]/g,'');
  const find=names=>header.findIndex(h=>names.includes(norm(h)));
  const ni=find(['NOME','NOMEDOALUNO','ALUNO','ESTUDANTE','NOMECOMPLETO','PARTICIPANTE']),ci=find(['RGA','RA','RG','MATRICULA','CODIGO','IDENTIFICACAO']),ti=find(['TURMA','CLASSE','GRUPO','TURMAOUGRUPO']),yi=find(['ANO','ANOLETIVO']),pi=find(['PROFESSOR','PROFESSORA','RESPONSAVEL','PROFESSOROURESPONSAVEL']);
  if(ni<0)throw Error('A planilha precisa ter uma coluna Nome.');
  const type=ci>=0?key(header[ci]):'',sections=[],records=[];
  for(let i=1;i<rows.length;i++){const row=rows[i],name=String(row[ni]||'').trim();if(!name)continue;const label=ti>=0?String(row[ti]||''):'';const year=yi>=0&&/^\d{4}$/.test(String(row[yi]))?Number(row[yi]):null;const sectionKey=[label,year||''].join('|');
   if(!sections.some(s=>s.key===sectionKey))sections.push({key:sectionKey,classLabel:label,classCode:'',year,teacher:pi>=0?String(row[pi]||''):'',institution:'',institutionCode:'',pages:[1]});
   records.push({...sections.find(s=>s.key===sectionKey),sectionKey,page:1,line:i+1,name,identifiers:ci>=0&&row[ci]?[{type,value:String(row[ci])}]:[],callNumber:'',status:'AT'});
  }
  return {format:'sheet',pages:1,records,sections,issues:[],identifierTypes:type?[type]:[],excludedColumns:[]};
 }
 analyze.onclick=safe(async()=>{
  if(!S.hasSpace())throw Error('Abra um carômetro antes de importar.');if(!file.files?.[0])throw Error('Escolha o PDF ou a planilha.');if(!await flush())return;
  busy=true;analyze.disabled=true;plan=null;result.hidden=true;config.hidden=true;origin=S.space.id;const f=file.files[0];
  doc=/\.pdf$/i.test(f.name)?await readPdf(f,(n,total)=>status.textContent='Lendo página '+n+' de '+total+' no navegador…'):await fromSheet(f);
  if(origin!==S.space.id){clear();throw Error('O carômetro mudou durante a leitura. Abra a lista novamente.')}
  renderConfiguration();
 });
 review.onclick=safe(async()=>{
  if(!doc||origin!==S.space.id)throw Error('Leia um arquivo neste carômetro primeiro.');if(!await flush())return;
  const selected=sectionInputs.filter(s=>s.cb.checked);if(!selected.length)throw Error('Selecione ao menos uma turma/grupo.');
  const overrides={};for(const {section,name,year,teacher} of selected){const y=year.value?Number(year.value):null;if(y!==null&&(!Number.isInteger(y)||y<1990||y>2120))throw Error('Confira o ano da turma.');overrides[section.key]={classLabel:name.value.trim(),year:y,teacher:teacher.value.trim()}}
  plan=makePilotPlan(S.space,doc,{idType:idType.value,useIds:useIds.input.checked,useGroups:useGroups.input.checked,useYears:useGroups.input.checked&&useYears.input.checked,useInstitution:useInstitution.input.checked,useTeachers:useTeacher.input.checked,useCallNumbers:useCall.input.checked,activeStatuses:activeStatuses.value.split(',').map(s=>s.trim()).filter(Boolean),includeUnknown:includeUnknown.input.checked,selectedSections:selected.map(s=>s.section.key),sectionOverrides:overrides});
  tbody.replaceChildren();warnings.replaceChildren();
  for(const text of [...plan.warnings,plan.historical+' registros de saída/histórico não serão criados como pessoas ativas.',plan.missingCount+' pessoas do cadastro não foram localizadas neste recorte. Nenhuma será apagada por ausência.'])warnings.append(el('p',text,'sub'));
  for(const a of plan.actions){if(a.kind==='same')continue;const tr=el('tr'),td=el('td'),cb=el('input');cb.type='checkbox';cb.checked=a.selected;cb.disabled=a.blocked;cb.setAttribute('aria-label','Aplicar mudança de '+a.name);cb.onchange=()=>{a.selected=cb.checked;counts()};td.append(cb);tr.append(td);
   tr.append(el('td',a.name+(a.code?' · '+(a.row?.codeType||'ID')+': '+a.code:'')),el('td',(a.row?.classLabel||a.group?.label||'Sem grupo')+(a.row?.page?' · pág. '+a.row.page:'')),el('td',({new:'Nova pessoa',update:'Atualizar',deactivate:'Encerrar vínculo',review:'Conferir','group-update':'Responsável'}[a.kind]||a.kind)+' — '+a.reason));tbody.append(tr);
  }
  result.hidden=false;counts();status.textContent='Prévia pronta. Desmarque o que não deseja aplicar. Saídas e correspondências apenas por nome exigem sua confirmação.';
 });
 apply.onclick=safe(async()=>{
  if(!S.editable())throw Error('A conta está em modo somente leitura.');if(!plan||origin!==S.space.id)throw Error('Refaça a conferência.');
  const count=plan.actions.filter(a=>a.selected&&!a.blocked&&a.kind!=='same').length;if(!count)return;
  if(!confirm('Aplicar '+count+' alterações conferidas ao carômetro aberto? Elas serão salvas no Google Drive. O PDF original não será enviado.'))return;
  if(!await flush())return;const updated=applyPilotPlan(S.space,plan);plan=null;result.hidden=true;
  const years=doc.sections.map(s=>s.year).filter(Number.isInteger);if(useYears.input.checked&&years.length)S.year=years[0];S.classId='all';S.update(updated.space);afterApply();
  status.textContent=updated.applied+' alterações aplicadas. Acompanhe “Tudo salvo no Google Drive” no topo.';report(status.textContent);
 });
 reset.onclick=()=>{if(!busy)clear()};
 const oldUpdate=S.onUpdate;S.onUpdate=()=>{oldUpdate();if(origin&&(!S.hasSpace()||S.space.id!==origin))clear()};
 return {clear};
}

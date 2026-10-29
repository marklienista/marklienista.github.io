import {readPdfPilot,key} from './pilot-pdf.mjs?v=0.14';
import {makePilotPlan,applyPilotPlan} from './pilot-plan.mjs?v=0.14';
import {reviewPage,chosenActions,actionGroup} from './review-page.mjs?v=0.16';
/* Revisão no navegador. PDF, filtros e seleção nunca são enviados antes de aplicar. */
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n};
const check=(text,value=true)=>{const label=el('label','','check-inline'),input=el('input');input.type='checkbox';input.checked=value;label.append(input,document.createTextNode(text));return {label,input}};
const labelled=(text,input)=>{const label=el('label',text);label.append(input);return label};
export function mountPdfImport({session:S,flush,report,afterApply=()=>{},readPdf=readPdfPilot}){
 const target=document.getElementById('view-listas'),panel=el('div','','panel import-panel');target.replaceChildren(panel);
 let doc=null,plan=null,origin=null,sectionInputs=[],busy=false,epoch=0,page=0;
 const header=el('h2','Importar lista piloto — PDF, Excel ou CSV');
 const description=el('p','Leia a lista, confira os campos e revise as mudanças antes de aplicar. O arquivo original permanece neste navegador.');
 const file=el('input');file.type='file';file.accept='.pdf,.xlsx,.csv,.txt';file.id='importFile';
 const analyze=el('button','Ler arquivo','primary'),reset=el('button','Limpar leitura','light');
 analyze.type=reset.type='button';analyze.id='readImportBtn';reset.id='clearImportBtn';reset.title='Limpa somente a leitura e a seleção; não apaga pessoas nem fotografias do carômetro.';
 const toolbar=el('div','','import-toolbar'),fileLabel=labelled('Lista da escola',file);fileLabel.className='import-file-label';toolbar.append(fileLabel,analyze,reset);
 const hint=el('p','Limpar leitura não apaga o carômetro. PDF com texto, Excel e CSV; digitalizações sem texto ainda não têm OCR.','sub');
 const status=el('p','','import-status');status.id='importStatus';status.setAttribute('role','status');
 const privacy=el('p','Nascimento, sexo e origem não serão salvos. RGA, RA, RG e chamada são campos diferentes. Fotografia e professor já cadastrados são preservados quando ausentes na lista.','sub');
 const config=el('div');config.hidden=true;
 const info=el('p'),fields=el('div','','soft'),groups=el('div','','table-scroll'),review=el('button','Conferir mudanças','primary');review.type='button';review.id='reviewImportBtn';
 const result=el('section','','import-results');result.hidden=true;result.setAttribute('aria-label','Conferência das alterações');
 const summary=el('p','','import-summary'),warnings=el('div','','import-warnings');summary.id='importSummary';
 const filters=el('div','','import-filters'),kindFilter=el('select'),groupFilter=el('select');kindFilter.id='importKindFilter';groupFilter.id='importGroupFilter';
 for(const [value,label] of [['changes','Mudanças e pendências'],['new','Novas pessoas'],['update','Atualizações'],['group-update','Responsáveis de grupos'],['deactivate','Saídas para confirmar'],['review','Pendências'],['same','Sem mudanças'],['all','Todos os registros']]){const o=el('option',label);o.value=value;kindFilter.append(o)}
 filters.append(labelled('Tipo de resultado',kindFilter),labelled('Turma ou grupo',groupFilter));
 const tableWrap=el('div','','table-scroll import-table'),table=el('table'),thead=el('thead'),tbody=el('tbody');tbody.id='importReviewBody';
 const headings=el('tr');for(const t of ['Aplicar','Nome / identificação','Turma / página','Mudança'])headings.append(el('th',t));thead.append(headings);table.append(thead,tbody);tableWrap.append(table);
 const pager=el('nav','','import-pager');pager.setAttribute('aria-label','Páginas da conferência');
 const prev=el('button','Anterior','light'),next=el('button','Próxima','light'),pageLabel=el('span','','sub');prev.type=next.type='button';prev.id='importPreviousPage';next.id='importNextPage';pageLabel.id='importPageLabel';pager.append(prev,pageLabel,next);
 const footer=el('div','','import-apply-footer'),selectedTotal=el('p'),apply=el('button','Aplicar alterações','primary');apply.type='button';apply.id='applyImportBtn';selectedTotal.id='importSelectedTotal';footer.append(selectedTotal,apply);
 const useIds=check('Importar identificação'),useCall=check('Guardar número de chamada no vínculo'),useGroups=check('Organizar conforme turmas/grupos da lista'),useYears=check('Usar o ano encontrado'),useInstitution=check('Preencher instituição do carômetro',false),useTeacher=check('Usar professor/responsável quando estiver informado'),includeUnknown=check('Considerar também registros sem situação reconhecida (revisão obrigatória)',false);
 const idType=el('select'),activeStatuses=el('input');activeStatuses.value='AT, ATIVO, ATIVA';activeStatuses.type='text';activeStatuses.maxLength=100;
 fields.append(useIds.label,labelled('Identificador principal detectado',idType),useCall.label,useGroups.label,useYears.label,useInstitution.label,useTeacher.label,labelled('Situações que significam vínculo ativo',activeStatuses),includeUnknown.label);
 config.append(info,fields,groups,review);result.append(el('h3','Conferência das alterações'),summary,warnings,filters,tableWrap,pager,footer);
 panel.append(header,description,toolbar,hint,status,privacy,config,result);
 function controls(){
  analyze.disabled=reset.disabled=file.disabled=busy;review.disabled=busy||!doc;
  apply.disabled=busy||!plan||!chosenActions(plan.actions).length||!S.editable();
  kindFilter.disabled=groupFilter.disabled=busy;
 }
 function counts(){
  const totals={};for(const a of plan?.actions||[])totals[a.kind]=(totals[a.kind]||0)+1;
  const chosen=chosenActions(plan?.actions).length;
  summary.textContent=(totals.new||0)+' novos · '+((totals.update||0)+(totals['group-update']||0))+' atualizações · '+(totals.same||0)+' sem mudanças · '+(totals.deactivate||0)+' saídas · '+(totals.review||0)+' pendências.';
  selectedTotal.textContent=chosen+' alterações selecionadas no total — inclui todas as páginas e filtros.';
  apply.textContent='Aplicar '+chosen+' alterações';controls();
 }
 function clear(){epoch++;doc=null;plan=null;origin=null;sectionInputs=[];page=0;config.hidden=true;result.hidden=true;file.value='';tbody.replaceChildren();status.textContent='Leitura limpa. Os cadastros e as fotografias foram mantidos.';controls()}
 const safe=task=>async()=>{if(busy)return;busy=true;controls();try{await task()}catch(error){status.textContent=error.message||'Não foi possível concluir a leitura.';report(status.textContent,'error')}finally{busy=false;controls()}};
 function invalidate(){plan=null;result.hidden=true;page=0;status.textContent='Opções alteradas. Clique em Conferir mudanças para gerar outra prévia.';controls()}
 fields.onchange=invalidate;
 function showRows(){
  const data=reviewPage(plan?.actions,{kind:kindFilter.value,group:groupFilter.value,page});page=data.page;tbody.replaceChildren();
  for(const a of data.rows){
   const tr=el('tr'),td=el('td'),cb=el('input');cb.type='checkbox';cb.checked=!!a.selected&&!a.blocked&&a.kind!=='same';cb.disabled=!!a.blocked||a.kind==='same';cb.setAttribute('aria-label','Aplicar mudança de '+a.name);
   cb.onchange=()=>{a.selected=cb.checked;counts()};td.append(cb);tr.append(td);
   const kind={new:'Nova pessoa',update:'Atualizar',deactivate:'Encerrar vínculo',review:'Conferir','group-update':'Responsável',same:'Sem mudanças'}[a.kind]||a.kind;
   tr.append(el('td',a.name+(a.code?' · '+(a.row?.codeType||'ID')+': '+a.code:'')),el('td',(a.row?.classLabel||a.group?.label||'Sem grupo')+(a.row?.page?' · pág. '+a.row.page:'')),el('td',kind+(a.reason?' — '+a.reason:'')));
   if(a.blocked)tr.className='import-review-required';tbody.append(tr);
  }
  if(!data.rows.length){const tr=el('tr'),td=el('td','Nenhum registro neste filtro.');td.colSpan=4;tr.append(td);tbody.append(tr)}
  pageLabel.textContent='Página '+(page+1)+' de '+data.pages+' · '+data.from+'–'+data.to+' de '+data.total;
  prev.disabled=page===0;next.disabled=page>=data.pages-1;counts();
 }
 function changePage(delta){page+=delta;showRows();tableWrap.scrollIntoView({block:'start',behavior:'auto'})}
 prev.onclick=()=>changePage(-1);next.onclick=()=>changePage(1);
 for(const select of [kindFilter,groupFilter])select.onchange=()=>{page=0;showRows()};
 function renderConfiguration(){
  const active=doc.records.filter(r=>['AT','ATIVO','ATIVA'].includes(r.status)).length;
  info.textContent=doc.pages+' página(s) · '+doc.sections.length+' turma(s)/grupo(s) · '+doc.records.length+' registros · '+active+' marcados como ativos. Professor: '+(doc.sections.some(s=>s.teacher)?'localizado; confira abaixo':'não localizado')+'.';
  useInstitution.input.checked=!S.space.school?.name&&!!doc.sections[0]?.institution;useInstitution.label.lastChild.textContent=' Preencher instituição: '+(doc.sections[0]?.institution||'não localizada');
  idType.replaceChildren();for(const type of doc.identifierTypes){const o=el('option',type);o.value=type;idType.append(o)}
  if(!doc.identifierTypes.length){idType.append(el('option','Não localizado'));useIds.input.checked=false}
  else useIds.input.checked=true;
  useGroups.input.checked=doc.sections.some(s=>!!s.classLabel);useYears.input.checked=doc.sections.some(s=>Number.isInteger(s.year));
  groups.replaceChildren();const t=el('table'),head=el('tr');for(const text of ['Importar','Turma/grupo','Ano','Professor/responsável (opcional)','Páginas'])head.append(el('th',text));t.append(head);sectionInputs=[];
  for(const section of doc.sections){
   const tr=el('tr'),cb=el('input'),name=el('input'),year=el('input'),teacher=el('input');cb.type='checkbox';cb.checked=true;cb.setAttribute('aria-label','Importar '+(section.classLabel||'grupo'));name.value=section.classLabel;name.maxLength=100;year.type='number';year.min='1990';year.max='2120';year.value=section.year||'';teacher.value=section.teacher;teacher.maxLength=120;
   name.setAttribute('aria-label','Nome da turma detectada');year.setAttribute('aria-label','Ano detectado');teacher.setAttribute('aria-label','Professor ou responsável');
   for(const n of [cb,name,year,teacher]){const td=el('td');td.append(n);tr.append(td)}tr.append(el('td',section.pages.join(', ')));t.append(tr);sectionInputs.push({section,cb,name,year,teacher});
  }
  t.onchange=invalidate;groups.append(t);config.hidden=false;status.textContent='Arquivo lido. Confirme os campos e as turmas; nada foi salvo.';
 }
 async function fromSheet(f){
  const {readPilotFile}=await import('./xlsx.js?v=0.11'),{parseDelimited}=await import('./model.js?v=0.13');
  const data=await readPilotFile(f),rows=data.rows||parseDelimited(data.csv),header=rows[0]||[];
  const norm=v=>key(v).replace(/[^A-Z0-9]/g,''),find=names=>header.findIndex(h=>names.includes(norm(h)));
  const ni=find(['NOME','NOMEDOALUNO','ALUNO','ESTUDANTE','NOMECOMPLETO','PARTICIPANTE']),ci=find(['RGA','RA','RG','MATRICULA','CODIGO','IDENTIFICACAO']),ti=find(['TURMA','CLASSE','GRUPO','TURMAOUGRUPO']),yi=find(['ANO','ANOLETIVO']),pi=find(['PROFESSOR','PROFESSORA','RESPONSAVEL','PROFESSOROURESPONSAVEL']);
  if(ni<0)throw Error('A planilha precisa ter uma coluna Nome.');const type=ci>=0?key(header[ci]):'',sections=[],records=[];
  for(let i=1;i<rows.length;i++){
   const row=rows[i],name=String(row[ni]||'').trim();if(!name)continue;const label=ti>=0?String(row[ti]||''):'';
   const year=yi>=0&&/^\d{4}$/.test(String(row[yi]))?Number(row[yi]):null,sectionKey=[label,year||''].join('|');
   if(!sections.some(s=>s.key===sectionKey))sections.push({key:sectionKey,classLabel:label,classCode:'',year,teacher:pi>=0?String(row[pi]||''):'',institution:'',institutionCode:'',pages:[1]});
   records.push({...sections.find(s=>s.key===sectionKey),sectionKey,page:1,line:i+1,name,identifiers:ci>=0&&row[ci]?[{type,value:String(row[ci])}]:[],callNumber:'',status:'AT'});
  }return {format:'sheet',pages:1,records,sections,issues:[],identifierTypes:type?[type]:[],excludedColumns:[]};
 }
 analyze.onclick=safe(async()=>{
  if(!S.hasSpace())throw Error('Abra um carômetro antes de importar.');const f=file.files?.[0];if(!f)throw Error('Escolha o PDF ou a planilha.');if(!await flush())return;
  plan=null;doc=null;result.hidden=true;config.hidden=true;origin=S.space.id;const request=++epoch;
  const parsed=/\.pdf$/i.test(f.name)?await readPdf(f,(n,total)=>{if(request===epoch)status.textContent='Lendo página '+n+' de '+total+' no navegador…'}):await fromSheet(f);
  if(request!==epoch||origin!==S.space.id||!S.hasSpace())return;
  doc=parsed;renderConfiguration();
 });
 review.onclick=safe(async()=>{
  if(!doc||origin!==S.space.id)throw Error('Leia um arquivo neste carômetro primeiro.');if(!await flush())return;
  const selected=sectionInputs.filter(s=>s.cb.checked);if(!selected.length)throw Error('Selecione ao menos uma turma/grupo.');
  const overrides={};for(const {section,name,year,teacher} of selected){const y=year.value?Number(year.value):null;if(y!==null&&(!Number.isInteger(y)||y<1990||y>2120))throw Error('Confira o ano da turma.');overrides[section.key]={classLabel:name.value.trim(),year:y,teacher:teacher.value.trim()}}
  plan=makePilotPlan(S.space,doc,{idType:idType.value,useIds:useIds.input.checked,useGroups:useGroups.input.checked,useYears:useGroups.input.checked&&useYears.input.checked,useInstitution:useInstitution.input.checked,useTeachers:useTeacher.input.checked,useCallNumbers:useCall.input.checked,activeStatuses:activeStatuses.value.split(',').map(s=>s.trim()).filter(Boolean),includeUnknown:includeUnknown.input.checked,selectedSections:selected.map(s=>s.section.key),sectionOverrides:overrides});
  warnings.replaceChildren();for(const text of [...plan.warnings,plan.historical+' registros de saída/histórico não serão criados como pessoas ativas.',plan.missingCount+' pessoas do cadastro não foram localizadas neste recorte. Nenhuma será apagada por ausência.'])warnings.append(el('p',text,'sub'));
  groupFilter.replaceChildren();const all=el('option','Todas as turmas/grupos');all.value='';groupFilter.append(all);
  for(const g of [...new Set(plan.actions.map(actionGroup))].sort((a,b)=>a.localeCompare(b,'pt-BR'))){const o=el('option',g);o.value=g;groupFilter.append(o)}
  kindFilter.value='changes';page=0;result.hidden=false;showRows();status.textContent='Prévia pronta. Revise as mudanças por tipo ou turma. Saídas e correspondências apenas por nome exigem confirmação.';
 });
 apply.onclick=safe(async()=>{
  if(!S.editable())throw Error('A conta está em modo somente leitura.');if(!plan||origin!==S.space.id)throw Error('Refaça a conferência.');
  const count=chosenActions(plan.actions).length;if(!count)return;
  if(!confirm('Aplicar '+count+' alterações selecionadas no total, em todas as páginas e filtros, ao carômetro aberto? Elas serão salvas no Google Drive. O PDF original não será enviado.'))return;
  if(!await flush())return;const updated=applyPilotPlan(S.space,plan);plan=null;result.hidden=true;
  const years=doc.sections.map(s=>s.year).filter(Number.isInteger);if(useYears.input.checked&&years.length)S.year=years[0];S.classId='all';S.update(updated.space);afterApply();
  status.textContent=updated.applied+' alterações aplicadas. Acompanhe o quadro Salvo no Google Drive.';report(status.textContent);
 });
 reset.onclick=()=>{if(!busy)clear()};
 const oldUpdate=S.onUpdate;S.onUpdate=()=>{oldUpdate();if(origin&&(!S.hasSpace()||S.space.id!==origin))clear();else if(plan)counts()};
 controls();return {clear,hasReview:()=>!!doc||!!plan,isBusy:()=>busy};
}

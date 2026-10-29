/* FotoCrachá: leitura local de PDFs com texto. Nenhum PDF é enviado a um servidor.
   Layouts desconhecidos ficam para revisão. Não contém dados de estudantes. */
export const PDFJS_VERSION='6.4.299';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const plain=v=>key(v).replace(/[^A-Z0-9]/g,'');
const COLUMN_RULES=[
 ['name',/^(NOMEDOALUNO|NOMEDOESTUDANTE|NOMEDOPARTICIPANTE|NOMECOMPLETO|NOME|ALUNO|ESTUDANTE|PARTICIPANTE)$/],
 ['callNumber',/^(NCHAM|NOCHAM|NCHAMADA|NOCHAMADA|NUMEROCHAMADA|NUMERODECHAMADA|CHAMADA|NRO|NUMERO)$/],
 ['identifier',/^(RGA|RA|RG|RNE|MATRICULA|MATRICULADOALUNO|REGISTRO|CODIGO|IDENTIFICACAO)$/],
 ['birth',/^(DATANASC|DATANASCIMENTO|DATADENASCIMENTO|NASCIMENTO|DNASC)$/],
 ['sex',/^(SEXO|GENERO)$/],['statusDate',/^(DATAST|DATASIT|DATASITUACAO|DATADASITUACAO)$/],
 ['status',/^(SIT|SITUACAO|STATUS)$/],['origin',/^ORIGEM$/],
 ['classLabel',/^(TURMA|CLASSE|GRUPO|SALA)$/],['year',/^(ANOLETIVO|ANO)$/],
 ['teacher',/^(PROFESSOR|PROFESSORA|DOCENTE|RESPONSAVEL)$/]
];
function words(items){
 const out=[];
 for(const item of items){
  const text=String(item.str||''),matches=[...text.matchAll(/\S+/g)];
  for(const m of matches)out.push({str:m[0],x:item.x+(item.width||text.length*4)*m.index/Math.max(text.length,1),y:item.y,width:(item.width||text.length*4)*m[0].length/Math.max(text.length,1),height:item.height||8});
 }
 return out.sort((a,b)=>a.x-b.x);
}
export function groupLines(items){
 const lines=[];
 for(const item of items.filter(i=>clean(i.str)).sort((a,b)=>a.y-b.y||a.x-b.x)){
  let line=lines.at(-1);
  const tolerance=Math.max(1.2,Math.min(2.5,(item.height||8)*.23));
  if(!line||Math.abs(line.y-item.y)>tolerance){line={y:item.y,items:[]};lines.push(line)}
  line.items.push(item);
 }
 for(const line of lines){line.items.sort((a,b)=>a.x-b.x);line.text=clean(line.items.map(i=>i.str).join(' '))}
 return lines;
}
export function detectColumns(line){
 const ws=words(line.items),columns=[];
 for(let i=0;i<ws.length;){
  let found=null;
  for(let n=Math.min(4,ws.length-i);n>=1&&!found;n--){
   const label=ws.slice(i,i+n).map(w=>w.str).join(' '),p=plain(label);
   const rule=COLUMN_RULES.find(([,pattern])=>pattern.test(p));
   if(rule)found={field:rule[0],label,x:ws[i].x,height:ws[i].height,n};
  }
  if(found){columns.push(found);i+=found.n}else i++;
 }
 return columns.some(c=>c.field==='name')&&columns.length>=2?columns:[];
}
function metadata(lines){
 const text=lines.map(l=>l.text).join('\n');
 const institution=text.match(/(?:Unidade|Institui[çc][ãa]o|Escola)\s*:\s*([^\n]+)/i)?.[1]||'';
 const parts=institution.match(/^([0-9]{3,})\s*[-–—]\s*(.+)$/);
 const classText=clean(text.match(/(?:Turma|Classe|Grupo)\s*:\s*(.+?)(?=\s+(?:Ano\s*Letivo|Ano|Professor|Docente|Turno)\s*:|\n|$)/i)?.[1]);
 const cp=classText.match(/^(\d{4,})\s*[-–—]\s*(.+)$/);
 const year=text.match(/Ano\s*(?:Letivo)?\s*:\s*(\d{4})/i)?.[1]||'';
 const teacher=clean(text.match(/(?:Professor(?:a)?(?:\(a\))?|Docente|Respons[áa]vel)\s*:\s*(.+?)(?=\s+(?:Turma|Classe|Grupo|Ano|Turno|Unidade)\s*:|\n|$)/i)?.[1]);
 const generated=text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1]||'';
 return {institution:clean(parts?.[2]||institution),institutionCode:parts?.[1]||'',classCode:cp?.[1]||'',classLabel:clean(cp?.[2]||classText),year:year?Number(year):null,teacher,generated};
}
function cellsOf(line,columns){
 const cells=columns.map(()=>[]);
 for(const item of line.items){
  let parts=[item];
  if(/^\s*[FM]\s+\p{L}/u.test(item.str)&&columns.some(c=>c.field==='sex'))parts=words([item]);
  for(const part of parts){
   let index=-1;
   for(let i=0;i<columns.length;i++)if(part.x>=columns[i].x-Math.max(3,(columns[i].height||8)*.9))index=i;
   if(index>=0)cells[index].push(part.str);
  }
 }
 return cells.map(v=>clean(v.join(' ')));
}
export function parsePilotPages(pages){
 if(!Array.isArray(pages)||pages.length>200)throw Error('PDF acima de 200 páginas. Divida por turmas.');
 const records=[],sections=[],issues=[],identifierTypes=new Set(),excludedColumns=new Set();
 let carry=null,textPages=0;
 for(const page of pages){
  const lines=groupLines(page.items||[]);
  if(!lines.some(l=>l.text.length>25)){issues.push({page:page.number,kind:'no_text',message:'Página sem texto extraível; pode ser digitalização.'});continue}
  textPages++;
  const headerIndex=lines.findIndex(l=>detectColumns(l).length>=2&&detectColumns(l).some(c=>c.field==='name')&&l.items.length>=2);
  if(headerIndex<0){issues.push({page:page.number,kind:'layout',message:'Não encontrei cabeçalho de tabela reconhecível.'});continue}
  const columns=detectColumns(lines[headerIndex]);
  const meta=metadata(lines.slice(0,headerIndex));
  if(!meta.classLabel&&carry&&meta.institution===carry.institution)Object.assign(meta,{classLabel:carry.classLabel,classCode:carry.classCode,year:meta.year||carry.year,teacher:meta.teacher||carry.teacher});
  carry=meta;
  columns.filter(c=>c.field==='identifier').forEach(c=>identifierTypes.add(key(c.label)));
  columns.filter(c=>['birth','sex','origin','statusDate'].includes(c.field)).forEach(c=>excludedColumns.add(c.label));
  const sectionKey=[meta.institutionCode||key(meta.institution),meta.classCode||key(meta.classLabel),meta.year||''].join('|');
  let section=sections.find(s=>s.key===sectionKey);
  if(!section){section={...meta,key:sectionKey,pages:[],count:0,active:0};sections.push(section)}section.pages.push(page.number);
  let previous=null;
  for(let i=headerIndex+1;i<lines.length;i++){
   const line=lines[i];
   if(/^(Situa[çc][ãa]o do Aluno na Turma|Legenda|Total\s+(?:de\s+)?Alunos|Observa[çc][õo]es)\s*:?/i.test(line.text))break;
   if(detectColumns(line).length>=3)continue;
   const values=cellsOf(line,columns),fields={},identifiers=[];
   columns.forEach((c,n)=>{if(c.field==='identifier'){if(values[n])identifiers.push({type:key(c.label),value:values[n]})}else fields[c.field]=values[n]});
   if(!fields.name||!/[\p{L}]/u.test(fields.name))continue;
   if(previous&&!identifiers.length&&!fields.callNumber&&!fields.status&&!fields.birth&&line.y-previous.y<Math.max(18,(line.items[0]?.height||8)*2)){
    previous.record.name=clean(previous.record.name+' '+fields.name);continue;
   }
   if(!fields.status&&!fields.callNumber&&!identifiers.length&&columns.some(c=>c.field==='status')){
    issues.push({page:page.number,kind:'row',message:'Linha incompleta não importada automaticamente.',line:i+1});continue;
   }
   const row={...meta,sectionKey,page:page.number,line:i+1,name:fields.name,identifiers,callNumber:fields.callNumber||'',status:key(fields.status||''),classLabel:fields.classLabel||meta.classLabel,year:fields.year&&/^\d{4}$/.test(fields.year)?Number(fields.year):meta.year,teacher:fields.teacher||meta.teacher};
   if(row.name.length>140||identifiers.some(id=>id.value.length>80))row.review='Campo acima do limite; conferir a separação das colunas.';
   records.push(row);section.count++;if(['AT','ATIVO','ATIVA'].includes(row.status))section.active++;
   previous={record:row,y:line.y};
  }
 }
 if(!textPages)throw Error('Este PDF é uma digitalização sem texto. A leitura por OCR ainda não está habilitada; nenhum cadastro foi alterado.');
 if(!records.length)throw Error('Não identifiquei uma tabela de pessoas neste PDF. Não foram feitas alterações.');
 if(records.length>25000)throw Error('A lista ultrapassa 25 mil registros.');
 const statuses={};for(const r of records)statuses[r.status||'SEM SITUAÇÃO']=(statuses[r.status||'SEM SITUAÇÃO']||0)+1;
 return {format:'pdf',pages:pages.length,records,sections,issues,identifierTypes:[...identifierTypes],excludedColumns:[...excludedColumns],statuses};
}
let library;
export async function readPdfPilot(file,onProgress=()=>{}){
 if(file.size>20*1024*1024)throw Error('PDF acima de 20 MB. Divida a lista por turmas.');
 const buffer=await file.arrayBuffer();
 if(new TextDecoder().decode(buffer.slice(0,5))!=='%PDF-')throw Error('O arquivo não é um PDF válido.');
 const base='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VERSION+'/build/';
 try{library=library||await import(base+'pdf.min.mjs')}catch{throw Error('Não foi possível carregar o leitor de PDF. Confira a conexão. O documento não foi enviado.');}
 library.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.mjs';
 const task=library.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,enableXfa:false,disableFontFace:true,stopAtErrors:true});
 try{
  const pdf=await task.promise;if(pdf.numPages>200)throw Error('PDF acima de 200 páginas. Divida por turmas.');
  const pages=[];
  for(let n=1;n<=pdf.numPages;n++){
   onProgress(n,pdf.numPages);const page=await pdf.getPage(n),vp=page.getViewport({scale:1}),text=await page.getTextContent();
   const items=text.items.filter(i=>typeof i.str==='string').map(i=>{const m=library.Util.transform(vp.transform,i.transform);return {str:i.str,x:m[4],y:m[5],width:i.width,height:i.height}});
   pages.push({number:n,width:vp.width,height:vp.height,items});page.cleanup();
  }
  return parsePilotPages(pages);
 }catch(e){if(e.name==='PasswordException')throw Error('PDF protegido por senha. Exporte uma cópia autorizada sem senha.');throw e}
 finally{await task.destroy()}
}

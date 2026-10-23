/* XLSX sem upload ou dependências de terceiros. Suporta planilhas .xlsx comuns;
   arquivos .xls antigos e PDFs precisam ser convertidos pela pessoa. */
const td=new TextDecoder('utf-8');
function xml(text){const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Planilha com XML inválido.');return d}
const loc=(a,b)=>a.getElementsByTagName(b)[0];
function colIndex(cell){const m=/^([A-Z]+)/i.exec(cell||'');if(!m)return 0;let n=0;for(const c of m[1].toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1}
async function openXlsx(file){
  if(file.size>10*1024*1024)throw Error('Arquivo XLSX muito grande (máximo 10 MB).');
  const buf=await file.arrayBuffer(),view=new DataView(buf), bytes=new Uint8Array(buf);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw Error('Arquivo XLSX não é um ZIP reconhecido.');
  const total=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true),files=new Map();
  if(total>1500)throw Error('Planilha com muitos arquivos internos.');
  let p=offset;
  for(let i=0;i<total;i++){
    if(view.getUint32(p,true)!==0x02014b50)throw Error('ZIP com índice inválido.');
    const method=view.getUint16(p+10,true),comp=view.getUint32(p+20,true),raw=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
    const name=td.decode(bytes.subarray(p+46,p+46+nameLen));
    if(name.startsWith('xl/') && !name.includes('../'))files.set(name,{method,comp,raw,local});
    p+=46+nameLen+extra+comment;
  }
  async function get(name){
    const f=files.get(name);if(!f)return null;
    if(f.raw>12*1024*1024)throw Error('Parte XLSX acima do limite.');
    const pos=f.local;if(view.getUint32(pos,true)!==0x04034b50)throw Error('ZIP com entrada inválida.');
    const start=pos+30+view.getUint16(pos+26,true)+view.getUint16(pos+28,true);
    const compressed=new Blob([bytes.slice(start,start+f.comp)]);
    let binary;
    if(f.method===0)binary=await compressed.arrayBuffer();
    else if(f.method===8){
      if(typeof DecompressionStream==='undefined')throw Error('Este navegador não suporta XLSX; exporte a lista para CSV.');
      binary=await new Response(compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    }else throw Error('Método de compressão XLSX não suportado.');
    if(binary.byteLength>12*1024*1024)throw Error('Conteúdo XLSX acima do limite.');
    return td.decode(binary);
  }
  const sharedText=await get('xl/sharedStrings.xml');
  const shared=sharedText?[...xml(sharedText).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(x=>x.textContent).join('')):[];
  // Identifica a primeira aba da pasta de trabalho sem executar macros/fórmulas.
  let path='xl/worksheets/sheet1.xml';
  const workbookText=await get('xl/workbook.xml'),relsText=await get('xl/_rels/workbook.xml.rels');
  if(workbookText&&relsText){
    const w=xml(workbookText),r=xml(relsText),sheet=w.getElementsByTagName('sheet')[0];
    const rid=sheet?.getAttribute('r:id');
    const rel=[...r.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===rid);
    const target=rel?.getAttribute('Target');
    if(target)path=(target.startsWith('/')?target.slice(1):'xl/'+target).replace(/\/\.\//g,'/');
  }
  let text=await get(path);
  if(!text){
    const first=[...files.keys()].find(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if(!first)throw Error('Não foi encontrada uma aba na planilha.');
    text=await get(first);
  }
  const doc=xml(text),sheetRows=[...doc.getElementsByTagName('row')],output=[];
  if(sheetRows.length>25000)throw Error('Lista acima de 25 mil linhas.');
  for(const r of sheetRows){
    const row=[],cells=[...r.getElementsByTagName('c')];
    for(const c of cells){
      const at=colIndex(c.getAttribute('r')),t=c.getAttribute('t');
      let val='';
      if(t==='inlineStr')val=[...c.getElementsByTagName('t')].map(x=>x.textContent).join('');
      else{val=loc(c,'v')?.textContent||'';if(t==='s')val=shared[Number(val)]??'';}
      if(at<80)row[at]=val;
    }
    output.push(Array.from({length:Math.min(Math.max(row.length,1),80)},(_,i)=>row[i]||''));
  }
  const first=output.findIndex(r=>r.some(x=>String(x).trim()));
  if(first<0)throw Error('A primeira aba está vazia.');
  return output.slice(first);
}
export async function readPilotFile(file){
  const name=(file?.name||'').toLowerCase();
  if(name.endsWith('.csv')||name.endsWith('.txt'))return {rows:null,csv:await file.text(),kind:'csv'};
  if(name.endsWith('.xlsx'))return {rows:await openXlsx(file),kind:'xlsx'};
  if(name.endsWith('.pdf'))throw Error('PDF ainda não é interpretado com confiabilidade. Solicite ou exporte a lista piloto em Excel (.xlsx) ou CSV.');
  throw Error('Formato não suportado. Envie uma planilha XLSX ou CSV.');
}

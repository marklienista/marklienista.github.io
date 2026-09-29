/* ApertaLetra 0.1.0 — independent web implementation. No legacy assets. */
'use strict';
(() => {
 const VERSION=1, MAX_FILE_BYTES=1024*1024, MAX_TEXT=250000;
 const FONT_STACKS={
  Arial:'Arial, Helvetica, sans-serif',
  Georgia:'Georgia, "Times New Roman", serif',
  Manuscrita:'"Segoe Print", "Bradley Hand", "Comic Sans MS", "Comic Neue", cursive',
  'Courier New':'"Courier New", Courier, monospace',
  Verdana:'Verdana, sans-serif'
 };
 const FONTS=Object.keys(FONT_STACKS), SIZES=[16,18,20,24,28,32,48];
 const STEP_SIZES=[16,18,24,32,48];
 const HTML_SIZES={1:10,2:13,3:16,4:18,5:24,6:32,7:48};
 function fontKey(value){
  const normalized=String(value||'').replace(/["']/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  return FONTS.find(f=>normalized===f.toLowerCase() || normalized===FONT_STACKS[f].replace(/["']/g,'').toLowerCase())||null;
 }
 function fontStack(value){return FONT_STACKS[fontKey(value)||'Arial'];}
 function pixelSize(value){const v=String(value||'').trim();return /^\d+(?:\.\d+)?px$/.test(v)&&Number.parseFloat(v)>=10&&Number.parseFloat(v)<=96?v:'';}
 const ALLOWED=new Set(['P','DIV','BR','B','STRONG','I','EM','U','SPAN','FONT','UL','OL','LI']);
 const DROP=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO','LINK','META','INPUT','FORM','BUTTON']);
 const color=v=> /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.,%\s]+\))$/i.test(v||'') ? v : '';
 function cleanHTML(input){
  if(typeof input!=='string'||input.length>MAX_FILE_BYTES)throw new Error('Este texto é grande demais ou não é válido.');
  const source=document.createElement('template'); source.innerHTML=input;
  const out=document.createElement('div');
  function walk(node,parent){
   if(node.nodeType===3){parent.appendChild(document.createTextNode(node.nodeValue));return;}
   if(node.nodeType!==1||DROP.has(node.tagName))return;
   if(!ALLOWED.has(node.tagName)){for(const child of node.childNodes)walk(child,parent);return;}
   const element=document.createElement(node.tagName==='FONT'?'span':node.tagName.toLowerCase());
   const c=color(node.getAttribute('color')||node.style.color); if(c)element.style.color=c;
   const face=fontKey(node.style.fontFamily||node.getAttribute('face'));if(face)element.style.fontFamily=fontStack(face);
   const size=pixelSize(node.style.fontSize)||(node.tagName==='FONT'&&HTML_SIZES[node.getAttribute('size')]?HTML_SIZES[node.getAttribute('size')]+'px':'');if(size)element.style.fontSize=size;
   if(['bold','700','800','900'].includes(node.style.fontWeight))element.style.fontWeight='bold';
   if(node.style.fontStyle==='italic')element.style.fontStyle='italic';
   if(node.style.textDecorationLine==='underline')element.style.textDecoration='underline';
   if(['left','center','right','justify'].includes(node.style.textAlign))element.style.textAlign=node.style.textAlign;
   for(const child of node.childNodes)walk(child,element);
   parent.appendChild(element);
  }
  for(const child of source.content.childNodes)walk(child,out);
  if(out.textContent.length>MAX_TEXT)throw new Error('Limite desta versão: 250 mil caracteres por texto.');
  return out.innerHTML;
 }
 function plainHTML(text){const el=document.createElement('div');el.textContent=text;return el.innerHTML.replace(/\r\n?/g,'\n').replace(/\n/g,'<br>');}
 function textFromHTML(html){const el=document.createElement('div');el.innerHTML=cleanHTML(html);for(const br of el.querySelectorAll('br'))br.replaceWith('\n');for(const block of el.querySelectorAll('div,p,li'))block.append('\n');return el.textContent.replace(/\n{3,}/g,'\n\n').trimEnd();}
 function settings(value={}){return {font:FONTS.includes(value?.font)?value.font:'Arial',size:SIZES.includes(Number(value?.size))?Number(value.size):24};}
 function id(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
 function fresh(){const now=new Date().toISOString();return {id:id(),title:'',html:'',settings:settings(),createdAt:now,updatedAt:now,revision:0};}
 function validateDocument(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.title!=='string'||raw.title.length>120||typeof raw.html!=='string')throw new Error('Arquivo inválido. O texto atual foi mantido.');
  return {title:raw.title,html:cleanHTML(raw.html),settings:settings(raw.settings)};
 }
 function importFile(filename,raw){
  if(typeof raw!=='string'||new Blob([raw]).size>MAX_FILE_BYTES)throw new Error('Abra um arquivo de até 1 MB.');
  if(filename.toLowerCase().endsWith('.txt')){if(raw.length>MAX_TEXT)throw new Error('O texto é grande demais para esta versão.');return {...fresh(),title:filename.replace(/\.txt$/i,'').slice(0,120),html:plainHTML(raw)};}
  let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Este não é um arquivo ApertaLetra válido.');}
  if(parsed?.app!=='apertaletra'||parsed?.version!==VERSION)throw new Error('Formato não reconhecido. Abra um arquivo .apertaletra desta versão ou um .txt.');
  return {...fresh(),...validateDocument(parsed.document)};
 }
 function exportFile(doc){return JSON.stringify({app:'apertaletra',version:VERSION,document:validateDocument(doc)},null,2);}
 function filename(title){return (title.trim()||'Meu texto').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,100);}
 globalThis.AL={VERSION,MAX_FILE_BYTES,MAX_TEXT,FONTS,SIZES,STEP_SIZES,HTML_SIZES,fontKey,fontStack,pixelSize,cleanHTML,plainHTML,textFromHTML,settings,id,fresh,validateDocument,importFile,exportFile,filename};
})();

'use strict';
(() => {
 const $=id=>document.getElementById(id), editor=$('editor'), title=$('docTitle'), store=new ALStore();
 const CURRENT='apertaletra:current', RECOVERY='apertaletra:recovery:', recoveryKey=RECOVERY+AL.id();
 let doc=AL.fresh(),dirty=false,generation=0,saveTask=null,saveTimer=null,range=null,history=[],historyAt=-1,toastTimer=null,restoring=false;
 function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
 function status(text,state='pending'){$('saveStatus').textContent=text;$('saveStatus').dataset.state=state;const indicator=$('saveIndicator');if(indicator){indicator.dataset.state=state;indicator.title=text;}}
 function setCurrent(id){try{localStorage.setItem(CURRENT,id);}catch{/* IndexedDB can still work when localStorage is unavailable. */}}
 function text(){return AL.textFromHTML(editor.innerHTML);}
 function capture(){return {...doc,title:title.value.slice(0,120),html:AL.cleanHTML(editor.innerHTML),settings:{...doc.settings}};}
 function emergency(){try{localStorage.setItem(recoveryKey,JSON.stringify({...capture(),emergencyAt:Date.now()}));}catch{/* Remain dirty until the IndexedDB transaction commits. */}}
 function clearEmergency(){try{localStorage.removeItem(recoveryKey);}catch{}}
 function updateCount(){const value=text().trim();$('wordCount').textContent=`${value?value.split(/\s+/u).length:0} palavras`;}
 function applySettings(){editor.style.fontFamily=AL.fontStack(doc.settings.font);editor.style.fontSize=doc.settings.size+'px';$('fontSelect').value=doc.settings.font;$('sizeSelect').value=doc.settings.size;}
 function snapshot(){return JSON.stringify({title:title.value,html:editor.innerHTML,settings:{...doc.settings}});}
 function historyPush(){const current=snapshot();if(history[historyAt]===current)return;history=history.slice(0,historyAt+1);history.push(current);let total=history.reduce((n,s)=>n+s.length,0);while(history.length>2&&(history.length>100||total>5000000))total-=history.shift().length;historyAt=history.length-1;historyButtons();}
 function historyButtons(){$('undoBtn').disabled=historyAt<=0;$('redoBtn').disabled=historyAt>=history.length-1;}
 function historyMove(step){const target=historyAt+step;if(target<0||target>=history.length)return;historyAt=target;const saved=JSON.parse(history[historyAt]);restoring=true;title.value=saved.title;editor.innerHTML=AL.cleanHTML(saved.html);doc.settings=AL.settings(saved.settings);applySettings();restoring=false;caretEnd();markDirty(false);historyButtons();}
 function markDirty(addHistory=true){if(restoring)return;dirty=true;generation++;if(addHistory)historyPush();updateCount();emergency();status('Guardando neste navegador…');clearTimeout(saveTimer);saveTimer=setTimeout(persist,300);}
 async function persist(){
  clearTimeout(saveTimer);if(saveTask)return saveTask;if(!dirty)return true;
  saveTask=(async()=>{
   try{
    while(dirty){
     const currentGeneration=generation, captured=capture();
     status('Guardando neste navegador…');
     const result=await store.save(captured);
     doc.id=result.doc.id;doc.revision=result.doc.revision;doc.createdAt=result.doc.createdAt;doc.updatedAt=result.doc.updatedAt;
     if(result.conflict){title.value=result.doc.title;toast('Outra aba também editou este texto. Guardamos as duas versões em Meus textos.');}
     setCurrent(doc.id);
     if(currentGeneration===generation){dirty=false;doc={...doc,...capture()};clearEmergency();status('Guardado neste navegador','ok');}
     else emergency();
    }
    return true;
   }catch(error){status('Não foi possível guardar. Baixe uma cópia antes de sair.','error');console.warn('ApertaLetra: falha de salvamento',error?.name||'erro');return false;}
   finally{saveTask=null;}
  })();return saveTask;
 }
 function rememberRange(){const sel=window.getSelection();if(sel.rangeCount&&editor.contains(sel.anchorNode)&&editor.contains(sel.focusNode))range=sel.getRangeAt(0).cloneRange();}
 function restoreRange(){
  editor.focus();const sel=window.getSelection();
  if(range&&editor.contains(range.commonAncestorContainer)){
   const live=sel.rangeCount?sel.getRangeAt(0):null;
   // Replacing an identical collapsed range discards the browser's pending styles.
   if(!live||live.startContainer!==range.startContainer||live.startOffset!==range.startOffset||live.endContainer!==range.endContainer||live.endOffset!==range.endOffset){sel.removeAllRanges();sel.addRange(range);}
  }else caretEnd();
 }
 function caretEnd(){editor.focus();const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);range=r.cloneRange();}
 function normalizeTypography(){
  for(const font of editor.querySelectorAll('font')){
   const size=AL.HTML_SIZES[font.getAttribute('size')];if(size)font.style.fontSize=size+'px';
   const face=AL.fontKey(font.getAttribute('face'));if(face)font.style.fontFamily=AL.fontStack(face);
  }
 }
 function format(command,value=null){
  restoreRange();
  // Isolated legacy browser adapter, intentionally replaceable. execCommand is
  // deprecated; formatting is covered by DOM tests in this prototype. No HTML input.
  // Replace this adapter with a bundled editor engine before broad compatibility claims.
  try{document.execCommand('styleWithCSS',false,false);document.execCommand(command,false,value);normalizeTypography();rememberRange();markDirty();updateToolbar();document.dispatchEvent(new Event('al:format'));}catch{toast('Este navegador não aplicou a formatação. Seu texto foi mantido.');}
 }
 function updateToolbar(){for(const btn of document.querySelectorAll('[data-command]')){if(['bold','italic','underline'].includes(btn.dataset.command)){try{btn.setAttribute('aria-pressed',String(document.queryCommandState(btn.dataset.command)));}catch{}}}}
 function showDocument(next){restoring=true;doc={...next,settings:AL.settings(next.settings)};title.value=doc.title;editor.innerHTML=AL.cleanHTML(doc.html);applySettings();dirty=false;range=null;history=[];historyAt=-1;historyPush();restoring=false;updateCount();status(doc.revision?'Guardado neste navegador':'Pronto para escrever',doc.revision?'ok':'pending');setCurrent(doc.id);document.dispatchEvent(new Event('al:document'));}
 async function newDocument(){if(!await persist()){toast('Antes de começar outro texto, resolva o salvamento. Seu texto continua aberto.');return;}clearEmergency();showDocument(AL.fresh());resetInsertion();}
 function resetInsertion(){
  caretEnd();
  if(editor.textContent)return;
  try{
   document.execCommand('fontName',false,AL.fontStack(doc.settings.font));
   document.execCommand('fontSize',false,Object.keys(AL.HTML_SIZES).find(k=>AL.HTML_SIZES[k]===doc.settings.size)||'5');
   document.execCommand('foreColor',false,getComputedStyle(editor).color);
   for(const command of ['bold','italic','underline'])if(document.queryCommandState(command))document.execCommand(command,false,null);
  }catch{}
  rememberRange();document.dispatchEvent(new Event('al:format'));
 }
 function download(content,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 function exportCurrent(kind){try{const current=kind==='txt'?{title:title.value,plain:editor.innerText}:capture();download(kind==='txt'?current.plain:AL.exportFile(current),AL.filename(current.title)+(kind==='txt'?'.txt':'.apertaletra'),kind==='txt'?'text/plain;charset=utf-8':'application/json');$('downloadDialog').close();toast('Download solicitado. Confira a pasta de downloads para guardar sua cópia.');}catch(error){toast(error.message);}}
 async function importSelected(file){
  if(!file)return;
  try{
   if(file.size>AL.MAX_FILE_BYTES)throw new Error('Abra um arquivo de até 1 MB.');
   const imported=AL.importFile(file.name,await file.text());
   if(!await persist())throw new Error('Não foi possível guardar o texto atual. Ele continua aberto.');
   showDocument(imported);markDirty();await persist();toast('Arquivo aberto como uma nova produção. O texto anterior foi mantido.');
  }catch(error){toast(error.message||'Não foi possível abrir o arquivo. Seu texto foi mantido.');}
  finally{$('fileInput').value='';}
 }
 async function library(){
  await persist();$('documentList').replaceChildren();$('libraryDialog').showModal();
  try{
   const docs=await store.list();
   if(!docs.length){const p=document.createElement('p');p.textContent='Sua biblioteca começa com a primeira ideia. Escreva e ela será guardada aqui.';$('documentList').append(p);return;}
   for(const item of docs){
    const row=document.createElement('div');row.className='doc-row';const open=document.createElement('button');open.className='doc-open';
    const name=document.createElement('strong');name.textContent=item.title||'Texto sem título';const date=document.createElement('span');date.textContent=new Date(item.updatedAt).toLocaleString('pt-BR')+(item.id===doc.id?' • aberto agora':'');open.append(name,date);
    open.addEventListener('click',async()=>{if(!await persist())return;try{const latest=await store.get(item.id);if(!latest){toast('O texto foi removido em outra aba. Atualize a biblioteca.');return;}AL.validateDocument(latest);showDocument(latest);$('libraryDialog').close();editor.focus();}catch{toast('Não foi possível abrir essa produção. O texto atual foi mantido.');}});
    const remove=document.createElement('button');remove.className='doc-delete';remove.textContent='Excluir';remove.setAttribute('aria-label','Excluir '+(item.title||'texto sem título'));
    remove.addEventListener('click',async()=>{
     if(!confirm('Excluir este texto deste navegador? Baixe uma cópia antes. Esta ação não pode ser desfeita.'))return;
     try{await store.remove(item.id,item.revision);if(item.id===doc.id){clearEmergency();showDocument(AL.fresh());}row.remove();toast('Texto excluído deste navegador. Arquivos já baixados não foram alterados.');}catch(e){toast(e.message);}
    });row.append(open,remove);$('documentList').append(row);
   }
  }catch{const p=document.createElement('p');p.textContent='Não foi possível acessar a biblioteca. Baixe uma cópia do texto aberto.';$('documentList').append(p);}
 }
 // Plain-text paste avoids remote images, hidden markup and injected handlers.
 editor.addEventListener('paste',event=>{
  event.preventDefault();const pasted=event.clipboardData?.getData('text/plain')||'';if(!pasted)return;
  if(text().length+pasted.length>AL.MAX_TEXT){toast('Este trecho ultrapassa o limite de tamanho desta versão.');return;}
  const selection=window.getSelection();if(!selection.rangeCount)return;const r=selection.getRangeAt(0);if(!editor.contains(r.commonAncestorContainer))return;
  r.deleteContents();const fragment=document.createDocumentFragment();pasted.replace(/\r\n?/g,'\n').split('\n').forEach((line,i)=>{if(i)fragment.append(document.createElement('br'));fragment.append(document.createTextNode(line));});const last=fragment.lastChild;r.insertNode(fragment);if(last){r.setStartAfter(last);r.collapse(true);selection.removeAllRanges();selection.addRange(r);}rememberRange();markDirty();
 });
 editor.addEventListener('drop',event=>{event.preventDefault();toast('Use Abrir arquivo para trazer um texto. Imagens não fazem parte desta versão.');});
 editor.addEventListener('input',()=>{try{normalizeTypography();markDirty();}catch(error){status('Texto muito grande. Baixe ou reduza antes de sair.','error');toast(error.message);}});
 editor.addEventListener('keyup',()=>{rememberRange();updateToolbar();});editor.addEventListener('mouseup',()=>{rememberRange();updateToolbar();});editor.addEventListener('blur',rememberRange);
 title.addEventListener('input',()=>markDirty());
 document.querySelectorAll('[data-command],[data-color]').forEach(btn=>{btn.addEventListener('pointerdown',event=>event.preventDefault());btn.addEventListener('click',()=>format(btn.dataset.command||'foreColor',btn.dataset.color));});
 $('fontSelect').addEventListener('change',()=>format('fontName',AL.fontStack($('fontSelect').value)));
 $('sizeSelect').addEventListener('change',()=>{
  const size=Number($('sizeSelect').value), native=Object.keys(AL.HTML_SIZES).find(k=>AL.HTML_SIZES[k]===size);
  if(native)format('fontSize',native);
 });
 $('undoBtn').onclick=()=>historyMove(-1);$('redoBtn').onclick=()=>historyMove(1);$('newBtn').onclick=newDocument;$('libraryBtn').onclick=library;$('helpBtn').onclick=()=>$('helpDialog').showModal();
 $('downloadBtn').onclick=()=>$('downloadDialog').showModal();$('editableBtn').onclick=()=>exportCurrent('editable');$('txtBtn').onclick=()=>exportCurrent('txt');
 $('openBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=event=>importSelected(event.target.files[0]);
 $('printBtn').onclick=()=>{persist();$('printTitle').textContent=title.value;window.print();};window.addEventListener('beforeprint',()=>$('printTitle').textContent=title.value);
 function focusMode(on){document.body.classList.toggle('focus-mode',on);$('focusBtn').setAttribute('aria-pressed',String(on));$('focusBtn').setAttribute('aria-label',on?'Sair do modo foco':'Modo foco');$('focusBtn').querySelector('.control-label').textContent=on?'Voltar':'Foco';}
 $('focusBtn').onclick=()=>focusMode(!document.body.classList.contains('focus-mode'));
 document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>btn.closest('dialog').close());
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('focus-mode')){focusMode(false);}
  if(!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase();const isEditor=document.activeElement===editor||editor.contains(document.activeElement);
  if(key==='s'){event.preventDefault();$('downloadDialog').showModal();}
  if((key==='z'||key==='y')&&!document.querySelector('dialog[open]')){event.preventDefault();historyMove(key==='y'||event.shiftKey?1:-1);}
  if(isEditor&&['b','i','u'].includes(key)){event.preventDefault();format({b:'bold',i:'italic',u:'underline'}[key]);}
 });
 window.addEventListener('beforeunload',event=>{if(dirty){emergency();event.preventDefault();event.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty){emergency();persist();}});
 async function recover(){
  let recovered=null;const keys=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(RECOVERY)&&k!==recoveryKey)keys.push(k);}}catch{return null;}
  for(const key of keys){try{const entry=JSON.parse(localStorage.getItem(key));const value=AL.validateDocument(entry);const old=await store.get(entry.id);if(!old||old.html!==value.html||old.title!==value.title||JSON.stringify(old.settings)!==JSON.stringify(value.settings)){const result=await store.save({...AL.fresh(),...value,title:(value.title||'Meu texto').slice(0,105)+' (recuperado)'});recovered=result.doc;}localStorage.removeItem(key);}catch{/* Keep unrecognized recovery records. Never silently delete a failed recovery. */}}
  return recovered;
 }
 async function start(){
  editor.contentEditable='false';title.disabled=true;
  try{await store.open();const recovered=await recover();let currentId=null;try{currentId=localStorage.getItem(CURRENT);}catch{}const current=recovered||(currentId?await store.get(currentId):null);if(current){AL.validateDocument(current);showDocument(current);}else showDocument(AL.fresh());if(recovered)toast('Recuperamos uma produção interrompida. Ela está em Meus textos.');}
  catch{showDocument(AL.fresh());status('Armazenamento indisponível. Baixe uma cópia antes de sair.','error');}
  finally{editor.contentEditable='true';title.disabled=false;document.documentElement.dataset.ready='true';}
  if('serviceWorker'in navigator&&location.protocol.startsWith('http')&&!window.AL_PORTABLE){
   navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>$('offlineStatus').textContent='Cache offline instalado. Após a primeira carga, este endereço pode reabrir sem conexão; limpar dados do navegador remove o cache e as produções.').catch(()=>{$('offlineStatus').textContent='O cache offline não foi instalado. Mantenha a página aberta ou use o arquivo portátil.';});
  }
 }
 start();
})();

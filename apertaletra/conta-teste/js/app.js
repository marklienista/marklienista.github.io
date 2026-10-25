'use strict';
(() => {
 const $=id=>document.getElementById(id), freeEditor=$('editor'), title=$('docTitle');
 let store=null, epoch=0, context={};
 const recipeEditors=[$('ingredientsEditor'),$('preparationEditor')];
 let editors=[freeEditor,...recipeEditors];
 let editor=freeEditor,switching=false;
 let CURRENT='', RECOVERY='', recoveryKey='';
 let doc=AL.fresh(),dirty=false,generation=0,saveTask=null,saveTimer=null,range=null,history=[],historyAt=-1,toastTimer=null,restoring=false;
 function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
 function status(text,state='pending'){$('saveStatus').textContent=text;$('saveStatus').dataset.state=state;const indicator=$('saveIndicator');if(indicator){indicator.dataset.state=state;indicator.title=text;}}
 function syncStatus(value){const label=context.mode==='model'?'Rascunho da proposta neste navegador':context.mode==='student'&&value==='synced'?'Salvo para o professor':ALOnline.stateLabel(value);status(label,value==='synced'?'ok':value==='conflict'||value==='unavailable'?'error':'pending');}
 function setCurrent(id){try{localStorage.setItem(CURRENT,id);}catch{/* IndexedDB can still work when localStorage is unavailable. */}}
 function isRecipe(){return AL.kind(doc)==='recipe';}
 function isStructured(){return AL.kind(doc)!=='free';}
 function activeFields(){return AL.GENRES[AL.kind(doc)]?.fields||[];}
 function writingEditors(){return isStructured()?activeFields().map(f=>$(f.id+'Editor')): [freeEditor];}
 function text(){return writingEditors().map(e=>AL.textFromHTML(e.innerHTML)).join('\n');}
 function capture(){
  const raw={...doc,title:title.value.slice(0,120),html:freeEditor.innerHTML,settings:{...doc.settings}};
  if(isStructured())raw.blocks=activeFields().map(f=>({id:f.id,html:$(f.id+'Editor').innerHTML}));
  return {...doc,...AL.validateDocument(raw)};
 }
 function activate(field){
  if(editor!==field){editor=field;range=null;}
  document.querySelectorAll('.recipe-section').forEach(s=>s.classList.toggle('active-section',s.contains(editor)));
 }
 // Presentation controls consult the active writing block; they never own the document.
 globalThis.ALEditor={active:()=>editor};
 function setEditing(enabled){
 const locks=context.locked||[];
 editors.forEach(e=>{const field=e.dataset.field||(e===freeEditor?'body':null);const off=!enabled||context.readOnly||locks.includes(field);e.contentEditable=String(!off);e.setAttribute('aria-readonly',String(!!off));e.closest('.recipe-section')?.classList.toggle('provided-section',locks.includes(field));});
 title.disabled=!enabled||!!context.readOnly||locks.includes('title');
 }
 function setPolicy(next){context={...context,...next};setEditing(!switching);}

 function renderDocument(value,activeId){
  const type=AL.kind(value),spec=AL.GENRES[type];
  title.value=value.title;
  freeEditor.hidden=!!spec;$('recipeSheet').hidden=type!=='recipe';$('structuredSheet').hidden=!spec||type==='recipe';
  document.querySelector('.paper').dataset.kind=type;
  freeEditor.innerHTML=spec?'':value.html;
  const parent=$('structuredSheet');parent.replaceChildren();
  const dynamic=[];
  if(spec&&type!=='recipe')for(const field of spec.fields){
   const section=document.createElement('section');section.className='recipe-section';
   const heading=document.createElement('h2');heading.className='recipe-caption';heading.id=field.id+'Heading';heading.setAttribute('aria-label',field.label);
   const icon=document.createElement('span');icon.className='field-glyph';icon.setAttribute('aria-hidden','true');icon.textContent=field.symbol||'✎';
   const label=document.createElement('span');label.className='control-label';label.textContent=field.label;
   heading.append(icon,label);section.setAttribute('aria-labelledby',heading.id);
   const input=document.createElement('div');input.id=field.id+'Editor';input.className='writing-field recipe-field';input.dataset.field=field.id;
   input.contentEditable='false';input.setAttribute('role','textbox');input.setAttribute('aria-label',field.label);input.setAttribute('aria-multiline','true');input.setAttribute('spellcheck','false');input.setAttribute('autocorrect','off');input.setAttribute('autocapitalize','off');input.tabIndex=0;
   section.append(heading,input);parent.append(section);dynamic.push(input);bindEditor(input);
  }
  editors=[freeEditor,...recipeEditors,...dynamic];
  if(spec)for(const field of spec.fields)$(field.id+'Editor').innerHTML=value.blocks.find(b=>b.id===field.id)?.html||field.empty||'';
  $('freeCopyBtn').hidden=!spec;$('recipeNameMarker').hidden=!spec;
  const titleLabel=spec?.titleLabel||'Título do texto';
  const marker=$('recipeNameMarker');let symbol=$('genreTitleSymbol');
  if(!symbol){symbol=document.createElement('span');symbol.id='genreTitleSymbol';symbol.className='field-glyph';symbol.setAttribute('aria-hidden','true');marker.insertBefore(symbol,marker.querySelector('.control-label'));}
  marker.querySelector('svg').hidden=type!=='recipe';symbol.hidden=type==='recipe';symbol.textContent=spec?.symbol||'';
  marker.querySelector('.control-label').textContent=titleLabel;
  title.setAttribute('aria-label',titleLabel);title.title=spec?titleLabel:'';
  const select=$('selectAllBtn'),label=spec?'Selecionar todo o bloco':'Selecionar todo o texto';
  select.setAttribute('aria-label',label);select.title=label;select.querySelector('.control-label').textContent=spec?'Escolher bloco':'Escolher tudo';
  activate(spec?(writingEditors().find(e=>e.id===activeId)||writingEditors()[0]):freeEditor);
  setEditing(!switching);applySettings();
 }
 function emergency(){if(!store||!recoveryKey)return;try{localStorage.setItem(recoveryKey,JSON.stringify({...capture(),emergencyAt:Date.now()}));}catch{/* Remain dirty until the IndexedDB transaction commits. */}}
 function clearEmergency(){try{if(recoveryKey)localStorage.removeItem(recoveryKey);}catch{}}
 function updateCount(){const value=text().trim();$('wordCount').textContent=`${value?value.split(/\s+/u).length:0} palavras`;}
 function applySettings(){editors.forEach(e=>{e.style.fontFamily=AL.fontStack(doc.settings.font);e.style.fontSize=doc.settings.size+'px';});$('fontSelect').value=doc.settings.font;$('sizeSelect').value=doc.settings.size;}
 function snapshot(){return JSON.stringify({value:AL.validateDocument(capture()),activeId:editor.id});}
 function historyPush(){const current=snapshot();if(history[historyAt]===current)return;history=history.slice(0,historyAt+1);history.push(current);let total=history.reduce((n,s)=>n+s.length,0);while(history.length>2&&(history.length>100||total>5000000))total-=history.shift().length;historyAt=history.length-1;historyButtons();}
 function historyButtons(){$('undoBtn').disabled=historyAt<=0;$('redoBtn').disabled=historyAt>=history.length-1;}
 function historyMove(step){
  const target=historyAt+step;if(target<0||target>=history.length||switching||context.readOnly)return;
  historyAt=target;const saved=JSON.parse(history[historyAt]);restoring=true;
  doc={...doc,...saved.value};renderDocument(saved.value,saved.activeId);restoring=false;
  range=null;caretEnd();markDirty(false);historyButtons();document.dispatchEvent(new Event('al:document'));
 }
 function markDirty(addHistory=true){if(restoring||!store)return;dirty=true;generation++;if(addHistory)historyPush();updateCount();emergency();status('Preservando rascunho…');clearTimeout(saveTimer);saveTimer=setTimeout(persist,300);}
 async function persist(){
  clearTimeout(saveTimer);if(saveTask)return saveTask;if(!dirty||!store)return true;
  const savedEpoch=epoch,activeStore=store;
  saveTask=Promise.resolve().then(async()=>{
   try{
    while(dirty){
     const currentGeneration=generation, captured=capture();
     status('Preservando rascunho…');
     const result=await activeStore.save(captured);
     if(savedEpoch!==epoch)return false;
     doc.id=result.doc.id;doc.revision=result.doc.revision;doc.createdAt=result.doc.createdAt;doc.updatedAt=result.doc.updatedAt;doc.syncState=result.syncState;doc.cloudRevision=result.doc.cloudRevision;
     if(result.conflict){title.value=result.doc.title;toast('Outra aba também editou este texto. Guardamos as duas versões em Meus textos.');}
     setCurrent(doc.id);
     if(currentGeneration===generation){dirty=false;doc={...doc,...capture()};clearEmergency();syncStatus(result.syncState);}
     else emergency();
    }
    return true;
   }catch(error){status('Não foi possível guardar. Baixe uma cópia antes de sair.','error');console.warn('ApertaLetra: falha de salvamento',error?.name||'erro');return false;}
   finally{saveTask=null;}
  });return saveTask;
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
 function crossBlockSelection(){const s=getSelection();return !!(isStructured()&&s.rangeCount&&!s.isCollapsed&&!(editor.contains(s.anchorNode)&&editor.contains(s.focusNode)));}
 function format(command,value=null){
  if(switching||context.readOnly||editor.contentEditable==='false')return;
  if(crossBlockSelection()){toast('Escolha um trecho dentro de um bloco.');return;}
  restoreRange();
  // Isolated legacy browser adapter, intentionally replaceable. execCommand is
  // deprecated; formatting is covered by DOM tests in this prototype. No HTML input.
  // Replace this adapter with a bundled editor engine before broad compatibility claims.
  try{document.execCommand('styleWithCSS',false,false);document.execCommand(command,false,value);normalizeTypography();rememberRange();markDirty();updateToolbar();document.dispatchEvent(new Event('al:format'));}catch{toast('Este navegador não aplicou a formatação. Seu texto foi mantido.');}
 }
 function updateToolbar(){for(const btn of document.querySelectorAll('[data-command]')){if(['bold','italic','underline'].includes(btn.dataset.command)){try{btn.setAttribute('aria-pressed',String(document.queryCommandState(btn.dataset.command)));}catch{}}}}
 function showDocument(next){
  const checked=AL.validateDocument(next);restoring=true;doc={...next,...checked};
  renderDocument(checked);dirty=false;range=null;history=[];historyAt=-1;historyPush();restoring=false;
  updateCount();syncStatus(doc.syncState);
  setCurrent(doc.id);document.dispatchEvent(new Event('al:document'));
 }
 async function switchDocument(makeNext){
  if(switching)return false;switching=true;setEditing(false);
  try{
   if(!await persist()){toast('Antes de começar outro texto, resolva o salvamento. Seu texto continua aberto.');return false;}
   const next=await makeNext();clearEmergency();showDocument(next);return true;
  }finally{switching=false;setEditing(true);}
 }
 async function newDocument(type='free'){
  if(context.bound)return false;
  if(await switchDocument(()=>AL.fresh(type))){
   $('newDialog').close();resetInsertion();
   // Keep even an empty structured draft, including its fixed fields, across a later load.
   if(type!=='free')markDirty();
  }
 }
 async function freeCopy(){
  if(!isStructured()||context.bound)return;
  if(await switchDocument(()=>AL.asFree(capture()))){
   $('settingsDialog').close();resetInsertion();markDirty();
   toast('Cópia em escrita livre criada. O texto original continua em Meus textos.');
  }
 }
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
 function exportCurrent(kind){try{const current=kind==='txt'?{title:title.value}:capture(),plain=kind==='txt'?(isStructured()?[title.value,...activeFields().flatMap(f=>[f.label,$(f.id+'Editor').innerText])].join('\n\n'):freeEditor.innerText):'';download(kind==='txt'?plain:AL.exportFile(current),AL.filename(current.title)+(kind==='txt'?'.txt':'.apertaletra'),kind==='txt'?'text/plain;charset=utf-8':'application/json');$('downloadDialog').close();toast('Download solicitado. Confira a pasta de downloads para guardar sua cópia.');}catch(error){toast(error.message);}}
 async function importSelected(file){
  if(!file||context.bound)return;
  try{
   if(file.size>AL.MAX_FILE_BYTES)throw new Error('Abra um arquivo de até 1 MB.');
   const imported=AL.importFile(file.name,await file.text());
   if(!await switchDocument(()=>imported))return;
   markDirty();const saved=await persist();toast(saved?'Arquivo aberto como uma nova produção. O texto anterior foi mantido.':'Arquivo aberto, mas o salvamento falhou. Mantenha sua cópia baixada.');
  }catch(error){toast(error.message||'Não foi possível abrir o arquivo. Seu texto foi mantido.');}
  finally{$('fileInput').value='';}
 }
 function bindEditor(field){
 field.addEventListener('focus',()=>activate(field));
 field.addEventListener('pointerdown',()=>activate(field));
 field.addEventListener('beforeinput',event=>{if(crossBlockSelection())event.preventDefault();});
 // Plain-text paste avoids remote images, hidden markup and injected handlers.
 field.addEventListener('paste',event=>{
  event.preventDefault();if(context.readOnly||field.contentEditable==='false')return;activate(field);const pasted=event.clipboardData?.getData('text/plain')||'';if(!pasted)return;
  if(text().length+pasted.length>AL.MAX_TEXT){toast('Este trecho ultrapassa o limite de tamanho desta versão.');return;}
  const selection=window.getSelection();if(!selection.rangeCount)return;const r=selection.getRangeAt(0);if(!editor.contains(r.commonAncestorContainer))return;
  r.deleteContents();const fragment=document.createDocumentFragment();pasted.replace(/\r\n?/g,'\n').split('\n').forEach((line,i)=>{if(i)fragment.append(document.createElement('br'));fragment.append(document.createTextNode(line));});const last=fragment.lastChild;r.insertNode(fragment);if(last){r.setStartAfter(last);r.collapse(true);selection.removeAllRanges();selection.addRange(r);}rememberRange();markDirty();
 });
 field.addEventListener('drop',event=>{event.preventDefault();toast('Use Abrir arquivo para trazer um texto. Imagens não fazem parte desta versão.');});
 field.addEventListener('input',()=>{activate(field);try{normalizeTypography();markDirty();}catch(error){status('Texto muito grande. Baixe ou reduza antes de sair.','error');toast(error.message);}});
 field.addEventListener('keyup',()=>{rememberRange();updateToolbar();});field.addEventListener('mouseup',()=>{rememberRange();updateToolbar();}); field.addEventListener('blur',rememberRange);
 }
 for(const field of editors)bindEditor(field);
 title.addEventListener('input',()=>{try{markDirty();}catch(error){status('Baixe uma cópia em texto simples antes de sair.','error');toast(error.message);}});
 document.querySelectorAll('[data-command],[data-color]').forEach(btn=>{btn.addEventListener('pointerdown',event=>event.preventDefault());btn.addEventListener('click',()=>format(btn.dataset.command||'foreColor',btn.dataset.color));});
 $('fontSelect').addEventListener('change',()=>format('fontName',AL.fontStack($('fontSelect').value)));
 $('sizeSelect').addEventListener('change',()=>{
  const size=Number($('sizeSelect').value), native=Object.keys(AL.HTML_SIZES).find(k=>AL.HTML_SIZES[k]===size);
  if(native)format('fontSize',native);
 });
 $('undoBtn').onclick=()=>historyMove(-1);$('redoBtn').onclick=()=>historyMove(1);$('newBtn').onclick=()=>{if(!switching)$('newDialog').showModal();};
 $('newFreeBtn').onclick=()=>newDocument('free');$('newRecipeBtn').onclick=()=>newDocument('recipe');
 for(const [id,type] of [['newListBtn','list'],['newNoteBtn','note'],['newInvitationBtn','invitation'],['newPoemBtn','poem']])$(id).onclick=()=>newDocument(type);
 $('freeCopyBtn').onclick=freeCopy;
 $('libraryBtn').onclick=()=>document.dispatchEvent(new Event('al:library'));$('helpBtn').onclick=()=>$('helpDialog').showModal();
 $('downloadBtn').onclick=()=>$('downloadDialog').showModal();$('editableBtn').onclick=()=>exportCurrent('editable');$('txtBtn').onclick=()=>exportCurrent('txt');
 $('openBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=event=>importSelected(event.target.files[0]);
 $('printBtn').onclick=()=>{persist();$('printTitle').textContent=title.value;window.print();};window.addEventListener('beforeprint',()=>$('printTitle').textContent=title.value);
 function focusMode(on){document.body.classList.toggle('focus-mode',on);$('focusBtn').setAttribute('aria-pressed',String(on));$('focusBtn').setAttribute('aria-label',on?'Sair do modo foco':'Modo foco');$('focusBtn').querySelector('.control-label').textContent=on?'Voltar':'Foco';}
 $('focusBtn').onclick=()=>focusMode(!document.body.classList.contains('focus-mode'));
 document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>btn.closest('dialog').close());
 document.addEventListener('keydown',event=>{
  if(!store||$('editorRoot').hidden)return;
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
  for(const key of keys){try{const entry=JSON.parse(localStorage.getItem(key));const value=AL.validateDocument(entry);const old=await store.get(entry.id);if(!old||JSON.stringify(AL.validateDocument(old))!==JSON.stringify(value)){const result=await store.save({...AL.fresh(),...value,title:(value.title||'Meu texto').slice(0,105)+' (recuperado)'});recovered=result.doc;}localStorage.removeItem(key);}catch{/* Keep unrecognized recovery records. Never silently delete a failed recovery. */}}
  return recovered;
 }
 async function mount(nextStore,selected=null,policy={}){
  context=policy;
  epoch++;clearTimeout(saveTimer);store=nextStore;dirty=false;saveTask=null;switching=true;setEditing(false);
  CURRENT='apertaletra:online-current:'+store.scope;
  RECOVERY='apertaletra:online-emergency:'+store.scope+':';recoveryKey=RECOVERY+AL.id();
  const mountedEpoch=epoch;
  try{
   await store.open();const recovered=context.bound?null:await recover();let currentId=null;try{currentId=localStorage.getItem(CURRENT);}catch{}
   const current=selected||recovered||(currentId?await store.get(currentId):null);
   if(mountedEpoch!==epoch)return;
   showDocument(current||AL.fresh());setEditing(true);if(recovered)toast('Rascunho recuperado. Confira o estado de sincronização.');
  }catch{
   if(mountedEpoch!==epoch)return;
   showDocument(AL.fresh());status('Recuperação local indisponível. Baixe uma cópia antes de sair.','error');
  }finally{if(mountedEpoch===epoch){switching=false;setEditing(true);document.documentElement.dataset.ready='true';}}
 }
 function unmount(){
  epoch++;clearTimeout(saveTimer);store=null;dirty=false;saveTask=null;range=null;history=[];historyAt=-1;
  context={};title.value='';editors.forEach(e=>e.replaceChildren());doc=AL.fresh();CURRENT='';RECOVERY='';recoveryKey='';
  document.querySelectorAll('#editorRoot dialog[open]').forEach(d=>d.close());focusMode(false);setEditing(false);
  $('toast').textContent='';$('toast').hidden=true;historyButtons();
 }
 Object.assign(globalThis.ALEditor,{mount,unmount,persist,capture,setPolicy,isDirty:()=>dirty,download:exportCurrent,newDocument,
  async retry(){if(!store)return;await persist();const active=store,e=epoch;await active.sync(doc.id);const latest=await active.get(doc.id);if(e===epoch&&latest&&!dirty)showDocument(latest);},
  hasLocalWork:()=>dirty||['local','conflict','cached','unavailable'].includes(doc.syncState)
 });
 setEditing(false);
 if('serviceWorker' in navigator && location.protocol.startsWith('http')&&!window.AL_PORTABLE){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
 }
})();

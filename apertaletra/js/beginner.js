/* Presentation preferences and visual controls. Local only; does not change document defaults. */
'use strict';
(() => {
 const $=id=>document.getElementById(id),editor=$('editor'),font=$('fontSelect'),size=$('sizeSelect');
 const KEY='apertaletra:presentation:v1';
 let mode='symbols';try{const saved=localStorage.getItem(KEY);if(['symbols','both','text'].includes(saved))mode=saved;}catch{}
 function setMode(value){
  document.body.dataset.mode=value;
  document.querySelectorAll('[data-mode-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modeChoice===value)));
  try{localStorage.setItem(KEY,value);}catch{}
 }
 document.querySelectorAll('[data-mode-choice]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.modeChoice)));
 setMode(mode);
 $('settingsBtn').onclick=()=>$('settingsDialog').showModal();
 $('exportOptionsBtn').onclick=()=>{$('settingsDialog').close();$('downloadDialog').showModal();};
 // The primary download is always a single action, including for non-readers.
 $('downloadBtn').onclick=()=>$('editableBtn').click();
 function apply(control,value){control.value=String(value);control.dispatchEvent(new Event('change',{bubbles:true}));sync();}
 document.querySelectorAll('[data-font]').forEach(b=>{b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>apply(font,b.dataset.font));});
 for(const [id,step] of [['smallerBtn',-1],['largerBtn',1]]){
  $(id).addEventListener('pointerdown',e=>e.preventDefault());
  $(id).addEventListener('click',()=>{const current=Number(size.value)||24,list=step>0?AL.STEP_SIZES:[...AL.STEP_SIZES].reverse(),next=list.find(n=>step>0?n>current:n<current);if(next)apply(size,next);});
 }
 $('selectAllBtn').addEventListener('click',()=>{editor.focus();const r=document.createRange();r.selectNodeContents(editor);const s=getSelection();s.removeAllRanges();s.addRange(r);editor.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));sync();});
 function sync(){
  const s=getSelection(),inside=s.rangeCount&&editor.contains(s.anchorNode)&&editor.contains(s.focusNode);
  let currentFont=AL.fontKey(editor.style.fontFamily)||'Arial',currentSize=parseFloat(editor.style.fontSize)||24;
  if(inside){
   const el=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement;
   const style=getComputedStyle(el);currentFont=AL.fontKey(style.fontFamily)||currentFont;currentSize=parseFloat(style.fontSize)||currentSize;
   // Native commands also carry a pending style at an empty insertion point.
   try{currentFont=AL.fontKey(document.queryCommandValue('fontName'))||currentFont;const native=Number(document.queryCommandValue('fontSize'));if(s.isCollapsed&&AL.HTML_SIZES[native])currentSize=AL.HTML_SIZES[native];}catch{}
  }
  if(!AL.SIZES.includes(currentSize))currentSize=AL.STEP_SIZES.reduce((a,b)=>Math.abs(b-currentSize)<Math.abs(a-currentSize)?b:a,24);
  font.value=currentFont;size.value=currentSize;
  document.querySelectorAll('[data-font]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===currentFont)));
  $('sizeValue').value=currentSize;$('smallerBtn').disabled=currentSize<=AL.STEP_SIZES[0];$('largerBtn').disabled=currentSize>=AL.STEP_SIZES.at(-1);
  if(!inside)return;
  for(const b of document.querySelectorAll('[data-command]')){try{b.setAttribute('aria-pressed',String(document.queryCommandState(b.dataset.command)));}catch{}}
  let c='';try{c=document.queryCommandValue('foreColor');}catch{}
  const probe=document.createElement('span');for(const b of document.querySelectorAll('[data-color]')){probe.style.color=b.dataset.color;b.setAttribute('aria-pressed',String(probe.style.color===c));}
 }
 document.addEventListener('selectionchange',sync);document.addEventListener('al:format',sync);
 document.addEventListener('al:document',()=>queueMicrotask(sync));
 new MutationObserver(sync).observe(editor,{attributes:true,attributeFilter:['style']});
 document.querySelectorAll('[data-command],[data-color]').forEach(b=>b.addEventListener('click',sync));
 editor.addEventListener('input',sync);sync();
})();

/* Beginner controls. Keeps the existing storage and document format unchanged. */
'use strict';
(() => {
 const $=id=>document.getElementById(id), editor=$('editor'), font=$('fontSelect'), size=$('sizeSelect');
 function sync(){
  document.querySelectorAll('[data-font]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===font.value)));
  $('sizeValue').value=size.value;
  $('smallerBtn').disabled=AL.SIZES.indexOf(Number(size.value))<=0;
  $('largerBtn').disabled=AL.SIZES.indexOf(Number(size.value))>=AL.SIZES.length-1;
 }
 function apply(control,value){control.value=String(value);control.dispatchEvent(new Event('change',{bubbles:true}));sync();}
 document.querySelectorAll('[data-font]').forEach(b=>{b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>apply(font,b.dataset.font));});
 for(const [id,step] of [['smallerBtn',-1],['largerBtn',1]]){
  $(id).addEventListener('pointerdown',e=>e.preventDefault());
  $(id).addEventListener('click',()=>{const next=AL.SIZES[AL.SIZES.indexOf(Number(size.value))+step];if(next)apply(size,next);});
 }
 // An explicit, visible selection control avoids silently formatting other words.
 $('selectAllBtn').addEventListener('click',()=>{editor.focus();const r=document.createRange();r.selectNodeContents(editor);const s=getSelection();s.removeAllRanges();s.addRange(r);editor.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));selection();});
 function selection(){
  const s=getSelection(),inside=s.rangeCount&&editor.contains(s.anchorNode)&&editor.contains(s.focusNode);
  if(!inside)return;
  const selected=!s.isCollapsed;
  $('selectionHint').classList.toggle('has-selection',selected);
  $('selectionHint').textContent=selected?'Palavras escolhidas! Agora toque em uma cor ou em um efeito.':'Para cor e efeito, selecione palavras ou toque em Escolher tudo.';
  for(const b of document.querySelectorAll('[data-command]')){try{b.setAttribute('aria-pressed',String(document.queryCommandState(b.dataset.command)));}catch{}}
  let c='';try{c=document.queryCommandValue('foreColor');}catch{}
  const probe=document.createElement('span');
  for(const b of document.querySelectorAll('[data-color]')){probe.style.color=b.dataset.color;b.setAttribute('aria-pressed',String(probe.style.color===c));}
 }
 document.addEventListener('selectionchange',selection);
 document.querySelectorAll('[data-command],[data-color]').forEach(b=>b.addEventListener('click',selection));
 // Reflect undo, imported settings and reopened documents, not just button clicks.
 new MutationObserver(sync).observe(editor,{attributes:true,attributeFilter:['style']});
 font.addEventListener('change',sync);size.addEventListener('change',sync);sync();
})();

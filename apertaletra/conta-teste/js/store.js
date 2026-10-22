'use strict';
/* Storage boundary: UI can later use a cloud adapter without changing the file format.
 * No tokens, accounts, network requests or payment code belong in this local adapter.
 */
(() => {
 class DocStore{
  constructor(){this.db=null;this.openPromise=null;}
  open(){
   if(this.openPromise)return this.openPromise;
   this.openPromise=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Este navegador não permite guardar textos. Baixe uma cópia.'));return;}
    const req=indexedDB.open('apertaletra-local-v1',1);
    req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('documents',{keyPath:'id'});};
    req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>this.db.close();resolve(this);};
    req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Feche outras abas do ApertaLetra e tente novamente.'));
   });return this.openPromise;
  }
  async get(id){await this.open();return new Promise((res,rej)=>{const r=this.db.transaction('documents').objectStore('documents').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
  async list(){await this.open();return new Promise((res,rej)=>{const r=this.db.transaction('documents').objectStore('documents').getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));r.onerror=()=>rej(r.error);});}
  async save(doc){
   await this.open();const captured=structuredClone(doc);
   return new Promise((resolve,reject)=>{
    const tx=this.db.transaction('documents','readwrite'),store=tx.objectStore('documents');let saved,conflict=false;
    const r=store.get(captured.id);
    r.onsuccess=()=>{
     const existing=r.result;
     // Optimistic concurrency: never overwrite another tab's newer version.
     conflict=(existing&&existing.revision!==captured.revision)||(!existing&&captured.revision>0);
     const revision=conflict?1:(existing?.revision||0)+1;
     saved={...captured,id:conflict?AL.id():captured.id,title:conflict?(captured.title||'Meu texto').slice(0,100)+' (cópia de segurança)':captured.title,revision,updatedAt:new Date().toISOString()};
     store.put(saved);
    };
    tx.oncomplete=()=>resolve({doc:saved,conflict});tx.onerror=()=>reject(tx.error||new Error('Não foi possível guardar.'));tx.onabort=()=>reject(tx.error||new Error('O salvamento foi interrompido.'));
   });
  }
  async remove(id,revision){
   await this.open();return new Promise((res,rej)=>{const tx=this.db.transaction('documents','readwrite');const st=tx.objectStore('documents');const req=st.get(id);let conflict=false;req.onsuccess=()=>{if(req.result&&req.result.revision!==revision){conflict=true;tx.abort();}else st.delete(id);};tx.oncomplete=()=>res();tx.onabort=()=>rej(new Error(conflict?'Este texto mudou em outra aba. Reabra a biblioteca antes de excluir.':'Não foi possível excluir.'));tx.onerror=()=>rej(tx.error);});
  }
 }
 globalThis.ALStore=DocStore;
})();

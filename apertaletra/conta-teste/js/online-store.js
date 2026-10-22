'use strict';
/* Scoped recovery store. Does not read or migrate the legacy database automatically.
 * Cloud writes use CAS, not timestamp last-writer-wins. Status is based on ACKs.
 */
(() => {
 class DraftDB {
  constructor(){this.db=null;this.opening=null;}
  open(){
   if(this.opening)return this.opening;
   this.opening=new Promise((resolve,reject)=>{
    const r=indexedDB.open('apertaletra-recovery-v2',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});
    r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>this.db.close();resolve(this);};
    r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Feche outra aba de atualização e tente novamente.'));
   });return this.opening;
  }
  async get(scope,id){await this.open();return new Promise((yes,no)=>{const r=this.db.transaction('drafts').objectStore('drafts').get(scope+':'+id);r.onsuccess=()=>yes(r.result||null);r.onerror=()=>no(r.error);});}
  async list(scope){await this.open();return new Promise((yes,no)=>{const r=this.db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>yes(r.result.filter(x=>x.scope===scope));r.onerror=()=>no(r.error);});}
  async change(scope,id,fn){
   await this.open();return new Promise((yes,no)=>{
    const tx=this.db.transaction('drafts','readwrite'),st=tx.objectStore('drafts');let out,err;
    const r=st.get(scope+':'+id);r.onsuccess=()=>{try{out=fn(r.result||null);if(out)st.put({...out,key:scope+':'+id,scope});}catch(e){err=e;tx.abort();}};
    tx.oncomplete=()=>yes(out);tx.onerror=()=>no(err||tx.error);tx.onabort=()=>no(err||tx.error||new Error('Rascunho não guardado.'));
   });
  }
 }
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
 const canonical=value=>JSON.stringify(stable(value));
 class OnlineStore {
  constructor({owner=null,cloud=null,db=new DraftDB(),model=globalThis.AL}={}){
   this.owner=owner;this.scope=owner?'account:'+owner:'demo';this.cloud=cloud;this.db=db;this.model=model;this.queue=Promise.resolve();this.lastError=null;
  }
  open(){return this.db.open();}
  payload(doc){return JSON.parse(this.model.exportFile(doc));}
  decode(row){
   if(row.user_id!==this.owner)throw new Error('Acesso cruzado rejeitado.');
   const doc=this.model.importFile('online.apertaletra',JSON.stringify(row.payload));
   return {...doc,id:row.id,createdAt:row.created_at,updatedAt:row.updated_at,revision:0,syncState:'synced',cloudRevision:row.revision};
  }
  async get(id){
   let local=await this.db.get(this.scope,id);
   if(!this.owner)return local?.doc||null;
   try{
    const remote=await this.cloud.get(id,this.owner);this.lastError=null;
    if(local?.pending)return {...local.doc,syncState:local.state};
    if(!remote)return local?{...local.doc,syncState:'unavailable'}:null;
    const decoded=this.decode(remote);
    // Cache refresh never replaces a local pending edit created while request was in flight.
    local=await this.db.change(this.scope,id,old=>old?.pending?old:{doc:{...decoded,revision:(old?.doc.revision||0)+1},cloudRevision:remote.revision,pending:false,state:'synced',attempt:null});
    return {...local.doc,syncState:local.state};
   }catch(error){this.lastError=error;return local?{...local.doc,syncState:local.pending?local.state:'cached'}:null;}
  }
  async list(){
   let records=await this.db.list(this.scope);const items=new Map(records.map(x=>[x.doc.id,{...x.doc,syncState:x.state}]));
   if(this.owner){try{const remote=await this.cloud.list(this.owner);this.lastError=null;for(const row of remote){const local=records.find(x=>x.doc.id===row.id);if(!local?.pending)items.set(row.id,this.decode(row));}}catch(e){this.lastError=e;for(const item of items.values())if(item.syncState==='synced')item.syncState='cached';}}
   return [...items.values()].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  }
  async save(input){
   let id=input.id,localConflict=false,doc=structuredClone(input);
   const put=async()=>this.db.change(this.scope,id,old=>{
    if(old&&old.doc.revision!==doc.revision)throw Object.assign(new Error('Outra aba alterou o rascunho.'),{code:'local_conflict'});
    return {doc:{...doc,id,revision:(old?.doc.revision||0)+1,updatedAt:new Date().toISOString()},cloudRevision:old?.cloudRevision||0,pending:!!this.owner,state:this.owner?'local':'demo',attempt:old?.attempt||null};
   });
   let record;try{record=await put();}catch(error){if(error.code!=='local_conflict')throw error;localConflict=true;id=this.model.id();doc={...doc,id,revision:0,title:(doc.title||'Texto').slice(0,92)+' (cópia de segurança)'};record=await put();}
   const captured=record;
   if(this.owner)record=await this.sync(id);
   const state=record.doc.revision===captured.doc.revision?record.state:'local';
   return {doc:{...captured.doc,syncState:state,cloudRevision:record.cloudRevision},conflict:localConflict,syncState:state};
  }
  sync(id){const operation=this.queue.then(()=>this._sync(id));this.queue=operation.catch(()=>{});return operation;}
  async _sync(id){
   let record=await this.db.get(this.scope,id);if(!record||!record.pending||!this.owner)return record;
   try{
    const remote=await this.cloud.get(id,this.owner);
    if(remote)this.decode(remote); // Validate identity and format before using the response.
    let base=record.cloudRevision;
    // Lost ACK: recognize only the exact mutation AND exact payload, never just a timestamp.
    if(remote&&record.attempt&&remote.last_mutation_id===record.attempt.id&&canonical(remote.payload)===canonical(record.attempt.payload))base=remote.revision;
    if((remote&&remote.revision!==base)||(!remote&&base>0)){
     return await this.db.change(this.scope,id,old=>({...old,state:'conflict',pending:true}));
    }
    record=await this.db.change(this.scope,id,old=>({...old,cloudRevision:base}));
    const payload=this.payload(record.doc);
    if(remote&&canonical(remote.payload)===canonical(payload)){
     return await this.db.change(this.scope,id,old=>({...old,cloudRevision:remote.revision,pending:old.doc.revision!==record.doc.revision,state:old.doc.revision===record.doc.revision?'synced':'local',attempt:null}));
    }
    const attempt={id:this.model.id(),payload,localRevision:record.doc.revision};
    await this.db.change(this.scope,id,old=>({...old,attempt}));
    const ack=await this.cloud.save(id,payload,base,attempt.id,this.owner);this.decode(ack);
    if(ack.last_mutation_id!==attempt.id||canonical(ack.payload)!==canonical(payload))throw new Error('Confirmação da nuvem divergente.');
    this.lastError=null;
    return await this.db.change(this.scope,id,old=>({...old,cloudRevision:ack.revision,attempt:null,pending:old.doc.revision!==attempt.localRevision,state:old.doc.revision===attempt.localRevision?'synced':'local'}));
   }catch(error){
    this.lastError=error;const conflict=['40001','conflict'].includes(error.code);
    return await this.db.change(this.scope,id,old=>({...old,pending:true,state:conflict?'conflict':'local'}));
   }
  }
  async copyConflict(id){
   const record=await this.db.get(this.scope,id);if(!record)return null;
   // Preserve the conflicting draft and remote original; only an explicit adult action makes a copy.
   const copy={...record.doc,id:this.model.id(),revision:0,title:(record.doc.title||'Texto').slice(0,94)+' (cópia do rascunho)'};
   return (await this.save(copy)).doc;
  }
 }
 function stateLabel(state){return ({synced:'Sincronizado na conta',local:'Rascunho apenas neste navegador — não sincronizado',conflict:'Conflito: versão da nuvem preservada; seu rascunho está neste navegador',cached:'Cópia local da última sincronização — nuvem não consultada',demo:'Experimento fictício — somente neste navegador',unavailable:'Texto indisponível na nuvem; cópia local preservada'})[state]||'Ainda não sincronizado';}
 globalThis.ALOnline={DraftDB,OnlineStore,stateLabel};
 if(typeof module!=='undefined')module.exports=globalThis.ALOnline;
})();

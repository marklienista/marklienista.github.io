'use strict';
(() => {
 const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
 const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
 class API {
  constructor(cloud){this.cloud=cloud;this.token=null;}
  async call(action,data={},student=false){
   const actor=student?this.token:this.cloud.user?.id;
   const headers={'Content-Type':'application/json',apikey:AL_CONFIG.publishableKey};
   if(student){if(!this.token)throw new Error('Entre na atividade.');headers['x-al-session']=this.token;}
   else headers.Authorization='Bearer '+await this.cloud.accessToken();
   let res;try{res=await fetch(AL_CONFIG.supabaseUrl+'/functions/v1/apertaletra-classroom',{method:'POST',headers,body:JSON.stringify({...data,action}),signal:AbortSignal.timeout(18000),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});}catch{throw Object.assign(new Error('Sem confirmação da nuvem. Seu rascunho fica neste navegador.'),{code:'network'});}
   let result;try{result=await res.json();}catch{throw Object.assign(new Error('Resposta indisponível. Seu rascunho fica neste navegador.'),{code:'network'});}
   if(actor!==(student?this.token:this.cloud.user?.id))throw Object.assign(new Error('A sessão mudou. Entre novamente.'),{code:'session_changed'});
   if(!res.ok)throw Object.assign(new Error(result.message||'Não foi possível concluir.'),{code:result.code||'request',status:res.status});return result;
  }
  newSession(){this.token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');return this.token;}
 }
 function decode(p){return {...AL.importFile('atividade.apertaletra',JSON.stringify(p.payload)),id:p.id,revision:0,cloudRevision:p.revision,updatedAt:p.updated_at||new Date().toISOString(),syncState:'synced'};}
 // Each adapter has one canonical production. No method accepts a different owner's ID.
 class ProductionStore {
  constructor(api,info,{teacher=false,db=new ALOnline.DraftDB()}={}){this.api=api;this.info=info;this.teacher=teacher;this.db=db;this.owner=teacher?api.cloud.user.id:'participant';this.scope=(teacher?'review:'+this.owner:'participant')+':'+info.production.id;this.boundId=info.production.id;this.base=info.production.revision;this.state='synced';this.tail=Promise.resolve();this.policy={readOnly:false,locked:teacher?[]:info.activity.locked_fields};}
  open(){return this.db.open();}
  async get(){const local=await this.db.get(this.scope,this.boundId);if(local?.pending){this.state=local.state;this.base=local.base;return {...local.doc,syncState:local.state};}this.state='synced';this.base=this.info.production.revision;return {...decode(this.info.production),revision:local?.doc.revision||0};}
  list(){return this.get().then(x=>[x]);}
  async save(input){
   const work=this.tail.then(()=>this._save(input));this.tail=work.catch(()=>{});return work;
  }
  async _save(input){
   const payload=JSON.parse(AL.exportFile(input));const old=await this.db.get(this.scope,this.boundId);
   if(old&&!old.pending&&equal(old.payload,payload))return {doc:{...old.doc,syncState:'synced'},syncState:'synced',conflict:false};
   const revision=(input.revision||0)+1,doc={...input,id:this.boundId,revision};
   const samePending=old?.pending&&equal(old.payload,payload);
   const mutation=samePending?old.mutation:AL.id();
   const base=old?.pending?old.base:this.base;
   let rec={doc,payload,base,mutation,pending:true,state:'local'};
   try{await this.db.change(this.scope,this.boundId,current=>{if(current&&current.doc.revision!==(input.revision||0)&&!equal(current.payload,payload))throw Object.assign(new Error('Outra aba alterou esta produção. Baixe sua cópia antes de reabrir.'),{code:'local_conflict'});return rec;});}
   catch(error){if(error.code!=='local_conflict')throw error;await this.db.change(this.scope+':recovery',this.boundId+'-'+AL.id(),()=>rec);this.error=error;this.state='conflict';return {doc:{...input,syncState:'conflict'},syncState:'conflict',conflict:false};}
   this.state='local';
   try{
    const data={activity_id:this.info.activity.id,production_id:this.boundId,payload,expected_revision:base,mutation_id:mutation};
    const result=await this.api.call(this.teacher?'review_save':'save',data,!this.teacher);const ack=result.production||result;
    if(ack.id!==this.boundId||!equal(ack.payload,payload))throw new Error('Confirmação divergente. Rascunho preservado.');
    this.base=ack.revision;this.info.production=ack;this.state='synced';this.error=null;rec={...rec,base:ack.revision,pending:false,state:'synced'};
   }catch(e){this.error=e;this.state=e.code==='40001'?'conflict':'local';rec.state=this.state;}
   const current=await this.db.change(this.scope,this.boundId,latest=>latest?.mutation===mutation?rec:latest);if(current?.mutation!==mutation)this.state='local';
   return {doc:{...doc,syncState:this.state,cloudRevision:this.base},syncState:this.state,conflict:false};
  }
  async sync(){const r=await this.db.get(this.scope,this.boundId);if(r?.pending)return this.save(r.doc);}
  async refresh(){const result=await this.api.call(this.teacher?'production':'read',{activity_id:this.info.activity.id,production_id:this.boundId},!this.teacher);if(result.pending)throw new Error('Aguardando liberação.');this.info=result;return result;}
  async acceptRemote(){
   await this.refresh();const old=await this.db.get(this.scope,this.boundId);
   // Local conflict retained as a recoverable file source, not attributed to another account.
   if(old?.pending)await this.db.change(this.scope+':recovery',this.boundId+'-'+AL.id(),()=>old);
   await this.db.change(this.scope,this.boundId,()=>({doc:decode(this.info.production),payload:this.info.production.payload,base:this.info.production.revision,pending:false,state:'synced'}));
   this.base=this.info.production.revision;this.state='synced';return this.get();
  }
 }
 globalThis.ALClass={API,ProductionStore,decode,equal};
})();

import {emptySpace,validateSpace,setPhoto} from './model.js?v=0.11';
import {DriveFiles} from './drive-files.js?v=0.12';
import {CLOUD_CONFIG} from './config.js?v=0.12';
export class Session{
  constructor(){
    this.space=emptySpace('',new Date().getFullYear());
    this.active=false;this.drive=null;this.link=null;this.stagingFolder=null;this.accountEmail='';
    this.photos=new Map();this.pending=new Map();this.logoUrl=null;this.pendingLogo=null;
    this.photoErrors=new Map();this.loadingPhotos=false;this.photoCycle=0;
    this.dirty=false;this.generation=0;
    this.config={clientId:CLOUD_CONFIG.googleOAuthClientId,projectNumber:CLOUD_CONFIG.googleCloudProjectNumber,pickerKey:CLOUD_CONFIG.googlePickerApiKey};
    this.classId=null;this.year=new Date().getFullYear();this.selected=new Set();this.onUpdate=()=>{};
  }
  isCloud(){return !!this.drive?.ready()}
  hasSpace(){return this.active}
  isLinked(){return !!this.link}
  editable(){return this.active&&this.isCloud()&&(!this.link||!!this.link.canEdit)}
  update(space){
    if(!this.editable())throw Error('A conta precisa estar conectada e ter permissão de edição.');
    this.space=space;this.dirty=true;this.generation++;this.onUpdate();
  }
  selectClass(id){const c=this.space.classes.find(c=>c.id===id);if(!c)throw Error('Turma não encontrada.');this.classId=id;this.year=c.year;this.onUpdate()}
  chooseYear(year){this.year=Number(year);this.classId=this.space.classes.find(c=>c.year===this.year)?.id||null;this.onUpdate()}
  resetPhotos(){
    this.photoCycle++;
    for(const url of this.photos.values())URL.revokeObjectURL(url);
    this.photos.clear();this.pending.clear();this.photoErrors.clear();
    if(this.logoUrl)URL.revokeObjectURL(this.logoUrl);
    this.logoUrl=null;this.pendingLogo=null;this.loadingPhotos=false;
  }
  resetToGate(){
    this.resetPhotos();this.drive?.closeSpace();
    this.year=new Date().getFullYear();this.space=emptySpace('',this.year);this.active=false;
    this.link=null;this.stagingFolder=null;this.classId=null;this.selected.clear();this.dirty=false;this.generation++;this.onUpdate();
  }
  disconnect(){this.drive?.disconnect();this.resetToGate();this.drive=null;this.accountEmail='';this.onUpdate()}
  startSpace(name){
    if(!this.isCloud())throw Error('Conecte ao Google Drive antes de criar um espaço.');
    if(!String(name||'').trim())throw Error('Informe a escola.');
    this.resetPhotos();this.drive.closeSpace();
    this.year=new Date().getFullYear();this.space=emptySpace(name,this.year);this.active=true;
    this.link=null;this.stagingFolder=null;this.classId=null;this.selected.clear();this.dirty=true;this.generation++;this.onUpdate();
  }
  async connect(){
    if(this.drive?.ready())return this.drive.email;
    if(!this.drive||this.drive.clientId!==this.config.clientId)this.drive=new DriveFiles(this.config.clientId);
    const email=await this.drive.authorize();
    if(this.accountEmail&&email!==this.accountEmail&&this.active){
      this.drive.disconnect();
      throw Error('Reconecte a mesma conta para preservar este espaço. Para usar outra conta, conclua o salvamento e use Trocar conta.');
    }
    this.accountEmail=email;this.onUpdate();return email;
  }
  async load(id){
    if(!this.isCloud())throw Error('Conecte ao Google Drive.');
    if(this.dirty)throw Error('Conclua o salvamento antes de abrir outro espaço.');
    const result=await this.drive.open(id),state=validateSpace(result.state);
    this.resetPhotos();this.space=state;this.active=true;this.link=result.link;this.stagingFolder=null;
    this.dirty=false;this.generation++;this.year=Math.max(...state.classes.map(c=>c.year),new Date().getFullYear());
    this.classId=state.classes.find(c=>c.year===this.year)?.id||state.classes[0]?.id||null;
    this.selected.clear();this.onUpdate();return this.loadPhotos();
  }
  async loadPhotos(){
    if(!this.isCloud()||this.loadingPhotos)return {loaded:0,failed:this.photoErrors.size};
    const jobs=this.space.students.filter(p=>p.photoId&&!this.photos.has(p.id)).map(p=>({id:p.id,file:p.photoId}));
    if(this.space.school.logoFileId&&!this.logoUrl)jobs.push({id:'__logo__',file:this.space.school.logoFileId});
    let index=0,loaded=0,failed=0;const cycle=this.photoCycle;
    this.loadingPhotos=true;this.onUpdate();
    const worker=async()=>{
      while(index<jobs.length){
        const job=jobs[index++];
        try{
          const blob=await this.drive.media(job.file);
          if(cycle!==this.photoCycle)return;
          if(blob.size>7*1024*1024||!blob.type.startsWith('image/'))throw Error('Arquivo de imagem inválido ou acima de 7 MB.');
          const url=URL.createObjectURL(blob);
          if(job.id==='__logo__')this.logoUrl=url;else this.photos.set(job.id,url);
          this.photoErrors.delete(job.id);loaded++;
        }catch(error){
          if(cycle!==this.photoCycle)return;
          this.photoErrors.set(job.id,{code:error.code||'',status:error.status||0,message:error.message||'Falha de leitura.'});failed++;
        }
        this.onUpdate();
      }
    };
    try{await Promise.all(Array.from({length:Math.min(3,jobs.length)},()=>worker()))}
    finally{if(cycle===this.photoCycle){this.loadingPhotos=false;this.onUpdate()}}
    return {loaded,failed};
  }
  async encodePhoto(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file?.type))throw Error('Escolha JPG, PNG ou WEBP.');
    if(file.size>12*1024*1024)throw Error('Imagem acima de 12 MB.');
    const bitmap=await createImageBitmap(file);
    try{
      const scale=Math.min(1,900/bitmap.width,1100/bitmap.height),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível preparar a foto.')),'image/jpeg',0.82));
      if(blob.size>5*1024*1024)throw Error('A fotografia preparada ultrapassa 5 MB.');return blob;
    }finally{bitmap.close?.()}
  }
  async photo(id,file){
    if(!this.editable())throw Error('Acesso somente leitura ou conexão expirada.');
    const spaceId=this.space.id,blob=await this.encodePhoto(file);
    if(this.space.id!==spaceId||!this.editable()||!this.space.students.some(p=>p.id===id))throw Error('O espaço mudou durante a preparação da fotografia.');
    if(this.photos.has(id))URL.revokeObjectURL(this.photos.get(id));
    this.photos.set(id,URL.createObjectURL(blob));this.pending.set(id,{blob,uploadedId:null});this.photoErrors.delete(id);
    this.dirty=true;this.generation++;this.onUpdate();
  }
  async logo(file){
    if(!this.editable())throw Error('Acesso somente leitura ou conexão expirada.');
    const spaceId=this.space.id,blob=await this.encodePhoto(file);
    if(this.space.id!==spaceId||!this.editable())throw Error('O espaço mudou durante a preparação da imagem.');
    if(this.logoUrl)URL.revokeObjectURL(this.logoUrl);
    this.logoUrl=URL.createObjectURL(blob);this.pendingLogo={blob,uploadedId:null};this.photoErrors.delete('__logo__');
    this.dirty=true;this.generation++;this.onUpdate();
  }
  removePhoto(id){
    if(!this.editable())throw Error('Acesso somente leitura.');
    if(this.photos.has(id))URL.revokeObjectURL(this.photos.get(id));
    this.photos.delete(id);this.pending.delete(id);this.photoErrors.delete(id);this.update(setPhoto(this.space,id,null));
  }
  async save(){
    if(!this.isCloud())throw Error('A conexão Google expirou. Reconecte a mesma conta.');
    if(!this.active)throw Error('Abra um espaço antes de salvar.');
    if(this.link&&!this.link.canEdit)throw Error('Acesso somente leitura.');
    if(this.link&&!this.dirty)return this.link;
    const spaceId=this.space.id,generation=this.generation,photos=[...this.pending.entries()],logo=this.pendingLogo;
    let state=structuredClone(this.space),link=this.link;
    if(link)link=await this.drive.ensureUnchanged(link);
    else{
      if(!this.stagingFolder)this.stagingFolder=await this.drive.prepareWorkspace(state);
      state.drive={...this.stagingFolder};
    }
    const folder=state.drive?.photosFolderId||link?.photosFolderId;if(!folder)throw Error('Pasta de fotos não encontrada.');
    for(const [id,item] of photos){
      if(!item.uploadedId)item.uploadedId=(await this.drive.upload('foto-'+id+'.jpg',folder,item.blob,'image/jpeg')).id;
      state=setPhoto(state,id,item.uploadedId);
    }
    if(logo){
      if(!logo.uploadedId)logo.uploadedId=(await this.drive.upload('logotipo.jpg',folder,logo.blob,'image/jpeg')).id;
      state.school.logoFileId=logo.uploadedId;
    }
    if(link)link=await this.drive.save(state,link);
    else{
      link=await this.drive.createManifest(state);
      if(link.recovered&&link.snapshot!==JSON.stringify(state)){
        this.link=link;this.space.drive={...state.drive};
        throw Object.assign(Error('Um cadastro já existe no Drive com conteúdo diferente. Nenhum arquivo foi sobrescrito. Reabra o espaço.'),{code:'CONFLICT'});
      }
    }
    if(this.space.id!==spaceId)throw Error('O espaço mudou durante o envio. Reabra antes de editar.');
    this.link=link;
    if(this.generation===generation){this.space=state;this.dirty=false;this.pending.clear();this.pendingLogo=null}
    else{
      if(state.drive)this.space.drive={...state.drive};
      for(const [id,item] of photos)if(this.pending.get(id)===item){this.space=setPhoto(this.space,id,item.uploadedId);this.pending.delete(id)}
      if(logo&&this.pendingLogo===logo){this.space.school.logoFileId=logo.uploadedId;this.pendingLogo=null}
      this.dirty=true;
    }
    this.onUpdate();return this.link;
  }
}

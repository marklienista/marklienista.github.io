import {emptySpace,validateSpace,setPhoto} from './model.js?v=0.11';
import {DriveFiles} from './drive-files.js?v=0.11.2';
import {CLOUD_CONFIG} from './config.js?v=0.11.2';

export class Session{
  constructor(){
    const year=new Date().getFullYear();
    // Entrada limpa: nenhuma turma, estudante ou foto de demonstração é carregado.
    this.space=emptySpace('',year);
    this.active=false;this.drive=null;this.link=null;this.stagingFolder=null;
    this.photos=new Map();this.pending=new Map();this.logoUrl=null;this.pendingLogo=null;
    this.dirty=false;this.generation=0;
    this.config={clientId:CLOUD_CONFIG.googleOAuthClientId,projectNumber:CLOUD_CONFIG.googleCloudProjectNumber,pickerKey:CLOUD_CONFIG.googlePickerApiKey};
    this.classId=null;this.year=year;this.selected=new Set();this.onUpdate=()=>{};
  }
  isCloud(){return !!this.drive?.ready()}
  hasSpace(){return this.active}
  isLinked(){return !!this.link}
  editable(){return this.active&&this.isCloud()&&(!this.link||!!this.link.canEdit)}
  update(space){
    if(!this.editable())throw Error('Conecte sua conta Google para editar este espaço.');
    this.space=space;this.dirty=true;this.generation++;
    this.onUpdate();
  }
  selectClass(classId){
    const klass=this.space.classes.find(c=>c.id===classId);
    if(!klass)throw Error('Turma não encontrada.');
    this.classId=classId;this.year=klass.year;this.onUpdate();
  }
  chooseYear(year){
    this.year=Number(year);
    this.classId=this.space.classes.find(c=>c.year===this.year)?.id||null;
    this.onUpdate();
  }
  resetPhotos(){
    for(const url of this.photos.values())try{URL.revokeObjectURL(url)}catch{}
    this.photos.clear();this.pending.clear();
    if(this.logoUrl)try{URL.revokeObjectURL(this.logoUrl)}catch{}
    this.logoUrl=null;this.pendingLogo=null;
  }
  resetToGate(){
    this.resetPhotos();
    const year=new Date().getFullYear();
    this.space=emptySpace('',year);this.active=false;this.link=null;this.stagingFolder=null;
    this.classId=null;this.year=year;this.selected.clear();this.dirty=false;this.generation++;
    this.onUpdate();
  }
  disconnect(){
    this.drive?.disconnect();this.drive=null;this.resetToGate();
  }
  startSpace(name){
    if(!this.isCloud())throw Error('Conecte uma conta Google antes de criar um espaço.');
    if(!String(name||'').trim())throw Error('Informe a escola.');
    this.resetPhotos();
    const year=new Date().getFullYear();
    this.space=emptySpace(name,year);this.active=true;this.link=null;this.stagingFolder=null;
    this.classId=null;this.year=year;this.selected.clear();this.dirty=true;this.generation++;
    this.onUpdate();
  }
  async connect(){
    if(this.drive?.ready())return this.drive.email;
    if(!this.drive||this.drive.clientId!==this.config.clientId)this.drive=new DriveFiles(this.config.clientId);
    await this.drive.authorize();
    this.onUpdate();
    return this.drive.email;
  }
  async load(manifestId){
    if(!this.isCloud())throw Error('Conecte ao Google Drive.');
    if(this.dirty)throw Error('Há mudanças não salvas. Resolva o salvamento antes de abrir outro espaço.');
    const result=await this.drive.open(manifestId);
    const space=validateSpace(result.state);
    this.resetPhotos();
    this.space=space;this.active=true;this.link=result.link;this.stagingFolder=null;
    this.dirty=false;this.generation++;
    this.year=Math.max(...space.classes.map(c=>c.year),new Date().getFullYear());
    this.classId=space.classes.find(c=>c.year===this.year)?.id||space.classes[0]?.id||null;
    this.selected.clear();
    this.onUpdate();
    return this.loadPhotos();
  }
  async loadPhotos(){
    if(!this.isCloud())return {loaded:0,failed:0};
    const jobs=this.space.students.filter(s=>s.photoId).map(s=>({id:s.id,file:s.photoId}));
    if(this.space.school.logoFileId)jobs.push({id:'__logo__',file:this.space.school.logoFileId});
    let loaded=0,failed=0,index=0;
    const worker=async()=>{
      while(index<jobs.length){
        const job=jobs[index++];
        try{
          const blob=await this.drive.media(job.file);
          if(blob.size>7*1024*1024)throw Error('Imagem acima do limite.');
          const url=URL.createObjectURL(blob);
          if(job.id==='__logo__')this.logoUrl=url;else this.photos.set(job.id,url);
          loaded++;this.onUpdate();
        }catch{failed++}
      }
    };
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},()=>worker()));
    return {loaded,failed};
  }
  async encodePhoto(file){
    if(!file?.type?.startsWith('image/'))throw Error('Escolha JPG, PNG ou WEBP.');
    if(file.size>12*1024*1024)throw Error('Imagem acima de 12 MB.');
    const picture=await createImageBitmap(file);
    try{
      const ratio=Math.min(1,900/picture.width,1100/picture.height);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(picture.width*ratio));
      canvas.height=Math.max(1,Math.round(picture.height*ratio));
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(picture,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>
        canvas.toBlob(data=>data?resolve(data):reject(Error('Não foi possível preparar a fotografia.')),'image/jpeg',0.82));
      if(blob.size>5*1024*1024)throw Error('Fotografia ainda muito grande após a redução.');
      return blob;
    }finally{picture.close?.()}
  }
  async photo(studentId,file){
    if(!this.editable())throw Error('Seu acesso é apenas para leitura ou a conexão expirou.');
    const blob=await this.encodePhoto(file);
    const old=this.photos.get(studentId);
    if(old)URL.revokeObjectURL(old);
    this.photos.set(studentId,URL.createObjectURL(blob));
    this.pending.set(studentId,{blob,uploadedId:null});
    this.dirty=true;this.generation++;this.onUpdate();
  }
  async logo(file){
    if(!this.editable())throw Error('Seu acesso é apenas para leitura ou a conexão expirou.');
    const blob=await this.encodePhoto(file);
    if(this.logoUrl)URL.revokeObjectURL(this.logoUrl);
    this.logoUrl=URL.createObjectURL(blob);this.pendingLogo={blob,uploadedId:null};
    this.dirty=true;this.generation++;this.onUpdate();
  }
  removePhoto(studentId){
    if(!this.editable())throw Error('Seu acesso é apenas para leitura.');
    const url=this.photos.get(studentId);
    if(url)URL.revokeObjectURL(url);
    this.photos.delete(studentId);this.pending.delete(studentId);
    this.update(setPhoto(this.space,studentId,null));
  }
  async save(){
    if(!this.isCloud())throw Error('A conexão com o Google Drive expirou. Conecte novamente.');
    if(!this.active)throw Error('Abra ou crie um espaço antes de salvar.');
    if(this.link&&!this.link.canEdit)throw Error('Você só pode visualizar este espaço no Google Drive.');
    if(this.link&&!this.dirty)return this.link;
    const spaceId=this.space.id,startGeneration=this.generation;
    let state=structuredClone(this.space);
    let link=this.link;
    const photos=[...this.pending.entries()];
    const logo=this.pendingLogo;
    // Verificar conflitos ANTES do upload de fotografias, evitando arquivos órfãos.
    if(link)link=await this.drive.ensureUnchanged(link);
    else{
      if(!this.stagingFolder)this.stagingFolder=await this.drive.prepareWorkspace(state);
      state.drive={...this.stagingFolder};
    }
    const folder=state.drive?.photosFolderId||link?.photosFolderId;
    if(!folder)throw Error('A pasta de fotografias do espaço está ausente. Nenhum cadastro foi sobrescrito.');
    for(const [studentId,item] of photos){
      if(!item.uploadedId){
        const uploaded=await this.drive.upload('foto-'+studentId+'.jpg',folder,item.blob,'image/jpeg');
        item.uploadedId=uploaded.id;
      }
      state=setPhoto(state,studentId,item.uploadedId);
    }
    if(logo){
      if(!logo.uploadedId){
        const uploaded=await this.drive.upload('logotipo.jpg',folder,logo.blob,'image/jpeg');
        logo.uploadedId=uploaded.id;
      }
      state.school.logoFileId=logo.uploadedId;
    }
    if(link)link=await this.drive.save(state,link);
    else{
      link=await this.drive.createManifest(state); // Criação já grava o cadastro FINAL; não fazer PATCH extra.
      if(link.recovered&&link.snapshot!==JSON.stringify(state)){
        this.link=link;this.space.drive={...state.drive};
        const conflict=new Error('Um cadastro com este identificador já existe no Drive, mas seu conteúdo difere. Nenhum arquivo foi sobrescrito. Reabra o espaço para conferir o estado atual.');
        conflict.code='CONFLICT';
        throw conflict;
      }
    }
    if(this.space.id!==spaceId)throw Error('O espaço mudou durante o salvamento. Reabra o cadastro antes de editar.');
    this.link=link;
    if(this.generation===startGeneration){
      this.space=state;this.dirty=false;this.pending.clear();this.pendingLogo=null;
    }else{
      // Houve novas alterações enquanto o upload estava em andamento.
      // Não apagá-las; marcar outra gravação automática.
      if(state.drive)this.space.drive={...state.drive};
      for(const [sid,item] of photos){
        if(this.pending.get(sid)===item){
          this.space=setPhoto(this.space,sid,item.uploadedId);
          this.pending.delete(sid);
        }
      }
      if(logo&&this.pendingLogo===logo){
        this.space.school.logoFileId=logo.uploadedId;this.pendingLogo=null;
      }
      this.dirty=true;
    }
    this.onUpdate();
    return this.link;
  }
}

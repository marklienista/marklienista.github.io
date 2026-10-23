import {demoSpace,emptySpace,validateSpace,setPhoto} from './model.js';
import {DriveFiles} from './drive-files.js';
export class Session{
  constructor(){
    this.space=demoSpace();this.drive=null;this.link=null;this.photos=new Map();this.pending=new Map();
    this.logoUrl=null;this.pendingLogo=null;this.dirty=false;
    this.config={clientId:localStorage.getItem('carometro.public.clientId')||'',pickerKey:localStorage.getItem('carometro.public.pickerKey')||''};
    this.localSpaces=new Map([[this.space.id,this.space]]);
    this.classId=this.space.classes[0]?.id||null;
    this.year=2026;this.selected=new Set(this.space.students.map(s=>s.id));this.onUpdate=()=>{};
  }
  isCloud(){return !!this.drive?.ready()}
  isLinked(){return !!this.link}
  editable(){return !this.link||!!this.link.canEdit}
  update(space){
    if(!this.editable())throw Error('Seu acesso é somente para visualizar.');
    this.space=space;this.localSpaces.set(space.id,space);this.dirty=true;this.onUpdate();
  }
  selectClass(classId){
    const c=this.space.classes.find(c=>c.id===classId);
    if(!c)throw Error('Turma não encontrada.');
    this.classId=classId;this.year=c.year;this.onUpdate();
  }
  chooseYear(year){
    this.year=Number(year);
    this.classId=this.space.classes.find(c=>c.year===this.year)?.id||null;this.onUpdate();
  }
  resetPhotos(){
    for(const url of this.photos.values())try{URL.revokeObjectURL(url)}catch{}
    this.photos.clear();this.pending.clear();
    if(this.logoUrl)try{URL.revokeObjectURL(this.logoUrl)}catch{}
    this.logoUrl=null;this.pendingLogo=null;
  }
  startSpace(name){
    this.resetPhotos();
    const current=new Date().getFullYear();
    this.space=emptySpace(name,current);
    this.localSpaces.set(this.space.id,this.space);
    this.link=null;this.classId=null;this.year=current;this.selected.clear();this.dirty=true;this.onUpdate();
  }
  saveConfig(clientId,pickerKey){
    this.config={clientId:String(clientId||'').trim(),pickerKey:String(pickerKey||'').trim()};
    localStorage.setItem('carometro.public.clientId',this.config.clientId);
    localStorage.setItem('carometro.public.pickerKey',this.config.pickerKey);
  }
  async connect(){
    this.drive=new DriveFiles(this.config.clientId);
    await this.drive.authorize();
    return this.drive.email;
  }
  async load(manifestId){
    if(!this.isCloud())throw Error('Conecte o Google Drive.');
    const r=await this.drive.open(manifestId);
    const state=validateSpace(r.state);
    this.resetPhotos();this.space=state;this.link=r.link;this.dirty=false;
    this.localSpaces.set(state.id,state);
    this.year=Math.max(...state.classes.map(c=>c.year),new Date().getFullYear());
    this.classId=state.classes.find(c=>c.year===this.year)?.id||state.classes[0]?.id||null;
    this.selected=new Set();this.onUpdate();
    return await this.loadPhotos();
  }
  async loadPhotos(){
    if(!this.isCloud())return {loaded:0,failed:0};
    const jobs=this.space.students.filter(s=>s.photoId).map(s=>({id:s.id,file:s.photoId}));
    if(this.space.school.logoFileId)jobs.push({id:'__logo__',file:this.space.school.logoFileId});
    let loaded=0,failed=0,idx=0;
    const worker=async()=>{
      while(idx<jobs.length){
        const job=jobs[idx++];
        try{
          const blob=await this.drive.media(job.file);
          if(blob.size>7*1024*1024)throw Error('Imagem muito grande.');
          const url=URL.createObjectURL(blob);
          if(job.id==='__logo__')this.logoUrl=url;
          else this.photos.set(job.id,url);
          loaded++;
          this.onUpdate();
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
      const cv=document.createElement('canvas');
      cv.width=Math.max(1,Math.round(picture.width*ratio));
      cv.height=Math.max(1,Math.round(picture.height*ratio));
      const cx=cv.getContext('2d');
      cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(picture,0,0,cv.width,cv.height);
      const blob=await new Promise((yes,no)=>cv.toBlob(x=>x?yes(x):no(Error('Não foi possível preparar a foto.')),'image/jpeg',0.82));
      if(blob.size>5*1024*1024)throw Error('Fotografia continua muito grande após redução.');
      return blob;
    }finally{picture.close?.()}
  }
  async photo(studentId,file){
    if(!this.editable())throw Error('Acesso apenas para visualizar.');
    const blob=await this.encodePhoto(file);
    const old=this.photos.get(studentId);
    if(old)URL.revokeObjectURL(old);
    this.photos.set(studentId,URL.createObjectURL(blob));
    this.pending.set(studentId,{blob,uploadedId:null});
    this.dirty=true;this.onUpdate();
  }
  async logo(file){
    if(!this.editable())throw Error('Acesso somente leitura.');
    const blob=await this.encodePhoto(file);
    if(this.logoUrl)URL.revokeObjectURL(this.logoUrl);
    this.logoUrl=URL.createObjectURL(blob);this.pendingLogo={blob,uploadedId:null};
    this.dirty=true;this.onUpdate();
  }
  removePhoto(studentId){
    const old=this.photos.get(studentId);
    if(old)URL.revokeObjectURL(old);
    this.photos.delete(studentId);this.pending.delete(studentId);
    this.update(setPhoto(this.space,studentId,null));
  }
  async save(){
    if(!this.isCloud())throw Error('Conecte o Drive para salvar.');
    if(this.link&&!this.link.canEdit)throw Error('Permissão somente leitura.');
    if(!this.link){this.link=await this.drive.newWorkspace(this.space);}
    const folder=this.space.drive?.photosFolderId;
    if(!folder)throw Error('Pasta de fotos ausente. Registro não salvo.');
    for(const [sid,item] of this.pending){
      if(!item.uploadedId){
        const uploaded=await this.drive.upload('foto-'+sid+'.jpg',folder,item.blob,'image/jpeg');
        item.uploadedId=uploaded.id;
      }
      this.space=setPhoto(this.space,sid,item.uploadedId);
    }
    if(this.pendingLogo){
      if(!this.pendingLogo.uploadedId){
        const uploaded=await this.drive.upload('logotipo.jpg',folder,this.pendingLogo.blob,'image/jpeg');
        this.pendingLogo.uploadedId=uploaded.id;
      }
      this.space.school.logoFileId=this.pendingLogo.uploadedId;
    }
    this.link=await this.drive.save(this.space,this.link);
    this.dirty=false;this.pending.clear();this.pendingLogo=null;this.localSpaces.set(this.space.id,this.space);this.onUpdate();
    return this.link;
  }
}

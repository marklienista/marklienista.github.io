import {Drive} from './drive.js?v=0.12';
const MANIFEST='carometro.json',FOLDER='application/vnd.google-apps.folder';
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const identifier=value=>{const id=String(value||'');if(!/^[A-Za-z0-9_-]{10,}$/.test(id))throw Error('Identificador de arquivo inválido.');return id};
const block=message=>Object.assign(Error(message),{code:'SPACE_BOUNDARY'});
export function driveItemId(input){
  const value=String(input||'').trim();
  if(/^[A-Za-z0-9_-]{10,}$/.test(value))return value;
  let url;try{url=new URL(value)}catch{throw Error('Cole um link de pasta ou arquivo do Google Drive.')}
  if(url.protocol!=='https:'||url.hostname!=='drive.google.com')throw Error('Use um link oficial do Google Drive.');
  return identifier(url.pathname.match(/\/(?:folders|file\/d)\/([A-Za-z0-9_-]{10,})/)?.[1]||url.searchParams.get('id'));
}
export class DriveFiles extends Drive{
  #space=null;
  #prepared=null;
  #images=new Set();
  #uploaded=new Set();
  closeSpace(){this.#space=null;this.#prepared=null;this.#images.clear();this.#uploaded.clear()}
  async info(id){
    identifier(id);
    return this.request('GET','/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields='+encodeURIComponent('id,name,mimeType,size,version,parents,capabilities(canEdit,canShare,canDownload),trashed'));
  }
  #folder(meta,parent=null){
    if(meta.trashed||meta.mimeType!==FOLDER)throw block('A pasta do espaço não está disponível. Nenhum arquivo foi alterado.');
    if(parent&&!meta.parents?.includes(parent))throw block('A pasta de fotos está fora do espaço selecionado. Nenhum arquivo externo será aberto.');
    return meta;
  }
  #bind(state,root,photos,manifestId=null){
    this.#space={id:state.id,folderId:root.id,photosFolderId:photos.id,manifestId};
    this.#images=new Set((state.students||[]).map(s=>s.photoId).filter(Boolean));
    if(state.school?.logoFileId)this.#images.add(state.school.logoFileId);
    this.#uploaded.clear();
  }
  #matches(state){
    const c=this.#space;
    if(!c||state.id!==c.id||state.drive?.folderId!==c.folderId||state.drive?.photosFolderId!==c.photosFolderId)
      throw block('O cadastro aponta para pastas diferentes do espaço aberto. Operação cancelada.');
    if(state.schema_version!==1||!Array.isArray(state.students)||!Array.isArray(state.classes)||!Array.isArray(state.enrollments))throw block('O cadastro tem estrutura inválida.');
  }
  async #root(write=false){
    if(!this.#space)throw block('Abra um espaço antes de acessar seus arquivos.');
    const root=this.#folder(await this.info(this.#space.folderId));
    if(write&&!root.capabilities?.canEdit)throw Object.assign(Error('A conta não pode editar a pasta deste espaço.'),{code:'READ_ONLY'});
    return root;
  }
  async #photos(write=false){
    await this.#root(write);
    const photos=this.#folder(await this.info(this.#space.photosFolderId),this.#space.folderId);
    if(write&&!photos.capabilities?.canEdit)throw Object.assign(Error('A conta não pode gravar na pasta de fotos.'),{code:'READ_ONLY'});
    return photos;
  }
  async #download(id,maxBytes){
    if(!this.ready())throw Object.assign(Error('Reconecte ao Google Drive.'),{status:401});
    const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(identifier(id))+'?alt=media&supportsAllDrives=true',{
      headers:{Authorization:'Bearer '+this.token},cache:'no-store',credentials:'omit'
    });
    if(!response.ok)throw await this.fail(response);
    if(Number(response.headers?.get('Content-Length'))>maxBytes)throw Error('Arquivo acima do limite permitido.');
    const blob=await response.blob();
    if(blob.size>maxBytes)throw Error('Arquivo acima do limite permitido.');
    return blob;
  }
  async #imageInfo(id){
    identifier(id);
    await this.#photos();
    const meta=await this.info(id);
    if(meta.trashed||!meta.parents?.includes(this.#space.photosFolderId))throw block('A fotografia indicada não pertence à pasta de fotos deste espaço.');
    if(!IMAGE_TYPES.has(meta.mimeType))throw block('O arquivo indicado não é uma fotografia JPG, PNG ou WEBP.');
    if(Number(meta.size)>7*1024*1024)throw Error('Fotografia acima de 7 MB.');
    if(meta.capabilities?.canDownload===false)throw Error('O proprietário bloqueou o download desta fotografia.');
    return meta;
  }
  async media(id){
    if(!this.#images.has(id)&&!this.#uploaded.has(id))throw block('A fotografia não está vinculada ao espaço aberto.');
    await this.#imageInfo(id);
    return this.#download(id,7*1024*1024);
  }
  async #createFolder(name,parent=null){
    const payload={name,mimeType:FOLDER};if(parent)payload.parents=[identifier(parent)];
    return this.request('POST','/files?supportsAllDrives=true&fields=id,name',payload);
  }
  async prepareWorkspace(state){
    if(!this.ready())throw Error('Conecte ao Google Drive.');
    if(!state.id||!state.school?.name)throw Error('Informe a escola do espaço.');
    if(this.#prepared&&this.#prepared.id!==state.id)this.closeSpace();
    if(!this.#prepared){
      const root=await this.#createFolder('FotoCrachá — '+state.school.name.slice(0,70));
      this.#prepared={id:state.id,folderId:root.id,photosFolderId:null};
    }
    const root=this.#folder(await this.info(this.#prepared.folderId));
    if(!root.capabilities?.canEdit)throw Error('A pasta criada não está disponível para edição.');
    if(!this.#prepared.photosFolderId){
      const photos=await this.#createFolder('Fotos',root.id);this.#prepared.photosFolderId=photos.id;
    }
    const photos=this.#folder(await this.info(this.#prepared.photosFolderId),root.id);
    this.#bind(state,root,photos);
    return {folderId:root.id,photosFolderId:photos.id};
  }
  async #multipart(name,parent,blob,mime){
    if(!this.ready())throw Object.assign(Error('A conexão Google expirou.'),{status:401});
    if(blob.size>5*1024*1024)throw Error('Arquivo acima de 5 MB.');
    const boundary='fc_'+crypto.randomUUID().replaceAll('-','');
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify({name,mimeType:mime,parents:[parent]}),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',blob,'\r\n--'+boundary+'--']);
    const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,version',{
      method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'multipart/related; boundary='+boundary},body
    });
    if(!response.ok)throw await this.fail(response);
    return response.json();
  }
  async upload(name,parent,blob,mime){
    if(!this.#space||parent!==this.#space.photosFolderId)throw block('Upload fora da pasta de fotos do espaço foi bloqueado.');
    if(!IMAGE_TYPES.has(mime)||!(/^(?:foto-[A-Za-z0-9_-]+|logotipo)\.(?:jpg|png|webp)$/.test(name)))throw block('Nome ou tipo de fotografia inválido.');
    await this.#photos(true);
    const file=await this.#multipart(name,parent,blob,mime);this.#uploaded.add(file.id);return file;
  }
  async listManifests(folderId){
    identifier(folderId);
    const q="'"+folderId+"' in parents and name = '"+MANIFEST+"' and trashed = false";
    const response=await this.request('GET','/files?includeItemsFromAllDrives=true&supportsAllDrives=true&q='+encodeURIComponent(q)+'&pageSize=100&fields='+encodeURIComponent('files(id,name,mimeType,parents),nextPageToken'));
    if(response.nextPageToken)throw Error('Há muitos cadastros nesta pasta. Abra um arquivo específico.');
    return response.files||[];
  }
  async spaces(){
    // Descoberta por nome técnico; nunca baixar conteúdo de outros documentos.
    const q="name = '"+MANIFEST+"' and mimeType = 'application/json' and trashed = false";
    const found=[];let page='';
    do{
      const response=await this.request('GET','/files?includeItemsFromAllDrives=true&supportsAllDrives=true&q='+encodeURIComponent(q)+'&pageSize=100&fields='+encodeURIComponent('files(id,name,parents,modifiedTime),nextPageToken')+(page?'&pageToken='+encodeURIComponent(page):''));
      found.push(...(response.files||[]));page=response.nextPageToken||'';
    }while(page&&found.length<300);
    return found.sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||'')));
  }
  async openFromFolder(input){
    const id=driveItemId(input),meta=await this.info(id);
    if(meta.trashed)throw Error('O item indicado está na lixeira.');
    if(meta.mimeType===FOLDER){
      const list=await this.listManifests(id);
      if(list.length!==1)throw Error(list.length?'Existem vários cadastros nessa pasta. Abra o link do espaço específico.':'Esta pasta não contém um cadastro FotoCrachá. Confira a conta e o compartilhamento.');
      return list[0].id;
    }
    if(meta.name!==MANIFEST||meta.mimeType!=='application/json')throw Error('Escolha a pasta do FotoCrachá ou seu arquivo carometro.json.');
    return id;
  }
  async open(manifestId){
    const meta=await this.info(identifier(manifestId));
    if(meta.trashed||meta.name!==MANIFEST||meta.mimeType!=='application/json')throw Error('Este arquivo não é um cadastro FotoCrachá disponível.');
    if(Number(meta.size)>5*1024*1024)throw Error('Cadastro acima de 5 MB.');
    const folderId=meta.parents?.[0];if(!folderId)throw block('O cadastro precisa estar dentro da pasta do espaço.');
    const root=this.#folder(await this.info(folderId));
    const raw=await (await this.#download(manifestId,5*1024*1024)).text();
    let state;try{state=JSON.parse(raw)}catch{throw Error('Cadastro JSON inválido; não edite os arquivos manualmente.')}
    if(state.schema_version!==1||typeof state.id!=='string'||!state.school||!Array.isArray(state.students)||!Array.isArray(state.classes)||!Array.isArray(state.enrollments))throw block('O cadastro não tem a estrutura esperada do FotoCrachá.');
    if(state.drive?.folderId!==folderId)throw block('O cadastro aponta para outra pasta. Não serão lidos arquivos fora do espaço selecionado.');
    const photos=this.#folder(await this.info(identifier(state.drive.photosFolderId)),folderId);
    this.#bind(state,root,photos,manifestId);
    return {state,link:{manifestId,folderId,photosFolderId:photos.id,version:String(meta.version||''),snapshot:raw,canEdit:!!meta.capabilities?.canEdit&&!!root.capabilities?.canEdit&&!!photos.capabilities?.canEdit,canShare:!!root.capabilities?.canShare}};
  }
  async #checkNewImages(state){
    const ids=new Set(state.students.map(p=>p.photoId).filter(Boolean));if(state.school.logoFileId)ids.add(state.school.logoFileId);
    for(const id of ids)if(!this.#images.has(id)&&!this.#uploaded.has(id))await this.#imageInfo(id);
  }
  async createManifest(state){
    this.#matches(state);await this.#root(true);await this.#photos(true);await this.#checkNewImages(state);
    if(this.#space.manifestId)throw block('Este espaço já possui um cadastro. Não criar duplicata.');
    const existing=await this.listManifests(this.#space.folderId);
    if(existing.length){
      if(existing.length!==1)throw Error('Há mais de um cadastro na pasta; nenhuma gravação foi feita.');
      const existingSpace=await this.open(existing[0].id);
      if(existingSpace.state.id!==state.id)throw block('A pasta contém dados de outro espaço.');
      return {...existingSpace.link,recovered:true};
    }
    const raw=JSON.stringify(state);
    const item=await this.#multipart(MANIFEST,this.#space.folderId,new Blob([raw],{type:'application/json'}),'application/json');
    this.#space.manifestId=item.id;
    const meta=await this.info(item.id);const root=await this.#root();
    this.#images=new Set(state.students.map(p=>p.photoId).filter(Boolean));if(state.school.logoFileId)this.#images.add(state.school.logoFileId);
    return {manifestId:item.id,folderId:this.#space.folderId,photosFolderId:this.#space.photosFolderId,version:String(meta.version||item.version||''),snapshot:raw,canEdit:!!meta.capabilities?.canEdit&&!!root.capabilities?.canEdit,canShare:!!root.capabilities?.canShare,recovered:false};
  }
  async ensureUnchanged(link){
    const c=this.#space;
    if(!c||link.manifestId!==c.manifestId||link.folderId!==c.folderId||link.photosFolderId!==c.photosFolderId)throw block('Gravação fora do espaço aberto foi bloqueada.');
    await this.#root(true);
    const remote=await this.info(c.manifestId);
    if(remote.trashed||!remote.parents?.includes(c.folderId)||remote.name!==MANIFEST)throw block('O cadastro foi movido, renomeado ou retirado. Nenhum arquivo será sobrescrito.');
    if(!remote.capabilities?.canEdit)throw Object.assign(Error('A permissão de edição foi retirada no Google Drive.'),{code:'READ_ONLY'});
    if(!link.snapshot)throw Error('Reabra o espaço para recuperar a referência de salvamento.');
    if(String(remote.version)!==String(link.version)){
      const raw=await (await this.#download(c.manifestId,5*1024*1024)).text();
      let equal=raw===link.snapshot;
      if(!equal)try{equal=JSON.stringify(JSON.parse(raw))===JSON.stringify(JSON.parse(link.snapshot))}catch{}
      if(!equal)throw Object.assign(Error('O cadastro mudou no Google Drive. Suas alterações locais não foram enviadas. Reabra o espaço para conferir; evite edição simultânea.'),{code:'CONFLICT'});
    }
    return {...link,version:String(remote.version||'')};
  }
  async save(state,link){
    this.#matches(state);
    if(!link.canEdit)throw Object.assign(Error('Acesso somente leitura.'),{code:'READ_ONLY'});
    await this.#checkNewImages(state);
    const current=await this.ensureUnchanged(link),raw=JSON.stringify(state);
    const blob=new Blob([raw],{type:'application/json'});if(blob.size>5*1024*1024)throw Error('Cadastro acima de 5 MB.');
    const response=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(this.#space.manifestId)+'?uploadType=media&supportsAllDrives=true&fields=id,version',{
      method:'PATCH',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:blob
    });
    if(!response.ok)throw await this.fail(response);
    const saved=await response.json();this.#images=new Set(state.students.map(p=>p.photoId).filter(Boolean));if(state.school.logoFileId)this.#images.add(state.school.logoFileId);
    return {...current,version:String(saved.version||((await this.info(current.manifestId)).version)||''),snapshot:raw};
  }
  async #permissionRoot(folderId,write=false){
    if(!this.#space||folderId!==this.#space.folderId)throw block('Permissões só podem ser consultadas ou alteradas na pasta do espaço aberto.');
    const root=await this.#root();if(write&&!root.capabilities?.canShare)throw Error('Somente quem tem autorização no Google Drive pode gerenciar o acesso.');return root;
  }
  async share(folderId,email,role='reader'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['reader','writer'].includes(role))throw Error('E-mail ou permissão inválida.');
    await this.#permissionRoot(folderId,true);
    return this.request('POST','/files/'+folderId+'/permissions?supportsAllDrives=true&sendNotificationEmail=true&fields=id,role,emailAddress',{type:'user',role,emailAddress:email.trim()});
  }
  async permissions(folderId){
    await this.#permissionRoot(folderId);
    const list=[];let page='';
    do{const response=await this.request('GET','/files/'+folderId+'/permissions?supportsAllDrives=true&pageSize=100&fields='+encodeURIComponent('permissions(id,type,emailAddress,role),nextPageToken')+(page?'&pageToken='+encodeURIComponent(page):''));list.push(...(response.permissions||[]));page=response.nextPageToken||''}while(page);
    return list;
  }
  async revoke(folderId,id){
    await this.#permissionRoot(folderId,true);
    const permission=(await this.permissions(folderId)).find(p=>p.id===id);
    if(!permission||permission.type!=='user'||permission.role==='owner')throw block('Não é permitido remover essa permissão pelo FotoCrachá.');
    await this.request('DELETE','/files/'+folderId+'/permissions/'+encodeURIComponent(id)+'?supportsAllDrives=true');
  }
}

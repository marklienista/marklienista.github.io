import {Drive} from './drive.js';

const MANIFEST='carometro.json'; // Identificador interno antigo: não renomear arquivos existentes.
export function driveItemId(input){
  const value=String(input||'').trim();
  if(/^[A-Za-z0-9_-]{10,}$/.test(value))return value;
  let u;try{u=new URL(value)}catch{throw Error('Cole o link de uma pasta ou de um arquivo do Google Drive.')}
  if(u.protocol!=='https:'||u.hostname!=='drive.google.com')throw Error('Use um link oficial do Google Drive.');
  const id=u.pathname.match(/\/(?:folders|file\/d)\/([A-Za-z0-9_-]{10,})/)?.[1]||u.searchParams.get('id');
  if(!id||!/^[A-Za-z0-9_-]{10,}$/.test(id))throw Error('Não foi possível encontrar o ID da pasta ou do arquivo.');
  return id;
}
export class DriveFiles extends Drive{
  async folder(name,parent){
    const payload={name,mimeType:'application/vnd.google-apps.folder'};
    if(parent)payload.parents=[parent];
    return this.request('POST','/files?fields=id,name',payload);
  }
  async info(id){
    return this.request('GET','/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent('id,name,mimeType,version,parents,webViewLink,capabilities(canEdit,canShare),trashed'));
  }
  async upload(name,parent,blob,mime){
    if(blob.size>5*1024*1024)throw Error('Arquivo acima do limite de 5 MB.');
    if(!this.ready())throw Error('A conexão com o Google expirou. Conecte novamente.');
    const boundary='fc_'+Math.random().toString(36).slice(2);
    const metadata={name,mimeType:mime,parents:[parent]};
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',
      blob,'\r\n--'+boundary+'--'
    ]);
    const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version',{
      method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'multipart/related; boundary='+boundary},body
    });
    if(!response.ok)throw await this.fail(response);
    return response.json();
  }
  async media(id){
    if(!this.ready())throw Error('Conecte novamente ao Google Drive.');
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{
      headers:{Authorization:'Bearer '+this.token}
    });
    if(!r.ok)throw await this.fail(r);
    return r.blob();
  }
  async prepareWorkspace(space){
    const root=await this.folder('FotoCrachá — '+space.school.name.slice(0,70));
    const photos=await this.folder('Fotos',root.id);
    return {folderId:root.id,photosFolderId:photos.id};
  }
  async listManifests(folderId){
    const q="'"+folderId.replace(/'/g,"\\'")+"' in parents and name = '"+MANIFEST+"' and trashed = false";
    const result=await this.request('GET','/files?q='+encodeURIComponent(q)+
      '&fields='+encodeURIComponent('files(id,name,version,parents,mimeType),nextPageToken')+'&pageSize=100');
    return result.files||[];
  }
  async createManifest(space){
    if(!space.drive?.folderId)throw Error('A pasta do FotoCrachá não está pronta.');
    // Evita duplicação quando o Google recebeu a criação mas a resposta se perdeu.
    const existing=await this.listManifests(space.drive.folderId);
    if(existing.length){
      if(existing.length>1)throw Error('A pasta contém mais de um cadastro. Abra a pasta no Google Drive para conferir, sem apagar arquivos.');
      const found=await this.open(existing[0].id);
      if(found.state.id!==space.id)throw Error('A pasta contém dados de outro espaço. Não serão sobrescritos.');
      return {...found.link,recovered:true};
    }
    const raw=JSON.stringify(space);
    const item=await this.upload(MANIFEST,space.drive.folderId,new Blob([raw],{type:'application/json'}),'application/json');
    const metadata=await this.info(item.id);
    return {manifestId:item.id,folderId:space.drive.folderId,
      photosFolderId:space.drive.photosFolderId,version:String(metadata.version||item.version||''),
      snapshot:raw,canEdit:true,canShare:true,recovered:false};
  }
  async spaces(){
    const q="name = '"+MANIFEST+"' and trashed = false";
    const found=[];
    let page='';
    do{
      const path='/files?q='+encodeURIComponent(q)+'&fields='+encodeURIComponent('files(id,name,modifiedTime,parents),nextPageToken')
        +'&pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):'');
      const result=await this.request('GET',path);
      found.push(...(result.files||[]));
      page=result.nextPageToken||'';
    }while(page&&found.length<300);
    return found.sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||'')));
  }
  async openFromFolder(input){
    const id=driveItemId(input);
    let meta;
    try{meta=await this.info(id)}catch(e){
      if(e.status===403||e.status===404)throw Error('O Google não autorizou o FotoCrachá a abrir essa pasta ou arquivo. A permissão de compartilhamento não basta: o convidado precisa selecionar carometro.json pelo Google Picker. A configuração desse seletor ainda depende de uma chave pública.');
      throw e;
    }
    if(meta.trashed)throw Error('O item indicado está na lixeira.');
    if(meta.mimeType==='application/vnd.google-apps.folder'){
      let manifests;
      try{manifests=await this.listManifests(id)}catch(e){
        if(e.status===403||e.status===404)throw Error('Não foi possível ler o conteúdo da pasta pelo aplicativo. Se ela foi compartilhada por outra pessoa, autorize carometro.json no Google Picker.');
        throw e;
      }
      if(!manifests.length)throw Error('Nenhum arquivo carometro.json autorizado foi encontrado nessa pasta. Verifique se escolheu a pasta correta ou autorize o arquivo no Google Picker.');
      if(manifests.length>1)throw Error('Existem vários cadastros nessa pasta. Abra um arquivo específico para não escolher o errado.');
      return manifests[0].id;
    }
    if(meta.name!==MANIFEST)throw Error('Selecione a pasta do FotoCrachá ou o arquivo carometro.json, sem editar seu conteúdo.');
    return id;
  }
  async open(manifestId){
    const info=await this.info(manifestId);
    if(info.trashed)throw Error('O cadastro está na lixeira do Google Drive.');
    if(info.name!==MANIFEST)throw Error('Este arquivo não é um cadastro FotoCrachá.');
    const blob=await this.media(manifestId);
    if(blob.size>5*1024*1024)throw Error('Arquivo de cadastro acima de 5 MB.');
    const raw=await blob.text();
    let state;try{state=JSON.parse(raw)}catch{throw Error('O arquivo carometro.json não contém um cadastro válido. Não o edite manualmente.')}
    const folderId=state.drive?.folderId||info.parents?.[0];
    return {state,link:{
      manifestId,folderId,photosFolderId:state.drive?.photosFolderId||null,
      version:String(info.version||''),snapshot:raw,
      canEdit:!!info.capabilities?.canEdit,canShare:!!info.capabilities?.canShare
    }};
  }
  async ensureUnchanged(link){
    const remote=await this.info(link.manifestId);
    if(remote.trashed)throw Error('O cadastro foi movido para a lixeira.');
    if(!remote.capabilities?.canEdit)throw Error('O Google Drive informa que você não tem mais permissão para editar esta pasta.');
    if(!link.snapshot)throw Error('A referência local de salvamento não está disponível. Reabra o espaço para evitar sobrescrever dados.');
    if(String(remote.version)!==String(link.version)){
      const body=await this.media(link.manifestId);
      if(body.size>5*1024*1024)throw Error('O cadastro no Drive excede 5 MB.');
      const raw=await body.text();
      // Google Drive incrementa version também ao modificar metadados e permissões.
      // Só é conflito quando o conteúdo efetivamente mudou desde a abertura.
      let equal=raw===link.snapshot;
      if(!equal)try{equal=JSON.stringify(JSON.parse(raw))===JSON.stringify(JSON.parse(link.snapshot))}catch{}
      if(!equal){
        const e=new Error('O cadastro no Google Drive foi modificado desde que você o abriu. O FotoCrachá não sobrescreveu os dados. Reabra o espaço para conferir as mudanças; edite um de cada vez.');
        e.code='CONFLICT';throw e;
      }
    }
    return {...link,version:String(remote.version||'')};
  }
  async save(space,link){
    if(!link?.canEdit)throw Error('O Google Drive não permite editar este espaço.');
    const current=await this.ensureUnchanged(link);
    const raw=JSON.stringify(space);
    const blob=new Blob([raw],{type:'application/json'});
    if(blob.size>5*1024*1024)throw Error('O cadastro ultrapassou o limite de 5 MB.');
    const response=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(link.manifestId)+
      '?uploadType=media&fields=id,version',{
      method:'PATCH',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:blob
    });
    if(!response.ok)throw await this.fail(response);
    const result=await response.json();
    return {...current,version:String(result.version||((await this.info(link.manifestId)).version)||''),snapshot:raw};
  }
  async share(folderId,email,role='reader'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('E-mail inválido.');
    if(!['reader','writer'].includes(role))throw Error('Permissão inválida.');
    return this.request('POST','/files/'+encodeURIComponent(folderId)+'/permissions?sendNotificationEmail=true&fields=id,role,emailAddress',
      {type:'user',role,emailAddress:email.trim()});
  }
  async permissions(folderId){
    const o=await this.request('GET','/files/'+encodeURIComponent(folderId)+'/permissions?fields='+encodeURIComponent('permissions(id,type,emailAddress,role)'));
    return o.permissions||[];
  }
  async revoke(folderId,id){
    await this.request('DELETE','/files/'+encodeURIComponent(folderId)+'/permissions/'+encodeURIComponent(id));
  }
}

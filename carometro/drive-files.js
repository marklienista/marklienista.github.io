import {Drive} from './drive.js';
export class DriveFiles extends Drive{
  async folder(name,parent){
    const data={name,mimeType:'application/vnd.google-apps.folder'};
    if(parent)data.parents=[parent];
    return this.request('POST','/files?fields=id,name',data);
  }
  async info(id){
    return this.request('GET','/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent('id,name,version,parents,capabilities(canEdit,canShare),trashed'));
  }
  async upload(name,parent,blob,mime){
    if(blob.size>5*1024*1024)throw Error('Arquivo acima do limite de 5 MB.');
    if(!this.ready())throw Error('Autorize o Drive.');
    const boundary='cm_'+Math.random().toString(36).slice(2),meta={name,mimeType:mime,parents:[parent]};
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(meta),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',blob,'\r\n--'+boundary+'--']);
    const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version',{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'multipart/related; boundary='+boundary},body});
    if(!r.ok)throw await this.fail(r);
    return r.json();
  }
  async media(id){
    if(!this.ready())throw Error('Conecte o Drive.');
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+this.token}});
    if(!r.ok)throw await this.fail(r);
    return r.blob();
  }
  async newWorkspace(space){
    const root=await this.folder('Carômetro — '+space.school.name.slice(0,70));
    const photos=await this.folder('Fotos',root.id);
    space.drive={folderId:root.id,photosFolderId:photos.id};
    const doc=await this.upload('carometro.json',root.id,new Blob([JSON.stringify(space)],{type:'application/json'}),'application/json');
    const meta=await this.info(doc.id);
    return {manifestId:doc.id,folderId:root.id,version:String(meta.version||''),canEdit:true,canShare:true};
  }
  async spaces(){
    const q="name = 'carometro.json' and trashed = false";
    const data=await this.request('GET','/files?q='+encodeURIComponent(q)+'&fields='+encodeURIComponent('files(id,name,modifiedTime),nextPageToken')+'&pageSize=100');
    return data.files||[];
  }
  async open(manifestId){
    const info=await this.info(manifestId);
    if(info.trashed)throw Error('Arquivo na lixeira.');
    const blob=await this.media(manifestId);
    if(blob.size>5*1024*1024)throw Error('Carômetro muito grande.');
    const state=JSON.parse(await blob.text());
    return {state,link:{manifestId,folderId:state.drive?.folderId||info.parents?.[0],version:String(info.version||''),canEdit:!!info.capabilities?.canEdit,canShare:!!info.capabilities?.canShare}};
  }
  async save(state,link){
    if(!link?.canEdit)throw Error('Você não pode editar este carômetro.');
    const remote=await this.info(link.manifestId);
    if(!remote.capabilities?.canEdit)throw Error('Sua permissão de edição foi retirada.');
    if(String(remote.version)!==String(link.version))throw Object.assign(new Error('Há mudanças feitas por outra pessoa. Recarregue antes de salvar.'),{code:'CONFLICT'});
    const data=new Blob([JSON.stringify(state)],{type:'application/json'});
    if(data.size>5*1024*1024)throw Error('Arquivo grande demais.');
    const r=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(link.manifestId)+'?uploadType=media&fields=id,version',{method:'PATCH',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:data});
    if(!r.ok)throw await this.fail(r);
    const result=await r.json();
    return {...link,version:String(result.version||((await this.info(link.manifestId)).version))};
  }
  async share(folderId,email,role='reader'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('E-mail inválido.');
    if(!['reader','writer'].includes(role))throw Error('Permissão inválida.');
    return this.request('POST','/files/'+encodeURIComponent(folderId)+'/permissions?sendNotificationEmail=true&fields=id,role,emailAddress',{type:'user',role,emailAddress:email.trim()});
  }
  async permissions(folderId){
    const o=await this.request('GET','/files/'+encodeURIComponent(folderId)+'/permissions?fields='+encodeURIComponent('permissions(id,type,emailAddress,role)'));
    return o.permissions||[];
  }
  async revoke(folderId,id){
    await this.request('DELETE','/files/'+encodeURIComponent(folderId)+'/permissions/'+encodeURIComponent(id));
  }
}

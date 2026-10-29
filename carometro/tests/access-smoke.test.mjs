/* Testes de regressão sem rede real, credenciais ou fotografias de estudantes.
   Executar: node --test carometro/tests/access-smoke.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Drive,SCOPE} from '../drive.js';
import {DriveFiles,driveItemId} from '../drive-files.js';
const CLIENT='123456789-test.apps.googleusercontent.com';
const FOLDER='application/vnd.google-apps.folder';
const IDS={root:'root-ficticio-0001',photos:'photos-ficticio-0001',doc:'manifest-ficticio-001',image:'image-ficticio-0001',other:'outside-ficticio-001'};
const data=()=>({schema_version:1,id:'workspace-ficticio',school:{name:'Escola fictícia',logoFileId:null},classes:[],students:[{id:'aluno-1',name:'Estudante fictício',photoId:IDS.image}],enrollments:[],drive:{folderId:IDS.root,photosFolderId:IDS.photos}});
function authenticate(t,answer,email='teste@example.invalid'){
  const prior=globalThis.google;
  let requested;
  globalThis.google={accounts:{oauth2:{initTokenClient:options=>{
    requested=options;
    return {requestAccessToken:()=>options.callback(answer)};
  }}}};
  t.after(()=>{if(prior===undefined)delete globalThis.google;else globalThis.google=prior});
  t.mock.method(globalThis,'fetch',async()=>Response.json({user:{emailAddress:email}}));
  return ()=>requested;
}
function storage(t,{reader=false}={}){
  const state=data(),calls=[];
  let raw=JSON.stringify(state);
  const caps={canEdit:!reader,canShare:!reader,canDownload:true};
  const meta=new Map([
    [IDS.root,{id:IDS.root,name:'FotoCrachá — Escola fictícia',mimeType:FOLDER,parents:[],capabilities:{...caps}}],
    [IDS.photos,{id:IDS.photos,name:'Fotos',mimeType:FOLDER,parents:[IDS.root],capabilities:{...caps}}],
    [IDS.doc,{id:IDS.doc,name:'carometro.json',mimeType:'application/json',parents:[IDS.root],size:raw.length,version:'1',capabilities:{...caps}}],
    [IDS.image,{id:IDS.image,name:'foto-aluno-1.jpg',mimeType:'image/jpeg',parents:[IDS.photos],size:3,capabilities:{...caps}}],
    [IDS.other,{id:IDS.other,name:'pessoal.jpg',mimeType:'image/jpeg',parents:['pasta-fora-0001'],size:3,capabilities:{...caps}}]
  ]);
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url);calls.push({url:u.href,method:options.method||'GET'});
    assert.equal(u.origin,'https://www.googleapis.com');
    const id=u.pathname.split('/files/')[1]?.split('/')[0];
    if(u.pathname.includes('/permissions'))return Response.json({permissions:[{id:'owner',role:'owner',type:'user'}]});
    if(u.searchParams.get('alt')==='media')return new Response(id===IDS.doc?raw:new Uint8Array([1,2,3]),{headers:{'Content-Type':id===IDS.doc?'application/json':'image/jpeg'}});
    if(options.method==='PATCH'){raw=await options.body.text();return Response.json({id,version:'2'})}
    if(id&&meta.has(id))return Response.json(meta.get(id));
    return Response.json({error:{message:'Not found'}},{status:404});
  });
  const drive=new DriveFiles(CLIENT);drive.token='fake-token';drive.until=Date.now()+3600000;drive.scopes=new Set([SCOPE]);
  return {drive,state,meta,calls,setRaw:value=>{raw=JSON.stringify(value)},mediaCalls:()=>calls.filter(c=>c.url.includes('alt=media'))};
}

test('OAuth solicita somente o escopo amplo aprovado e identifica a conta',async t=>{
  const request=authenticate(t,{access_token:'fake',scope:SCOPE,expires_in:3600});
  const drive=new Drive(CLIENT);
  assert.equal(await drive.authorize(),'teste@example.invalid');
  assert.equal(request().scope,'https://www.googleapis.com/auth/drive');
  assert.equal(request().include_granted_scopes,false);assert.equal(drive.ready(),true);
});
test('OAuth recusa autorização antiga drive.file',async t=>{
  authenticate(t,{access_token:'fake',scope:SCOPE+'.file',expires_in:3600});
  const drive=new Drive(CLIENT);await assert.rejects(drive.authorize(),{code:'SCOPE_REQUIRED'});assert.equal(drive.ready(),false);
});
test('Consentimento recusado não cria sessão',async t=>{
  authenticate(t,{error:'access_denied'});const drive=new Drive(CLIENT);
  await assert.rejects(drive.authorize(),/access_denied/);assert.equal(drive.token,null);
});
test('Reconexão com outra conta é recusada',async t=>{
  authenticate(t,{access_token:'fake',scope:SCOPE,expires_in:3600},'outra@example.invalid');
  const drive=new Drive(CLIENT);drive.email='original@example.invalid';
  await assert.rejects(drive.authorize(),{code:'ACCOUNT_CHANGED'});assert.equal(drive.token,null);assert.equal(drive.email,'original@example.invalid');
});
test('Token vencido e destino externo não recebem requisições',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;throw Error('Nenhuma rede esperada')});
  const drive=new Drive(CLIENT);await assert.rejects(drive.request('GET','/files'),{code:'AUTH'});
  drive.token='fake';drive.until=Date.now()+3600000;drive.scopes=new Set([SCOPE]);
  await assert.rejects(drive.request('GET','//outro.example.invalid/'),/inválido/);assert.equal(count,0);
});
test('Desconexão limpa token, conta e escopos da memória',()=>{
  const drive=new Drive(CLIENT);drive.token='fake';drive.email='teste@example.invalid';drive.scopes.add(SCOPE);drive.until=Date.now()+3600000;
  drive.disconnect();assert.equal(drive.token,null);assert.equal(drive.email,'');assert.equal(drive.scopes.size,0);
});
test('Cadastro e fotografia são lidos juntos sem Picker',async t=>{
  const f=storage(t),space=await f.drive.open(IDS.doc),photo=await f.drive.media(IDS.image);
  assert.equal(space.state.id,'workspace-ficticio');assert.equal(photo.size,3);assert.equal(photo.type,'image/jpeg');
});
test('Leitor abre a fotografia mas não grava alterações',async t=>{
  const f=storage(t,{reader:true}),opened=await f.drive.open(IDS.doc);
  assert.equal(opened.link.canEdit,false);assert.equal((await f.drive.media(IDS.image)).size,3);
  await assert.rejects(f.drive.save(opened.state,opened.link),{code:'READ_ONLY'});
  assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
});
test('Foto sem vínculo com o cadastro é bloqueada antes de download',async t=>{
  const f=storage(t);await f.drive.open(IDS.doc);const before=f.mediaCalls().length;
  await assert.rejects(f.drive.media(IDS.other),{code:'SPACE_BOUNDARY'});assert.equal(f.mediaCalls().length,before);
});
test('Foto referenciada fora da pasta é bloqueada antes de baixar bytes',async t=>{
  const f=storage(t);f.state.students[0].photoId=IDS.other;f.setRaw(f.state);
  await f.drive.open(IDS.doc);const before=f.mediaCalls().length;
  await assert.rejects(f.drive.media(IDS.other),{code:'SPACE_BOUNDARY'});assert.equal(f.mediaCalls().length,before);
});
test('JSON não pode redirecionar a pasta do espaço',async t=>{
  const f=storage(t);f.state.drive.folderId=IDS.other;f.setRaw(f.state);
  await assert.rejects(f.drive.open(IDS.doc),{code:'SPACE_BOUNDARY'});
});
test('Pasta Fotos movida para fora da raiz é recusada',async t=>{
  const f=storage(t);f.meta.get(IDS.photos).parents=[IDS.other];
  await assert.rejects(f.drive.open(IDS.doc),{code:'SPACE_BOUNDARY'});
});
test('Upload não pode apontar para pasta externa',async t=>{
  const f=storage(t);await f.drive.open(IDS.doc);
  await assert.rejects(f.drive.upload('foto-aluno-1.jpg',IDS.other,new Blob(['teste']),'image/jpeg'),{code:'SPACE_BOUNDARY'});
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('Editor salva somente o manifesto do espaço aberto',async t=>{
  const f=storage(t),opened=await f.drive.open(IDS.doc);opened.state.school.name='Nome atualizado';
  const result=await f.drive.save(opened.state,opened.link);
  assert.equal(JSON.parse(result.snapshot).school.name,'Nome atualizado');
  const patches=f.calls.filter(c=>c.method==='PATCH');assert.equal(patches.length,1);assert.ok(patches[0].url.includes(IDS.doc));
});
test('Destino de salvamento adulterado não é utilizado',async t=>{
  const f=storage(t),opened=await f.drive.open(IDS.doc);
  await assert.rejects(f.drive.save(opened.state,{...opened.link,manifestId:IDS.other}),{code:'SPACE_BOUNDARY'});
  assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
});
test('Versão de metadados sem mudança de conteúdo não é conflito',async t=>{
  const f=storage(t),opened=await f.drive.open(IDS.doc);f.meta.get(IDS.doc).version='2';
  assert.equal((await f.drive.ensureUnchanged(opened.link)).version,'2');
});
test('Mudança real remota bloqueia sobrescrita',async t=>{
  const f=storage(t),opened=await f.drive.open(IDS.doc);f.meta.get(IDS.doc).version='2';f.state.school.name='Alterado remotamente';f.setRaw(f.state);
  await assert.rejects(f.drive.save(opened.state,opened.link),{code:'CONFLICT'});assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
});
test('Compartilhamento e revogação ficam vinculados ao espaço',async t=>{
  const f=storage(t);await f.drive.open(IDS.doc);
  await assert.rejects(f.drive.share(IDS.other,'teste@example.invalid'),{code:'SPACE_BOUNDARY'});
  await assert.rejects(f.drive.revoke(IDS.root,'owner'),{code:'SPACE_BOUNDARY'});
  assert.equal(f.calls.some(c=>c.method==='DELETE'||c.method==='POST'),false);
});
test('IDs de links Google são extraídos sem aceitar domínios externos',()=>{
  assert.equal(driveItemId('https://drive.google.com/drive/folders/'+IDS.root),IDS.root);
  assert.throws(()=>driveItemId('https://outro.example.invalid/drive/folders/'+IDS.root),/oficial/);
});

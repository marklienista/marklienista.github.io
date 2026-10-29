import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveFiles} from '../drive-files.js';
import {SCOPE} from '../drive.js';
import {newCarometro,addStudent,setPhoto,configureSpace} from '../model.js';
const FOLDER='application/vnd.google-apps.folder';
function fixture(t){
  const files=new Map(),calls=[];let count=0;
  const make=(meta,raw='')=>{const id=meta.id||'ficticio-file-'+(++count);const file={id,name:meta.name,mimeType:meta.mimeType,parents:meta.parents||[],appProperties:meta.appProperties||{},version:'1',capabilities:{canEdit:true,canShare:true,canDownload:true},size:raw.length,...meta,raw};files.set(id,file);return file};
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET';calls.push({url:u.href,method});
    assert.equal(u.origin,'https://www.googleapis.com');
    const id=u.pathname.split('/files/')[1]?.split('/')[0];
    if(u.searchParams.get('alt')==='media'){const file=files.get(id);return file?new Response(file.raw,{headers:{'Content-Type':file.mimeType}}):Response.json({}, {status:404})}
    if(u.pathname.startsWith('/upload/')){
      const raw=await options.body.text(),parts=raw.split('--'+options.headers['Content-Type'].split('boundary=')[1]);
      const metadata=JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const payload=parts[2].slice(parts[2].indexOf('\r\n\r\n')+4).replace(/\r\n$/,'');
      if(method==='PATCH'){const file=files.get(id);file.raw=payload;file.appProperties={...file.appProperties,...metadata.appProperties};file.version=String(Number(file.version)+1);return Response.json({id,version:file.version})}
      const file=make(metadata,payload);return Response.json({id:file.id,version:file.version});
    }
    if(method==='POST'){const file=make(JSON.parse(options.body));return Response.json(file)}
    if(id){const file=files.get(id);return file?Response.json(file):Response.json({}, {status:404})}
    const q=u.searchParams.get('q')||'',parent=q.match(/^'([^']+)' in parents/)?.[1];return Response.json({files:[...files.values()].filter(f=>f.name==='carometro.json'&&(!parent||f.parents.includes(parent)))});
  });
  const drive=new DriveFiles('123456-test.apps.googleusercontent.com');drive.token='fake';drive.until=Date.now()+3600000;drive.scopes=new Set([SCOPE]);
  return {drive,files,calls,make};
}
async function create(f,s=newCarometro()){const state={...s,drive:await f.drive.prepareWorkspace(s)},link=await f.drive.createManifest(state);return {state,link}}
test('Primeiro salvamento aceita carômetro sem nome nem instituição',async t=>{const f=fixture(t),{state,link}=await create(f);const json=JSON.parse(f.files.get(link.manifestId).raw);assert.equal(json.title,'');assert.equal(json.school.name,'');assert.equal(json.classes.length,0);assert.equal(json.enrollments.length,0);assert.equal(f.files.size,3);assert.ok(link.manifestId);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0)});
test('Nome e instituição vão no índice junto do cadastro, sem renomear pastas',async t=>{const f=fixture(t),{state,link}=await create(f);const name=f.files.get(link.folderId).name;const updated=configureSpace(state,{title:'Oficina',institution:'Projeto fictício'});await f.drive.save(updated,link);assert.equal(f.files.get(link.manifestId).appProperties.fcTitle,'Oficina');assert.equal(f.files.get(link.manifestId).appProperties.fcInstitution,'Projeto fictício');assert.equal(f.files.get(link.folderId).name,name);assert.equal(JSON.parse(f.files.get(link.manifestId).raw).title,'Oficina')});
test('Abrir e salvar sem grupos mantém arquivo e IDs',async t=>{const f=fixture(t);let {state,link}=await create(f);const id=link.manifestId;state=addStudent(state);await f.drive.save(state,link);const reloaded=await f.drive.open(id);assert.equal(reloaded.state.students.length,1);assert.equal(reloaded.state.students[0].name,'');assert.equal(reloaded.state.classes.length,0);assert.equal(reloaded.link.manifestId,id)});
test('Imagem de pessoa sem turma usa a mesma pasta protegida',async t=>{const f=fixture(t);let {state,link}=await create(f,addStudent(newCarometro()));const person=state.students[0];const uploaded=await f.drive.upload('foto-'+person.id+'.jpg',link.photosFolderId,new Blob(['abc'],{type:'image/jpeg'}),'image/jpeg');state=setPhoto(state,person.id,uploaded.id);await f.drive.save(state,link);assert.equal((await f.drive.media(uploaded.id)).size,3)});
test('Leitor continua impedido de editar',async t=>{const f=fixture(t),{state,link}=await create(f);f.files.get(link.folderId).capabilities.canEdit=false;await assert.rejects(f.drive.save(state,link),{code:'READ_ONLY'});assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0)});
test('Referência a foto fora do carômetro continua bloqueada',async t=>{const f=fixture(t);let {state,link}=await create(f,addStudent(newCarometro()));const outside=f.make({name:'fora.jpg',mimeType:'image/jpeg',parents:['outra-pasta-ficticia']},'abc');state=setPhoto(state,state.students[0].id,outside.id);await assert.rejects(f.drive.save(state,link),{code:'SPACE_BOUNDARY'});assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0)});
test('Conteúdo remoto alterado não é sobrescrito',async t=>{const f=fixture(t),{state,link}=await create(f);const remote=f.files.get(link.manifestId);remote.raw=JSON.stringify({...state,title:'Outra edição'});remote.version='2';await assert.rejects(f.drive.save(state,link),{code:'CONFLICT'});assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0)});
test('Metadados não causam falso conflito',async t=>{const f=fixture(t),{state,link}=await create(f);f.files.get(link.manifestId).version='2';const next=await f.drive.save({...state,title:'Novo nome'},link);assert.equal(next.version,'3');assert.equal(JSON.parse(next.snapshot).title,'Novo nome')});
test('Rótulos multibyte respeitam o limite de propriedade do Google',async t=>{const f=fixture(t),{link}=await create(f,newCarometro({title:'á'.repeat(140),institution:'あ'.repeat(140)}));for(const [key,value] of Object.entries(f.files.get(link.manifestId).appProperties))assert.ok(new TextEncoder().encode(key+value).length<=124)});

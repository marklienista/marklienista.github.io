import {DriveFiles} from './drive-files.js?v=0.13';
import {sameSnapshot,createRemoteWatch,savePresentation} from './remote-watch.mjs?v=0.16';
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
export function copyDriveAccess(source,clientId){
  const reader=new DriveFiles(clientId);
  Object.assign(reader,{token:source.token,until:source.until,email:source.email,scopes:new Set(source.scopes)});
  return reader;
}
export async function inspectOpenCarometro(c){
  const meta=await c.drive.info(c.id);
  if(meta.trashed||meta.name!=='carometro.json'||!meta.parents?.includes(c.link.folderId)){
    throw Object.assign(Error('O cadastro não está mais na pasta esperada. Confira o acesso no Google Drive.'),{code:'SPACE_BOUNDARY'});
  }
  if(String(meta.version)===String(c.link.version)&&!!meta.capabilities?.canEdit===!!c.link.canEdit){
    // A permissão de compartilhar vem da pasta, não deste arquivo isolado.
    return {changed:false,version:String(meta.version)};
  }
  // A leitura de verificação não altera o vínculo de salvamento da sessão principal.
  const reader=copyDriveAccess(c.drive,c.clientId);
  try{
    const remote=await reader.open(c.id);
    if(remote.state.id!==c.spaceId)throw Object.assign(Error('O arquivo remoto não corresponde a este carômetro.'),{code:'SPACE_BOUNDARY'});
    return {changed:!sameSnapshot(remote.link.snapshot,c.link.snapshot),version:remote.link.version,canEdit:remote.link.canEdit,canShare:remote.link.canShare};
  }finally{reader.disconnect()}
}
export function mountSyncStatus({session:S,getSaveState,onRemote=()=>{},onReload,inspect=inspectOpenCarometro,interval=60000}){
  const host=document.getElementById('saveStatus'),recovery=document.querySelector('.save-recovery');
  const area=make('aside','save-area'),card=make('div','save-tile'),symbol=make('span','save-symbol'),text=make('div','save-copy');
  const label=make('strong','save-label'),sub=make('span','save-destination','no Google Drive'),time=make('span','save-time');
  const icon=make('img','drive-product-icon');icon.src='https://www.gstatic.com/images/branding/productlogos/drive_2026/v2/web-64dp/logo_drive_2026_color_2x_web_64dp.png';icon.alt='';icon.width=24;icon.height=24;icon.referrerPolicy='no-referrer';icon.onerror=()=>icon.hidden=true;
  symbol.setAttribute('aria-hidden','true');icon.setAttribute('aria-hidden','true');
  text.append(label,sub,time);card.append(symbol,text,icon);card.setAttribute('aria-hidden','true');
  const detail=make('p','save-detail'),reload=make('button','light','Atualizar dados');reload.id='updateRemoteBtn';reload.type='button';reload.hidden=true;
  host.className='visually-hidden';host.setAttribute('aria-atomic','true');
  area.append(card,host,detail,reload,recovery);document.querySelector('.workspace-head').append(area);
  let timer=null,stopped=false;
  const watch=createRemoteWatch({
    context:()=>{const p=getSaveState();return {id:S.link?.manifestId,email:S.drive?.email,spaceId:S.space.id,clientId:S.config.clientId,drive:S.drive,link:S.link,ready:S.isCloud()&&S.hasSpace(),visible:!document.hidden&&document.body.dataset.page==='editor',busy:p.saving||p.refreshing||p.opening||S.loadingPhotos}},
    inspect,onChange:()=>render(),onRemote
  });
  function render(){
    const p=getSaveState(),remote=watch.getState(),v=savePresentation({...p,remote,connected:S.isCloud(),linked:!!S.link,dirty:S.dirty,reader:S.link?.canEdit===false});
    area.dataset.state=v.kind;label.textContent=v.label;symbol.textContent=v.symbol;detail.textContent=v.detail;
    const stamp=p.savedAt?(new Date(p.savedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):'';
    time.textContent=stamp&&['saved','reader','warning'].includes(v.kind)?stamp:'';time.hidden=!time.textContent;
    const spoken=v.label+' no Google Drive. '+v.detail;if(host.textContent!==spoken)host.textContent=spoken;
    card.title=v.detail;
    const conflict=remote.changed||p.error?.code==='CONFLICT';reload.hidden=!conflict;
    reload.disabled=!!p.saving||!!p.refreshing;
    document.getElementById('retrySaveBtn').hidden=!p.error||conflict;
    document.getElementById('reauthorizeBtn').hidden=!p.error||conflict;
    document.getElementById('reloadRemoteBtn').hidden=true;
  }
  reload.onclick=async()=>{try{await onReload()}catch(error){detail.textContent=error.message||'Não foi possível atualizar.'}};
  const resume=()=>{if(!stopped)void watch.check()};
  const schedule=()=>{if(timer)clearTimeout(timer);if(stopped)return;timer=setTimeout(async()=>{await watch.check();schedule()},interval)};
  const visibility=()=>{if(!document.hidden)resume()};
  const hide=()=>{stopped=true;clearTimeout(timer)};
  const show=()=>{stopped=false;schedule();resume()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  schedule();render();
  return {render,check:watch.check,reset:watch.reset,hasRemoteChange:watch.hasChange,markChanged:watch.markChanged,
    destroy(){stopped=true;clearTimeout(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);document.removeEventListener('visibilitychange',visibility)}};
}

/* FotoCrachá 0.16 — consulta somente o manifesto aberto. Não grava nem recarrega dados. */
export function sameSnapshot(a,b){
  if(a===b)return true;
  const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
  try{return JSON.stringify(ordered(JSON.parse(a)))===JSON.stringify(ordered(JSON.parse(b)))}catch{return false}
}
export function createRemoteWatch({context,inspect,onChange=()=>{},onRemote=()=>{},now=()=>Date.now(),minInterval=10000}){
  let identity='',baseline=null,flight=null,lastAttempt=0,epoch=0;
  let state={changed:false,error:null,checkedAt:null};
  const currentIdentity=c=>c?.id&&c?.email?c.email+'|'+c.id:'';
  function sync(){
    const c=context(),key=currentIdentity(c);
    if(key!==identity||c?.link!==baseline){identity=key;baseline=c?.link||null;lastAttempt=0;epoch++;state={changed:false,error:null,checkedAt:null}}
    return c;
  }
  function emit(){onChange({...state})}
  function reset(){identity='';baseline=null;epoch++;sync();emit()}
  function markChanged(){sync();state={...state,changed:true,error:null};onRemote();emit()}
  async function check({force=false}={}){
    const c=sync();
    if(!identity||!c.ready||!c.visible||c.busy)return {...state};
    if(flight)return flight;
    if(!force&&lastAttempt&&now()-lastAttempt<minInterval)return {...state};
    lastAttempt=now();const serial=epoch,link=c.link;
    const stillCurrent=()=>{const latest=context();return serial===epoch&&currentIdentity(latest)===identity&&latest.link===link&&latest.ready&&!latest.busy};
    const promise=(async()=>{
      try{
        const result=await inspect(c);
        if(!stillCurrent())return {...state};
        state={changed:!!result.changed,error:null,checkedAt:now()};
        if(result.changed)onRemote();
        else if(result.version)link.version=String(result.version); // Somente metadados; sem autosave.
        if(result.canEdit!==undefined)link.canEdit=!!result.canEdit;
        if(result.canShare!==undefined)link.canShare=!!result.canShare;
        emit();return {...state};
      }catch(error){
        if(stillCurrent()){state={...state,error};emit()}
        return {...state};
      }
    })();
    flight=promise;
    try{return await promise}finally{if(flight===promise)flight=null}
  }
  return {sync,check,reset,markChanged,getState(){sync();return {...state}},hasChange(){sync();return state.changed}};
}
/* Estado textual independente do DOM; "salvo" nunca significa coedição em tempo real. */
export function savePresentation({connected=true,linked=false,dirty=false,saving=false,refreshing=false,reader=false,error=null,remote={},savedAt=null}={}){
  if(refreshing)return {kind:'loading',label:'Atualizando…',symbol:'↻',detail:'Buscando a versão do Google Drive.'};
  if(saving)return {kind:'saving',label:'Salvando…',symbol:'↻',detail:'Aguarde a confirmação antes de sair.'};
  if(remote.changed||error?.code==='CONFLICT')return {kind:'remote',label:'Nova versão',symbol:'!',detail:dirty?'Há alterações locais pendentes. Atualizar exige decidir sobre elas.':'Há alterações no Google Drive. Atualize os dados para continuar.'};
  if(error)return {kind:'error',label:'Não salvo',symbol:'!',detail:error.message||'Confira a conexão e tente novamente.'};
  if(!connected)return {kind:'offline',label:dirty?'Pendente':'Reconectar',symbol:'!',detail:'Reconecte a mesma conta Google; não feche com alterações pendentes.'};
  if(dirty||!linked)return {kind:'pending',label:'Pendente',symbol:'…',detail:'Alterações aguardando envio ao Google Drive.'};
  if(remote.error)return {kind:'warning',label:reader?'Somente leitura':'Salvo',symbol:'!',detail:'Não foi possível verificar atualizações. A versão exibida pode estar desatualizada.'};
  if(reader)return {kind:'reader',label:'Somente leitura',symbol:'◉',detail:'Esta conta não pode alterar este carômetro.'};
  return {kind:'saved',label:'Salvo',symbol:'✓',detail:savedAt?'Gravação confirmada às '+new Date(savedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.':'Cadastro carregado do Google Drive.'};
}

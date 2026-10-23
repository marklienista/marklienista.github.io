'use strict';
/* Provider boundary. Supabase Auth + PostgREST only, no third-party runtime CDN.
 * Auth session is per tab (sessionStorage), password is never persisted.
 * Activation requires the approved deployment configuration.
 */
(() => {
 const SESSION='apertaletra:adult-auth:v1';
 class CloudError extends Error {
  constructor(message,code='network',status=0){super(message);this.name='CloudError';this.code=code;this.status=status;}
 }
 const parse=async r=>{try{return await r.json();}catch{return null;}};
 // Authentication has no draft. A missing response does not prove that signup failed.
 function requestMessage(path,code,status=0){
  const auth=path.startsWith('/auth/v1/'),signup=path.startsWith('/auth/v1/signup');
  if(auth){
   const known={
    invalid_credentials:'E-mail ou senha não conferem. Confira os dados e use Entrar.',
    email_not_confirmed:'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.',
    email_address_not_authorized:'O envio de confirmação ainda não está configurado para este endereço. É necessário ajustar o serviço de cadastro.',
    email_address_invalid:'Confira se o endereço de e-mail foi digitado corretamente.',
    weak_password:'A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.',
    over_email_send_rate_limit:'O serviço atingiu o limite de e-mails de confirmação. Confira se uma mensagem já chegou antes de tentar novamente mais tarde.',
    over_request_rate_limit:'Houve muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.',
    signup_disabled:'A criação de contas está indisponível no serviço. Não é um problema com sua senha.',
    user_already_exists:'Confira seu e-mail e use Entrar com a conta que você já cadastrou.'
   };
   if(known[code])return known[code];
   if(code==='network'||code==='request_timeout'||code==='invalid_response'){
    const reason=code==='request_timeout'?'O serviço demorou para responder. ':'';
    return reason+(signup?'Não foi possível confirmar a resposta do cadastro. Confira seu e-mail: se a confirmação chegou, conclua e use Entrar. Não repita o cadastro antes de conferir.':'Não foi possível comunicar com o serviço de acesso. Confira a conexão e tente Entrar novamente.');
   }
   if(status===429)return 'O serviço recebeu muitas tentativas. Aguarde antes de tentar novamente.';
   return signup?'Não foi possível concluir a solicitação de cadastro. Confira seu e-mail antes de tentar novamente.':'Não foi possível concluir o acesso. Confira a mensagem e tente novamente.';
  }
  if(code==='network'||code==='request_timeout')return 'Sem confirmação da nuvem. O rascunho fica apenas neste navegador.';
  return status===401?'Entre novamente para sincronizar.':status===403?'A conta não tem acesso a este texto.':'Não foi possível concluir a solicitação.';
 }
 class Cloud {
  constructor(config,fetcher=globalThis.fetch.bind(globalThis)){
   this.config=config;this.fetcher=fetcher;this.session=null;this.user=null;this.epoch=0;this.refreshing=null;
   this.url=(config.supabaseUrl||'').replace(/\/$/,'');
  }
  get enabled(){
   if(!this.config.cloudEnabled||!this.config.architectureDecision||!this.config.databaseRelease)return false;
   try{const u=new URL(this.url);return u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&this.validKey(this.config.publishableKey);}catch{return false;}
  }
  validKey(key){
   if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||''))return true;
   try{return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
  }
  requireEnabled(){if(!this.enabled)throw new CloudError(this.config.unavailableReason||'Nuvem não configurada.','not_configured');}
  async request(path,{method='GET',body,token,signal}={}){
   this.requireEnabled();let timedOut=false;const controller=new AbortController(),timer=setTimeout(()=>{timedOut=true;controller.abort();},path.startsWith('/auth/v1/')?30000:12000);
   const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
   try{
    const response=await this.fetcher(this.url+path,{method,headers:{apikey:this.config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    const data=await parse(response);
    if(!response.ok){const code=data?.error_code||(typeof data?.code==='string'?data.code:'request_failed');throw new CloudError(requestMessage(path,code,response.status),code,response.status);}
    if(data===null&&response.status!==204)throw new CloudError(requestMessage(path,'invalid_response'),'invalid_response',response.status);
    return data;
   }catch(error){if(error instanceof CloudError)throw error;const code=timedOut?'request_timeout':'network';throw new CloudError(requestMessage(path,code),code);}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }
  remember(session){
   this.session=session;
   try{if(session)sessionStorage.setItem(SESSION,JSON.stringify(session));else sessionStorage.removeItem(SESSION);}catch{/* A session may still work until this page closes. */}
  }
  async verify(session){
   if(!session?.access_token)throw new CloudError('Entre com a conta adulta.','auth',401);
   const user=await this.request('/auth/v1/user',{token:session.access_token});
   if(!user?.id||user.is_anonymous||!user.email)throw new CloudError('Use uma conta adulta com e-mail.','auth',401);
   return user;
  }
  async restore(){
   if(!this.enabled)return null;
   let saved=null;
   // Email confirmation may return an implicit session. Remove tokens from URL immediately.
   const params=new URLSearchParams(location.hash.slice(1));
   if(params.has('access_token')){
    saved={access_token:params.get('access_token'),refresh_token:params.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(params.get('expires_in')||0)};
    history.replaceState(null,'',location.pathname+location.search);
   }else{try{saved=JSON.parse(sessionStorage.getItem(SESSION));}catch{}}
   if(!saved)return null;
   const epoch=this.epoch;this.session=saved;
   try{await this.accessToken();const user=await this.verify(this.session);if(epoch!==this.epoch)return null;this.user=user;this.remember(this.session);return user;}
   catch{if(epoch===this.epoch){this.user=null;this.remember(null);}return null;}
  }
  async login(email,password){
   const epoch=++this.epoch;
   const data=await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
   const session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+data.expires_in};
   const user=await this.verify(session);if(epoch!==this.epoch)throw new CloudError('Sessão mudou. Entre novamente.','session_changed');
   this.user=user;this.remember(session);return user;
  }
  async signup(email,password){
   // Do not disable email verification or modify project-wide Auth settings.
   const redirect=location.origin+location.pathname;
   const data=await this.request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:{email,password,data:{app:'apertaletra'}}});
   // Never treat a signup HTTP success as a logged-in or confirmed account.
   return {confirmationRequired:!data?.access_token};
  }
  async accessToken(){
   if(!this.session)throw new CloudError('Entre para sincronizar.','auth',401);
   if(this.session.expires_at>Date.now()/1000+60)return this.session.access_token;
   if(this.refreshing)return this.refreshing;
   const epoch=this.epoch,refresh=this.session.refresh_token;
   this.refreshing=(async()=>{
    const data=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});
    if(epoch!==this.epoch)throw new CloudError('Sessão mudou.','session_changed');
    this.remember({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+data.expires_in});return data.access_token;
   })().finally(()=>{this.refreshing=null;});return this.refreshing;
  }
  async logout(){
   const token=this.session?.access_token;this.epoch++;this.user=null;this.remember(null);
   if(!token)return true;
   try{await this.request('/auth/v1/logout?scope=local',{method:'POST',token});return true;}catch{return false;}
  }
  async rest(path,options={}){
   const epoch=this.epoch,owner=this.user?.id,token=await this.accessToken();
   if(epoch!==this.epoch||owner!==this.user?.id)throw new CloudError('Sessão mudou; solicitação cancelada.','session_changed');
   const result=await this.request('/rest/v1/'+path,{...options,token});
   if(epoch!==this.epoch||owner!==this.user?.id)throw new CloudError('Sessão mudou; resultado ignorado.','session_changed');return result;
  }
  owner(){if(!this.user?.id)throw new CloudError('Entre para acessar seus textos.','auth',401);return this.user.id;}
  async list(expected){const uid=this.assertOwner(expected),all=[];let offset=0;while(true){const rows=await this.rest('apertaletra_texts?select=*&user_id=eq.'+encodeURIComponent(uid)+'&order=updated_at.desc,id&limit=100&offset='+offset)||[];all.push(...rows);if(rows.length<100)return all;offset+=rows.length;this.assertOwner(uid);}}
  assertOwner(expected){const uid=this.owner();if(expected&&uid!==expected)throw new CloudError('A conta mudou. Rascunho preservado na conta original.','session_changed');return uid;}
  async get(id,expected){const uid=this.assertOwner(expected);const rows=await this.rest('apertaletra_texts?select=*&user_id=eq.'+encodeURIComponent(uid)+'&id=eq.'+encodeURIComponent(id));return rows?.[0]||null;}
  async save(id,payload,baseRevision,mutationId,expected){
   this.assertOwner(expected);const rows=await this.rest('rpc/apertaletra_save_text',{method:'POST',body:{p_id:id,p_payload:payload,p_expected_revision:baseRevision,p_mutation_id:mutationId}});return Array.isArray(rows)?rows[0]:rows;
  }
  async entitlement(){const uid=this.owner();const rows=await this.rest('apertaletra_entitlements?select=application_id,schema_version,plan,status,starts_at,valid_until&user_id=eq.'+encodeURIComponent(uid));return effectiveEntitlement(rows?.[0]);}
 }
 function effectiveEntitlement(row,now=Date.now()){
  const active=(!row?.application_id||row.application_id==='apertaletra')&&row?.status==='active'&&(!row.starts_at||Date.parse(row.starts_at)<=now)&&(!row.valid_until||Date.parse(row.valid_until)>now);
  return {plan:active&&row.plan==='premium'?'premium':'free',status:row?.status||'active',validUntil:row?.valid_until||null};
 }
 globalThis.ALCloud={Cloud,CloudError,effectiveEntitlement};
 if(typeof module!=='undefined')module.exports=globalThis.ALCloud;
})();

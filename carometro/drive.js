/* FotoCrachá 0.12 — acesso amplo solicitado explicitamente; tokens só em memória.
   A limitação ao espaço é feita por DriveFiles, não pelo escopo Google. */
export const SCOPE='https://www.googleapis.com/auth/drive';
let identityPreparation;
export function prepareGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  if(!identityPreparation)identityPreparation=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>globalThis.google?.accounts?.oauth2?resolve():reject(Error('O login Google não ficou disponível.'));
    script.onerror=()=>reject(Error('Não foi possível carregar o login Google.'));
    document.head.append(script);
  }).catch(error=>{identityPreparation=null;throw error});
  return identityPreparation;
}
export class Drive{
  constructor(clientId){this.clientId=String(clientId||'');this.token=null;this.until=0;this.email='';this.scopes=new Set()}
  ready(){return !!this.token&&this.scopes.has(SCOPE)&&Date.now()<this.until-30000}
  async authorize(){
    if(!/^\d+-[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(this.clientId))throw Error('Identificador Google do aplicativo inválido.');
    if(!globalThis.google?.accounts?.oauth2)await prepareGoogleIdentity();
    const previousEmail=this.email;
    const response=await new Promise((resolve,reject)=>{
      const client=globalThis.google.accounts.oauth2.initTokenClient({
        client_id:this.clientId,scope:SCOPE,include_granted_scopes:false,
        callback:answer=>{
          if(answer?.error)return reject(Error(answer.error_description||answer.error));
          const scopes=new Set(String(answer?.scope||'').split(/\s+/));
          if(!answer?.access_token)return reject(Error('Autorização Google cancelada.'));
          if(!scopes.has(SCOPE))return reject(Object.assign(Error('O acesso amplo ao Drive não foi concedido. Nenhum arquivo foi alterado. Conecte novamente e confira as permissões solicitadas.'),{code:'SCOPE_REQUIRED'}));
          resolve(answer);
        },
        error_callback:()=>reject(Error('A janela do Google foi fechada ou bloqueada. Tente conectar novamente.'))
      });
      client.requestAccessToken({prompt:'select_account'});
    });
    this.token=response.access_token;this.scopes=new Set(String(response.scope).split(/\s+/));
    this.until=Date.now()+Number(response.expires_in||3500)*1000;
    try{
      const about=await this.request('GET','/about?fields=user(emailAddress)');
      const email=String(about.user?.emailAddress||'').toLowerCase();
      if(!email)throw Error('Não foi possível confirmar a conta Google conectada.');
      if(previousEmail&&previousEmail.toLowerCase()!==email){
        throw Object.assign(Error('A reconexão precisa usar a mesma conta para preservar as alterações pendentes. Use Trocar conta depois de concluir o salvamento.'),{code:'ACCOUNT_CHANGED'});
      }
      this.email=email;return email;
    }catch(error){this.token=null;this.until=0;this.scopes.clear();this.email=previousEmail;throw error}
  }
  disconnect(){this.token=null;this.until=0;this.email='';this.scopes.clear()}
  async request(method,path,payload){
    if(!this.ready())throw Object.assign(Error('A conexão com o Google expirou. Reconecte a mesma conta.'),{code:'AUTH',status:401});
    if(!path.startsWith('/')||path.startsWith('//'))throw Error('Caminho Google inválido.');
    const headers={Authorization:'Bearer '+this.token};
    if(payload!==undefined)headers['Content-Type']='application/json';
    const response=await fetch('https://www.googleapis.com/drive/v3'+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
    if(!response.ok)throw await this.fail(response);
    if(response.status===204)return {};
    return response.json();
  }
  async fail(response){
    let reason='';try{const data=await response.json();reason=data.error?.message||''}catch{}
    const hints={401:'Conecte novamente a mesma conta Google.',403:'Confira se essa conta tem a permissão necessária na pasta e se o administrador permite o aplicativo.',404:'O arquivo não existe ou não está compartilhado com a conta conectada.'};
    const error=new Error('Google Drive ('+response.status+'): '+(hints[response.status]||reason||response.statusText));
    error.status=response.status;return error;
  }
}

/* Adapter Google Drive v3: tokens OAuth transitórios, sem backend para fotos. */
export const SCOPE='https://www.googleapis.com/auth/drive.file';
export class Drive {
  constructor(clientId){this.clientId=String(clientId||'');this.token=null;this.until=0;this.email=''}
  ready(){return !!this.token&&Date.now()<this.until-30000}
  async authorize(){
    if(!/^[\d]+-[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(this.clientId))throw Error('Informe um Client ID OAuth Web do Google Cloud.');
    if(!globalThis.google?.accounts?.oauth2)await new Promise((yes,no)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=yes;script.onerror=()=>no(Error('Google indisponível.'));document.head.append(script);
    });
    const result=await new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:SCOPE,callback:response=>{
        if(response?.error)return reject(Error(response.error_description||response.error));
        if(!response?.access_token)return reject(Error('Autorização cancelada.'));
        resolve(response);
      }});
      client.requestAccessToken({prompt:'consent'});
    });
    this.token=result.access_token;this.until=Date.now()+Number(result.expires_in||3500)*1000;
    try{const info=await this.request('GET','/about?fields=user(emailAddress)');this.email=info.user?.emailAddress||''}catch{this.email=''}
    return this.email;
  }
  disconnect(){this.token=null;this.until=0;this.email=''}
  async request(method,path,payload){
    if(!this.ready())throw Error('Conexão Google expirada. Autorize novamente.');
    const headers={Authorization:'Bearer '+this.token};
    if(payload!==undefined)headers['Content-Type']='application/json';
    const response=await fetch('https://www.googleapis.com/drive/v3'+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
    if(!response.ok)throw await this.fail(response);
    if(response.status===204)return {};
    return response.json();
  }
  async fail(response){
    let reason='';try{const json=await response.json();reason=json.error?.message||''}catch{}
    const e=new Error('Google Drive ('+response.status+'): '+(reason||response.statusText));e.status=response.status;return e;
  }
}

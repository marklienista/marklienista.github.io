import {createServer,request as httpRequest} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {loadConfig,ISSUER,AUDIENCE,PROOF_ORIGINS} from './config.mjs';
import {createProvider} from './provider.mjs';
import {startBackend} from './backend.mjs';

// Local protocol fixture only. No real provider request, account or credential.
export async function protocolFixture({recordStoreForTest,sessionLedgerForTest}={}) {
  const key=await generateKeyPair('RS256',{extractable:false});
  const untrustedKey=await generateKeyPair('RS256',{extractable:false});
  const publicJwk=await exportJWK(key.publicKey);
  Object.assign(publicJwk,{kid:'local-fixture-only',alg:'RS256',use:'sig'});
  const codes=new Map();
  const stats={acceptedExchanges:0,refusedExchanges:0,codeRequests:0};
  const clients={
    A:{id:'cft005-client-A-fixture',secret:'A'.repeat(64),origin:'https://backend-a.cft005.test'},
    B:{id:'cft005-client-B-fixture',secret:'B'.repeat(64),origin:'https://backend-b.cft005.test'}
  };
  const configs=Object.fromEntries(Object.entries(clients).map(([product,client])=>[product,loadConfig({
    PRODUCT:product,PUBLIC_ORIGIN:client.origin,AUTH0_ISSUER:ISSUER,AUTH0_AUDIENCE:AUDIENCE,
    AUTH0_CLIENT_ID_A:clients.A.id,AUTH0_CLIENT_ID_B:clients.B.id,AUTH0_CLIENT_SECRET:client.secret,
    SYNTHETIC_SUBJECTS_JSON:JSON.stringify({'auth0|synthetic-u1':'U1','auth0|synthetic-u2':'U2'})
  })]));
  const issuerServer=createServer(async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
    if(req.url==='/.well-known/openid-configuration')return send(200,{
      issuer:ISSUER,authorization_endpoint:ISSUER+'authorize',token_endpoint:ISSUER+'oauth/token',
      jwks_uri:ISSUER+'.well-known/jwks.json',response_types_supported:['code'],response_modes_supported:['form_post'],
      grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['client_secret_basic'],
      id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']
    });
    if(req.url==='/.well-known/jwks.json')return send(200,{keys:[publicJwk]});
    if(req.url!=='/oauth/token'||req.method!=='POST')return send(404,{error:'not_found'});
    stats.codeRequests++;
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const code=codes.get(body.get('code'));codes.delete(body.get('code'));
    const basic=Buffer.from((req.headers.authorization??'').replace(/^Basic /i,''),'base64').toString('utf8');
    // Basic credentials use application/x-www-form-urlencoded, not just encodeURIComponent.
    const [id,secret]=basic.split(':').map(value=>decodeURIComponent(value.replace(/\+/g,' ')));
    const client=Object.values(clients).find(x=>id===x.id&&secret===x.secret);
    const challenge=createHash('sha256').update(body.get('code_verifier')??'').digest('base64url');
    if(!client||!code||code.clientId!==client.id||code.challenge!==challenge||
      body.get('redirect_uri')!==client.origin+'/auth/callback'||body.get('grant_type')!=='authorization_code'){
      stats.refusalChecks={clientValid:Boolean(client),codeExists:Boolean(code),clientMatches:code?.clientId===client?.id,
        pkceMatches:code?.challenge===challenge,redirectMatches:body.get('redirect_uri')===client?.origin+'/auth/callback',
        grantMatches:body.get('grant_type')==='authorization_code'};
      stats.refusedExchanges++;return send(400,{error:'invalid_grant'});
    }
    const now=Math.floor(Date.now()/1000);
    if(code.tokenEndpointDenial)return send(403,{error:'access_denied',error_description:'Unauthorized'});
    const subject=code.user==='U1'?'auth0|synthetic-u1':code.user==='U2'?'auth0|synthetic-u2':'auth0|unapproved-fixture';
    const sign=(payload,badSignature=false)=>new SignJWT(payload).setProtectedHeader({alg:'RS256',kid:publicJwk.kid,typ:'JWT'}).sign(badSignature?untrustedKey.privateKey:key.privateKey);
    const id_token=await sign({iss:ISSUER,sub:subject,aud:client.id,iat:now,exp:now+300,
      nonce:code.badNonce?'wrong-synthetic-nonce':code.nonce},code.badIdSignature);
    const access_token=await sign({iss:ISSUER,sub:subject,aud:AUDIENCE,iat:now,exp:now+300,
      azp:client.id,scope:'openid records:read records:write',...code.accessClaims},code.badAccessSignature);
    stats.acceptedExchanges++;
    return send(200,{id_token,access_token,token_type:'Bearer',expires_in:300});
  });
  await new Promise(resolve=>issuerServer.listen(0,'127.0.0.1',resolve));
  const issuerPort=issuerServer.address().port;
  const fixtureFetch=(url,options)=>{
    const target=new URL(url);
    if(target.origin!==new URL(ISSUER).origin)throw new Error('fixture_external_request_forbidden');
    return fetch(`http://127.0.0.1:${issuerPort}`+target.pathname+target.search,options);
  };
  const providers={},backends={},backendOptions={};
  try {
    for(const product of ['A','B']) {
      const actual=await createProvider(configs[product],{fetchForTest:fixtureFetch});
      providers[product]={...actual,async complete(...args){
        try{return await actual.complete(...args);}catch(error){
          stats.lastError={name:error.name,code:error.code,causeName:error.cause?.name,causeCode:error.cause?.code};
          throw error;
        }
      }};
      backendOptions[product]={...(recordStoreForTest?{recordStore:recordStoreForTest(configs[product])}:{}),...(sessionLedgerForTest?{sessionLedger:sessionLedgerForTest(product)}:{}),fetchProofForTest:async(url,options)=>{
        const target=new URL(url);
        const destination=Object.keys(PROOF_ORIGINS).find(p=>PROOF_ORIGINS[p]===target.origin);
        if(!destination||target.search||target.hash)throw new Error('fixture_proof_destination');
        const r=await request(destination,{path:target.pathname,method:options.method,headers:options.headers,body:options.body});
        return new Response(r.text,{status:r.status,headers:{'Content-Type':'application/json'}});
      }};
      backends[product]=await startBackend(configs[product],providers[product],backendOptions[product]);
    }
  }catch(error){issuerServer.closeAllConnections();issuerServer.close();throw error;}
  const request=async(product,{path='/',method='GET',jar=new Map(),body='',headers={}}={})=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port:backends[product].port,path,method,
      headers:{Host:new URL(clients[product].origin).host,
        ...(jar.size?{Cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')}:{}),...headers},
      signal:AbortSignal.timeout(5000)},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>{
        const setCookies=res.headers['set-cookie']??[];
        for(const c of setCookies){const [pair]=c.split(';');const [name,...value]=pair.split('=');if(c.includes('Max-Age=0'))jar.delete(name);else jar.set(name,value.join('='));}
        const text=Buffer.concat(chunks).toString('utf8');
        let json;try{json=JSON.parse(text);}catch{}
        resolve({status:res.statusCode,headers:res.headers,setCookies,json,text});
      });
    });req.on('error',reject);req.end(body);
  });
  async function begin(product,jar=new Map(),{user='U1',badNonce=false,badIdSignature=false,badAccessSignature=false,badChallenge=false,tokenEndpointDenial=false,reauthenticate=false,accessClaims={}}={}) {
    const response=await request(product,{path:reauthenticate?'/auth/login/choose':'/auth/login',jar});
    const url=new URL(response.headers.location);
    const code=randomBytes(24).toString('base64url');
    codes.set(code,{clientId:url.searchParams.get('client_id'),challenge:badChallenge?'wrong-challenge':url.searchParams.get('code_challenge'),
      nonce:url.searchParams.get('nonce'),user,badNonce,badIdSignature,badAccessSignature,tokenEndpointDenial,accessClaims});
    return {response,url,code,jar,form:new URLSearchParams({code,state:url.searchParams.get('state')})};
  }
  async function finish(product,transaction,{jar=transaction.jar,form=transaction.form}={}) {
    return request(product,{method:'POST',path:'/auth/callback',jar,body:form.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  }
  async function login(product,user='U1',options={}){
    const transaction=await begin(product,new Map(),{user,...options});
    const response=await finish(product,transaction);
    return {jar:transaction.jar,response};
  }
  return {request,begin,finish,login,providers,configs,stats,
    async restartBackends(){
      for(const b of Object.values(backends))await b.close();
      for(const product of ['A','B'])backends[product]=await startBackend(configs[product],providers[product],{...backendOptions[product],...(recordStoreForTest?{recordStore:recordStoreForTest(configs[product])}:{})});
    },
    async close(){for(const b of Object.values(backends))await b.close();await new Promise(resolve=>{issuerServer.close(resolve);issuerServer.closeAllConnections();});}
  };
}

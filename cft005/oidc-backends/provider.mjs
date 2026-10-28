import * as oidc from 'openid-client';
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';

function loginFailure(stage,cause){
  const error=new Error('E_LOGIN');error.loginStage=stage;
  if(stage==='provider_denied'){
    const phase=cause instanceof oidc.ResponseBodyError?'token_endpoint':cause instanceof oidc.AuthorizationResponseError?'authorization_response':'unknown';
    const description=typeof cause?.error_description==='string'?cause.error_description.toLowerCase().slice(0,2048):'';
    let reason='unspecified';
    if(description.trim()==='unauthorized')reason='unauthorized';
    else if(/client.grant|not authorized to access.*resource server/.test(description))reason='api_client_grant';
    else if(description.includes('service not found'))reason='api_identifier';
    else if(/connection.*(disabled|not enabled)|no connections enabled/.test(description))reason='client_connection';
    else if(/user.*blocked/.test(description))reason='account_blocked';
    else if(description.includes('consent'))reason='consent';
    else if(/email.*verif/.test(description))reason='email_policy';
    error.loginDetail={phase,reason};
  }
  return error;
}
function exchangeFailure(error){
  // Only fixed categories. Never retain/return provider messages, descriptions, claims or responses.
  if(error?.error==='invalid_client')return 'client_authentication';
  if(error?.error==='invalid_grant')return 'code_exchange';
  if(error?.error==='access_denied')return 'provider_denied';
  if(error?.code==='OAUTH_TIMEOUT'||error?.code==='OAUTH_ABORT')return 'provider_connection';
  return 'oidc_response_validation';
}

// The optional fetch injection is only for the local protocol test. start.mjs never
// provides it and no environment variable can disable TLS or override verification.
export async function createProvider(cfg,{fetchForTest}={}) {
  const options={timeout:10,...(fetchForTest?{[oidc.customFetch]:fetchForTest}:{})};
  const client=await oidc.discovery(new URL(cfg.issuer),cfg.clientId,
    {client_secret:cfg.clientSecret,token_endpoint_auth_method:'client_secret_basic',id_token_signed_response_alg:'RS256'},
    oidc.ClientSecretBasic(cfg.clientSecret),options);
  const metadata=client.serverMetadata();
  if (metadata.issuer!==cfg.issuer || !metadata.code_challenge_methods_supported?.includes('S256') ||
      !metadata.response_modes_supported?.includes('form_post')) throw new Error('E_DISCOVERY');
  for (const name of ['authorization_endpoint','token_endpoint','jwks_uri']) {
    const url=new URL(metadata[name]);
    if(url.protocol!=='https:'||url.origin!==new URL(cfg.issuer).origin||url.username||url.password||url.hash||url.search) throw new Error('E_DISCOVERY');
  }
  const jwks=createRemoteJWKSet(new URL(metadata.jwks_uri),{
    timeoutDuration:10000,...(fetchForTest?{[customFetch]:fetchForTest}:{})
  });
  const subjects=new Map(Object.entries(cfg.subjects));

  async function authorize(accessToken,permission) {
    const {payload,protectedHeader}=await jwtVerify(accessToken,jwks,{
      algorithms:['RS256'],issuer:cfg.issuer,audience:cfg.audience,
      requiredClaims:['sub','azp','scope','iat','exp'],clockTolerance:0
    });
    // Explicit Auth0 default profile. The RFC 9068 profile requires a separate policy.
    if(protectedHeader.typ!=='JWT'||'client_id' in payload)throw new Error('E_PROFILE');
    if(typeof payload.sub!=='string'||!subjects.has(payload.sub))throw new Error('E_SUBJECT');
    if(typeof payload.scope!=='string'||!payload.scope.split(' ').includes(permission))throw new Error('E_SCOPE');
    if(!Number.isInteger(payload.iat)||payload.iat>Math.floor(Date.now()/1000))throw new Error('E_AUTH');
    // This reason is used only by the data-free test probe, after cryptographic verification.
    if(payload.azp!==cfg.clientId)throw new Error(payload.azp===cfg.otherClientId?'E_PRODUCT':'E_AUTH');
    return {subject:payload.sub,label:subjects.get(payload.sub),expiresAt:payload.exp};
  }
  return Object.freeze({
    async begin({reauthenticate=false}={}) {
      const verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
      const url=oidc.buildAuthorizationUrl(client,{response_type:'code',response_mode:'form_post',
        redirect_uri:cfg.origin+'/auth/callback',scope:'openid records:read records:write',audience:cfg.audience,
        code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',state,nonce,
        ...(reauthenticate?{prompt:'login'}:{})});
      return {url:url.href,verifier,state,nonce};
    },
    async complete(transaction,request) {
      let tokens;
      try{tokens=await oidc.authorizationCodeGrant(client,request,{
        pkceCodeVerifier:transaction.verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true
      });}catch(error){throw loginFailure(exchangeFailure(error),error);}
      // Independently verify both JWT signatures, including the ID Token.
      let id;
      try{({payload:id}=await jwtVerify(tokens.id_token,jwks,{algorithms:['RS256'],issuer:cfg.issuer,
        audience:cfg.clientId,requiredClaims:['sub','iat','exp','nonce'],clockTolerance:0}));
        if(id.nonce!==transaction.nonce || (id.azp!==undefined&&id.azp!==cfg.clientId))throw new Error('E_AUTH');
      }catch{throw loginFailure('id_token_validation');}
      let principal;
      try{principal=await authorize(tokens.access_token,'records:read');}
      catch(error){throw loginFailure(({E_SUBJECT:'subject_allowlist',E_PROFILE:'access_token_profile',E_SCOPE:'access_token_scope',E_PRODUCT:'access_token_client'})[error.message]??'access_token_validation');}
      if(principal.subject!==id.sub)throw loginFailure('subject_binding');
      return {...principal,accessToken:tokens.access_token};
    },
    authorize
  });
}

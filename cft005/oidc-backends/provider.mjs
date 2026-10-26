import * as oidc from 'openid-client';
import {createRemoteJWKSet,jwtVerify,customFetch} from 'jose';

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
    if(protectedHeader.typ!=='JWT'||'client_id' in payload||payload.azp!==cfg.clientId||
      payload.azp===cfg.otherClientId||typeof payload.sub!=='string'||!subjects.has(payload.sub)||
      typeof payload.scope!=='string'||!payload.scope.split(' ').includes(permission)||
      !Number.isInteger(payload.iat)||payload.iat>Math.floor(Date.now()/1000)) throw new Error('E_AUTH');
    return {subject:payload.sub,label:subjects.get(payload.sub),expiresAt:payload.exp};
  }
  return Object.freeze({
    async begin() {
      const verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
      const url=oidc.buildAuthorizationUrl(client,{response_type:'code',response_mode:'form_post',
        redirect_uri:cfg.origin+'/auth/callback',scope:'openid records:read records:write',audience:cfg.audience,
        code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',state,nonce});
      return {url:url.href,verifier,state,nonce};
    },
    async complete(transaction,request) {
      const tokens=await oidc.authorizationCodeGrant(client,request,{
        pkceCodeVerifier:transaction.verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true
      });
      // Independently verify both JWT signatures, including the ID Token.
      const {payload:id}=await jwtVerify(tokens.id_token,jwks,{algorithms:['RS256'],issuer:cfg.issuer,
        audience:cfg.clientId,requiredClaims:['sub','iat','exp','nonce'],clockTolerance:0});
      if(id.nonce!==transaction.nonce || (id.azp!==undefined&&id.azp!==cfg.clientId)) throw new Error('E_AUTH');
      const principal=await authorize(tokens.access_token,'records:read');
      if(principal.subject!==id.sub) throw new Error('E_AUTH');
      return {...principal,accessToken:tokens.access_token};
    },
    authorize
  });
}

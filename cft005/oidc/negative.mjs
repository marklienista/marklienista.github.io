import {assertConfig} from './identity.mjs';
export const NEGATIVE_MODE_KEY='cft005.oidc.negative-mode';
function client(sdk,config){
  assertConfig(config);
  const url=new URL(config.supabaseUrl);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||!config.publishableKey?.startsWith('sb_publishable_'))throw Error('config_missing');
  // Deliberately discard the generated verifier. The callback receives only a
  // fixed synthetic mismatch, via the documented SDK storage adapter interface.
  const storage={getItem:key=>key.endsWith('-code-verifier')?'CFT005_SYNTHETIC_WRONG_VERIFIER_012345678901234567890123456789':null,setItem:()=>{},removeItem:()=>{}};
  return sdk.createClient(url.origin,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'cft005.oidc.negative',storage}});
}
export async function beginNegativeLogin(sdk,config){
  const probe=client(sdk,config);
  const {error}=await probe.auth.signInWithOAuth({provider:config.provider,options:{redirectTo:config.callbackUrl,scopes:'openid email profile'}});
  if(error)throw Error('negative_begin_failed');
}
export async function completeNegativeLogin(sdk,config,href){
  const url=new URL(href);
  if(url.origin+url.pathname!==config.callbackUrl||url.hash||url.searchParams.getAll('code').length!==1||url.searchParams.has('access_token')||url.searchParams.has('refresh_token'))throw Error('callback_invalid');
  const probe=client(sdk,config);
  const {data,error}=await probe.auth.exchangeCodeForSession(url.searchParams.get('code'));
  const expected=error?.status===400&&error?.code==='bad_code_verifier';
  return {case:'REAL_PKCE_MISMATCH',result:expected?'PASS':!error?'FAIL':'BLOCKED',at:new Date().toISOString(),requestRejected:Boolean(error),expectedPkceMismatch:expected,httpStatus:Number.isInteger(error?.status)?error.status:null,unexpectedSession:Boolean(data?.session),mainSessionStorageUntouched:true,callbackQueryCleared:!location.search};
}

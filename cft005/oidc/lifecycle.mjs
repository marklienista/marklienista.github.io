import {assertConfig} from './identity.mjs';

// Test-only controller. Issued credentials stay inside this closure and are
// never included in a receipt, URL, DOM, callback, exception or persistent file.
export function makeLifecycleProbe(sdk,config,{now=()=>Date.now()}={}){
  assertConfig(config);
  const api=new URL(config.supabaseUrl);
  if(api.protocol!=='https:'||api.pathname!=='/'||api.username||api.password||api.search||api.hash||!config.publishableKey?.startsWith('sb_publishable_')) throw Error('config_missing');
  const options={flowType:'pkce',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'cft005.oidc.demo'};
  const client=sdk.createClient(api.origin,config.publishableKey,{auth:options});
  let held=null, expectedId=null, recovered=null, receipt=null, revoked=false;
  const publish=()=>structuredClone(receipt);
  const userOf=async token=>client.auth.getUser(token);
  async function capture(){
    if(held) throw Error('probe_already_captured');
    await client.auth.stopAutoRefresh();
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session?.access_token||!data.session.refresh_token) throw Error('refresh_probe_no_primary');
    const s=data.session;
    if(!Number.isInteger(s.expires_at)||s.expires_at*1000<=now()) throw Error('probe_expiry_missing');
    const checked=await userOf(s.access_token);
    if(checked.error||!checked.data?.user?.id) throw Error('probe_identity_unverified');
    expectedId=checked.data.user.id;
    held={access:s.access_token,refresh:s.refresh_token,expires:s.expires_at};
    receipt={phase:'WAITING_FOR_NATURAL_EXPIRY',capturedAt:new Date(now()).toISOString(),expiresAt:new Date(s.expires_at*1000).toISOString(),checkAfter:new Date((s.expires_at+75)*1000).toISOString(),verifiedBeforeExpiry:true,autoRefreshDisabledForThisTestClient:true,expiry:null,revocation:null};
    return publish();
  }
  async function checkExpiry(){
    if(!held||revoked) throw Error('probe_not_ready');
    if(receipt.expiry) return publish();
    if(now()<(held.expires+75)*1000) return publish();
    const old=await userOf(held.access);
    const expired=old.error?.status===401 && (/expir/i.test(old.error?.message||'')||['jwt_expired','token_expired'].includes(old.error?.code));
    const invalid=Boolean(old.error);
    const next=await client.auth.refreshSession({refresh_token:held.refresh});
    const s=next.data?.session;
    let same=false;
    if(!next.error&&s?.access_token&&s.refresh_token){
      const checked=await userOf(s.access_token);
      same=!checked.error&&checked.data?.user?.id===expectedId;
      if(same) recovered={access:s.access_token,refresh:s.refresh_token};
    }
    receipt.phase='EXPIRY_CHECKED';
    receipt.expiry={result:expired&&same?'PASS':(!invalid||(!next.error&&!same)?'FAIL':'BLOCKED'),checkedAt:new Date(now()).toISOString(),oldAccessRejected:invalid,oldAccessExpired:expired,httpStatus:Number.isInteger(old.error?.status)?old.error.status:null,refreshSucceeded:!next.error&&Boolean(s?.access_token),identityPreserved:same,accessCredentialChanged:Boolean(s?.access_token&&s.access_token!==held.access),refreshCredentialChanged:Boolean(s?.refresh_token&&s.refresh_token!==held.refresh)};
    // Drop the expired access token and its consumed refresh value.
    held={expires:held.expires};
    return publish();
  }
  async function revokeLocal(){
    if(receipt?.expiry?.result!=='PASS'||!recovered||revoked) throw Error('probe_not_ready');
    const {error}=await client.auth.signOut({scope:'local'});
    if(error) throw Error('probe_local_logout_failed');
    revoked=true;
    const probe=sdk.createClient(api.origin,config.publishableKey,{auth:{...options,persistSession:false,storageKey:'cft005.oidc.revoked-probe'}});
    const answer=await probe.auth.refreshSession({refresh_token:recovered.refresh});
    const denied=answer.error?.status===400&&['refresh_token_not_found','refresh_token_already_used','session_not_found'].includes(answer.error?.code);
    const local=await client.auth.getSession();
    receipt.phase='LOCAL_REVOCATION_CHECKED';
    receipt.revocation={result:denied&&!local.error&&!local.data?.session?'PASS':!answer.error?'FAIL':'BLOCKED',checkedAt:new Date(now()).toISOString(),scope:'local',issuedRefreshRejected:Boolean(answer.error),expectedRevocationError:denied,httpStatus:Number.isInteger(answer.error?.status)?answer.error.status:null,localSessionAbsent:!local.error&&!local.data?.session};
    recovered=null; expectedId=null; held=null;
    return publish();
  }
  return {capture,checkExpiry,revokeLocal};
}

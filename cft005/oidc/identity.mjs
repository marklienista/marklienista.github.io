// CFT-005: Supabase Auth as OAuth/OIDC CLIENT of a central identity provider.
// NOT Supabase OAuth Server beta. No passwords or provider tokens are shared between apps.
export const DEFAULT_PROVIDER = 'custom:conta-central';

export function callbackIsAllowed(value, allowlist) {
  if (!Array.isArray(allowlist) || !allowlist.length) return false;
  try {
    const u = new URL(value);
    if (u.username || u.password || u.hash || u.search) return false;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '127.0.0.2', '[::1]'].includes(u.hostname))) return false;
    return allowlist.includes(u.href);
  } catch { return false; }
}

export function assertConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config_missing');
  if (!/^custom:[a-z0-9-]{2,43}$/.test(config.provider || '')) throw new Error('provider_invalid');
  if (!callbackIsAllowed(config.callbackUrl, config.allowedCallbacks)) throw new Error('callback_not_allowed');
  return config;
}

export function makeClient(supabaseSdk, config) {
  assertConfig(config);
  if (typeof supabaseSdk?.createClient !== 'function') throw new Error('supabase_sdk_missing');
  const api = new URL(config.supabaseUrl);
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || api.pathname !== '/') throw new Error('supabase_url_invalid');
  if (typeof config.publishableKey !== 'string' || !config.publishableKey.startsWith('sb_publishable_')) throw new Error('publishable_key_missing');
  return supabaseSdk.createClient(api.origin, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'cft005.oidc.demo'
    }
  });
}

export async function beginLogin(client, config) {
  assertConfig(config);
  if (typeof client?.auth?.signInWithOAuth !== 'function') throw new Error('oauth_client_missing');
  const {data, error} = await client.auth.signInWithOAuth({
    provider: config.provider,
    options: {redirectTo: config.callbackUrl}
  });
  if (error) throw error;
  return data;
}

export async function completeLogin(client, config, href) {
  assertConfig(config);
  const url = new URL(href);
  if ((url.origin + url.pathname) !== config.callbackUrl || url.hash) throw new Error('callback_mismatch');
  if (url.searchParams.has('error')) throw new Error('login_denied');
  if (url.searchParams.getAll('code').length !== 1) throw new Error('code_missing_or_repeated');
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.has('access_token') || url.searchParams.has('refresh_token')) throw new Error('callback_invalid');
  // supabase-js verifies the PKCE transaction against its local code verifier.
  const {error} = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return currentUser(client);
}

export async function currentUser(client) {
  if (typeof client?.auth?.getSession !== 'function' || typeof client?.auth?.getUser !== 'function') throw new Error('auth_client_missing');
  const session = await client.auth.getSession();
  if (session.error) throw session.error;
  if (!session.data?.session) return null;
  const {data, error} = await client.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) return null;
  return {id: data.user.id}; // avoid leaking full session or tokens
}

export async function signOutHere(client) {
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) throw error;
  // Local sign-out does not terminate the central IdP's SSO session.
  return true;
}

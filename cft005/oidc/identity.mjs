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
    options: {redirectTo: config.callbackUrl, scopes: 'openid email profile'}
  });
  if (error) throw error;
  return data;
}

export async function completeLogin(client, config, href) {
  assertConfig(config);
  const url = new URL(href);
  if ((url.origin + url.pathname) !== config.callbackUrl) throw new Error('callback_mismatch');
  if (url.searchParams.has('error')) {
    const description = url.searchParams.get('error_description') || '';
    if (/Error getting user email from external provider|email_address_not_provided/i.test(description)) {
      throw new Error('provider_email_missing');
    }
    if (url.searchParams.get('error') === 'access_denied') throw new Error('login_denied');
    throw new Error('provider_login_failed');
  }
  if (url.hash) throw new Error('callback_mismatch');
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

/**
 * Explicitly refreshes a test-only Supabase session without leaking credentials.
 * This does not terminate or refresh the Auth0 central SSO cookie.
 */
export async function refreshCurrentSession(client) {
  if (typeof client?.auth?.refreshSession !== 'function') throw new Error('refresh_not_supported');
  const {data, error} = await client.auth.refreshSession();
  if (error) throw error;
  if (!data?.session?.access_token) throw new Error('refresh_no_session');
  return currentUser(client);
}

export async function signOutHere(client) {
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) throw error;
  // Local sign-out does not terminate the central IdP's SSO session.
  return true;
}

/**
 * Maps known callback failures to safe, actionable messages.
 * Never reflect untrusted error_description or authentication codes into the UI.
 */
export function authFailureMessage(error) {
  const code = error?.message || error?.name || error?.code || '';
  if (code === 'provider_email_missing') return 'O Auth0 não informou o e-mail necessário ao Supabase (E_EMAIL). Verifique os escopos openid, email e profile.';
  if (code === 'login_denied') return 'Entrada cancelada ou recusada (E_DENIED).';
  if (code === 'provider_login_failed') return 'A autorização retornou uma falha (E_PROVIDER). Confira os registros do Supabase.';
  if (code === 'callback_mismatch' || code === 'callback_not_allowed') return 'Endereço de retorno não autorizado (E_CALLBACK).';
  if (code === 'code_missing_or_repeated' || code === 'callback_invalid') return 'Retorno inválido ou incompleto (E_CODE). Inicie a entrada novamente.';
  if (code === 'AuthPKCECodeVerifierMissingError' || code === 'invalid_flow_state' || code === 'bad_code_verifier') return 'O navegador perdeu a confirmação da entrada (E_PKCE). Recomece no mesmo navegador e aba.';
  if (code === 'supabase_sdk_missing' || code === 'sdk_unavailable') return 'A biblioteca de autenticação não carregou (E_SDK). Atualize a página.';
  if (code === 'publishable_key_missing' || code === 'config_missing' || code === 'provider_invalid') return 'Configuração pública do aplicativo incompleta (E_CONFIG).';
  return 'Não foi possível concluir a entrada (E_AUTH). Consulte o código de erro e os registros do servidor.';
}

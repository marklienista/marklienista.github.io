// CFT-005: utilities for public OAuth clients. No secrets or persistent credentials.
export function safeReturn(value, allowedOrigins) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || !allowedOrigins.includes(u.origin)) throw new Error('return_not_allowed');
  if (u.username || u.password || u.hash) throw new Error('invalid_return');
  return u.href;
}
// Compare only claims already verified by the caller (signature, issuer, audience,
// expiry and, for ID tokens, nonce). Decoding a JWT does not verify it.
export function assertClientClaim(claims, expectedClientId, expectedUserId) {
  if (typeof expectedClientId !== 'string' || !expectedClientId.trim()) throw new Error('missing_expected_client');
  if (typeof expectedUserId !== 'string' || !expectedUserId.trim()) throw new Error('missing_expected_user');
  if (!claims || typeof claims !== 'object') throw new Error('missing_claims');
  if (claims.client_id !== expectedClientId) throw new Error('wrong_client');
  if (claims.sub !== expectedUserId) throw new Error('wrong_user');
  return true;
}
export function base64url(bytes) {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {verifier, challenge:base64url(new Uint8Array(digest)), method:'S256'};
}
export function authorizeUrl({issuer, clientId, redirectUri, state, challenge, nonce}) {
  const origin = new URL(issuer);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('invalid_issuer');
  if (typeof clientId !== 'string' || !clientId.trim()) throw new Error('missing_client');
  const callback = new URL(redirectUri);
  if (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['127.0.0.1', '127.0.0.2', 'localhost', '[::1]'].includes(callback.hostname))) throw new Error('invalid_callback');
  if (callback.username || callback.password || callback.hash) throw new Error('invalid_callback');
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(state)) throw new Error('invalid_state');
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error('invalid_challenge');
  if (nonce !== undefined && (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(nonce))) throw new Error('invalid_nonce');
  const url = new URL('/auth/v1/oauth/authorize', issuer);
  for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid email',state,code_challenge:challenge,code_challenge_method:'S256'})) url.searchParams.set(k,v);
  if (nonce !== undefined) url.searchParams.set('nonce', nonce);
  return url.href;
}

/**
 * Validates an exact callback URL, not only its origin.
 * Use this for OAuth redirect_uri and post-authentication navigation.
 * State verification is a separate mandatory transaction check.
 */
export function safeCallback(value, allowedCallbacks) {
  if (!Array.isArray(allowedCallbacks) || !allowedCallbacks.length) throw new Error('missing_callback_allowlist');
  let u;
  try { u = new URL(value); } catch { throw new Error('invalid_callback'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash) throw new Error('invalid_callback');
  if (u.protocol === 'http:' && !['localhost','127.0.0.1','127.0.0.2','[::1]'].includes(u.hostname)) throw new Error('invalid_callback');
  if (!allowedCallbacks.includes(u.href)) throw new Error('callback_not_allowed');
  return u.href;
}

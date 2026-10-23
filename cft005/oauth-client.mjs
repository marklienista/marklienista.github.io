// CFT-005: utilities for public OAuth clients. No secrets or persistent credentials.
export function safeReturn(value, allowedOrigins) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || !allowedOrigins.includes(u.origin)) throw new Error('return_not_allowed');
  if (u.username || u.password || u.hash) throw new Error('invalid_return');
  return u.href;
}
export function assertClientClaim(claims, expectedClientId, expectedUserId) {
  if (!claims || typeof claims !== 'object') throw new Error('missing_claims');
  if (claims.client_id !== expectedClientId) throw new Error('wrong_client');
  if (claims.sub !== expectedUserId) throw new Error('wrong_user');
  return true;
}
export function base64url(bytes) {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
}
export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {verifier, challenge:base64url(new Uint8Array(digest)), method:'S256'};
}
export function authorizeUrl({issuer, clientId, redirectUri, state, challenge}) {
  const url = new URL('/auth/v1/oauth/authorize', issuer);
  for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid email',state,code_challenge:challenge,code_challenge_method:'S256'})) url.searchParams.set(k,v);
  return url.href;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {safeReturn, assertClientClaim, base64url, pkce, authorizeUrl} from './oauth-client.mjs';

globalThis.crypto ??= webcrypto;

test('retorno exige origem prevista, sem credenciais ou fragmento', () => {
  assert.equal(safeReturn('https://a.example/callback', ['https://a.example']), 'https://a.example/callback');
  for (const value of ['https://evil.example/callback', 'https://a.example@evil.example/callback', 'https://a.example/callback#token', 'javascript:alert(1)', 'https://user:pass@a.example/callback']) {
    assert.throws(() => safeReturn(value, ['https://a.example']));
  }
});

test('identidade exige cliente e usuario explicitos', () => {
  assert.equal(assertClientClaim({client_id:'A', sub:'user-1'}, 'A', 'user-1'), true);
  assert.throws(() => assertClientClaim({client_id:'B', sub:'user-1'}, 'A', 'user-1'), /wrong_client/);
  assert.throws(() => assertClientClaim({client_id:'A', sub:'user-2'}, 'A', 'user-1'), /wrong_user/);
  for (const id of [undefined, null, '', ' ']) {
    assert.throws(() => assertClientClaim({}, id, 'user-1'), /missing_expected_client/);
    assert.throws(() => assertClientClaim({client_id:'A'}, 'A', id), /missing_expected_user/);
  }
  assert.throws(() => assertClientClaim(null, 'A', 'user-1'), /missing_claims/);
});

test('PKCE usa entropia nova e SHA-256 do verifier exato', async () => {
  const p = await pkce();
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.method, 'S256');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.verifier));
  assert.equal(p.challenge, base64url(new Uint8Array(digest)));
  assert.notEqual((await pkce()).verifier, p.verifier);
});

const config = {
  issuer:'https://example.supabase.co', clientId:'A',
  redirectUri:'http://127.0.0.1:4311/callback',
  state:'s'.repeat(43), challenge:'c'.repeat(43), nonce:'n'.repeat(43)
};

test('autorizacao conserva callback, state, nonce e S256 sem enviar verifier', () => {
  const url = new URL(authorizeUrl(config));
  assert.equal(url.pathname, '/auth/v1/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  for (const [key, value] of Object.entries({client_id:config.clientId, redirect_uri:config.redirectUri, state:config.state, nonce:config.nonce, code_challenge:config.challenge})) assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.equal(new URL(authorizeUrl({...config, nonce:undefined})).searchParams.has('nonce'), false);
});

test('autorizacao rejeita configuracao incompleta e destinos inseguros', () => {
  for (const key of ['issuer', 'clientId', 'redirectUri', 'state', 'challenge']) {
    assert.throws(() => authorizeUrl({...config, [key]:undefined}));
  }
  for (const issuer of ['http://example.supabase.co', 'https://user:pass@example.supabase.co', 'https://example.supabase.co/other', 'https://example.supabase.co/?x=y']) {
    assert.throws(() => authorizeUrl({...config, issuer}), /invalid_issuer/);
  }
  for (const redirectUri of ['http://public.example/callback', 'https://user:pass@a.example/callback', 'https://a.example/callback#token']) {
    assert.throws(() => authorizeUrl({...config, redirectUri}), /invalid_callback/);
  }
  for (const key of ['state', 'challenge', 'nonce']) assert.throws(() => authorizeUrl({...config, [key]:'short'}));
  for (const redirectUri of ['http://127.0.0.2:4312/callback', 'https://b.example/callback']) assert.doesNotThrow(() => authorizeUrl({...config, redirectUri}));
});

// Contratos locais. Nao verificam assinatura JWT, callback completo, RLS ou SSO real.

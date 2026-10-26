import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROVIDER, callbackIsAllowed,assertConfig,makeClient,beginLogin,completeLogin,currentUser,signOutHere,authFailureMessage} from './identity.mjs';

const uriA='http://127.0.0.1:4311/auth/callback';
const uriB='http://127.0.0.2:4312/auth/callback';
const base={provider:DEFAULT_PROVIDER,callbackUrl:uriA,allowedCallbacks:[uriA,uriB],supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_TEST'};
function mockAuth(user='00000000-0000-0000-0000-000000000042'){
 const calls=[];
 return {calls,auth:{
   signInWithOAuth:async o=>{calls.push(['start',o]);return {data:{url:'https://login.example/authorize'},error:null}},
   exchangeCodeForSession:async code=>{calls.push(['exchange',code]);return {data:{session:{}} ,error:null}},
   getSession:async()=>({data:{session:{access_token:'not-exposed'}},error:null}),
   getUser:async()=>({data:{user:{id:user,email:'hidden@example.com'}},error:null}),
   signOut:async o=>{calls.push(['out',o]);return {error:null}}
 }};
}
test('1. permite callbacks estritamente registrados',()=>{
 assert.equal(callbackIsAllowed(uriA,base.allowedCallbacks),true);
 assert.equal(callbackIsAllowed(uriB,base.allowedCallbacks),true);
 for(const u of ['https://evil.test/auth/callback',uriA+'?to=evil',uriA+'#token',uriA.replace('callback','other'),'http://public.example/callback','https://user@evil.test/auth/callback']) assert.equal(callbackIsAllowed(u,base.allowedCallbacks),false);
});
test('2. configuração recusa provedor inválido ou callback alterado',()=>{
 assert.equal(assertConfig(base),base);
 assert.throws(()=>assertConfig({...base,provider:'bad'}));
 assert.throws(()=>assertConfig({...base,callbackUrl:'https://evil.test/callback'}));
});
test('3. sdk usa PKCE e armazena sessão apenas na origem',()=>{
 let received;
 const sdk={createClient:(url,key,opt)=>{received={url,key,opt};return {ok:true}}};
 assert.deepEqual(makeClient(sdk,base),{ok:true});
 assert.equal(received.opt.auth.flowType,'pkce');
 assert.equal(received.opt.auth.detectSessionInUrl,false);
 assert.equal(received.opt.auth.persistSession,true);
 assert.throws(()=>makeClient(sdk,{...base,publishableKey:'secret'}));
});
test('4. A e B iniciam OIDC com redirects próprios',async()=>{
 const a=mockAuth(),b=mockAuth();
 await beginLogin(a,base);
 await beginLogin(b,{...base,callbackUrl:uriB});
 assert.equal(a.calls[0][1].options.redirectTo,uriA);
 assert.equal(b.calls[0][1].options.redirectTo,uriB);
 assert.equal(a.calls[0][1].provider,'custom:conta-central');
 assert.equal(a.calls[0][1].options.scopes,'openid email profile');
 assert.equal(b.calls[0][1].options.scopes,'openid email profile');
});
test('5. callback A e B aceitam o mesmo UUID simulado e não retornam tokens',async()=>{
 const a=mockAuth(),b=mockAuth();
 const one=await completeLogin(a,base,uriA+'?code=code-A');
 const two=await completeLogin(b,{...base,callbackUrl:uriB},uriB+'?code=code-B');
 assert.deepEqual(one,two);
 assert.deepEqual(Object.keys(one),['id']);
 assert.deepEqual(a.calls[0],['exchange','code-A']);
});
test('6. códigos malformados/retorno cruzado são rejeitados antes da troca',async()=>{
 const a=mockAuth();
 for(const url of [uriB+'?code=abc',uriA,uriA+'?code=x&code=y',uriA+'?error=access_denied',uriA+'?code=x#token',uriA+'?code=x&access_token=stolen']) await assert.rejects(()=>completeLogin(a,base,url));
 assert.equal(a.calls.length,0);
});
test('7. verifica usuário no servidor e logout apenas local',async()=>{
 const a=mockAuth();
 assert.equal((await currentUser(a)).id,'00000000-0000-0000-0000-000000000042');
 assert.equal(await signOutHere(a),true);
 assert.deepEqual(a.calls.at(-1),['out',{scope:'local'}]);
});
test('8. sem sessão não acessa usuário nem considera autenticado', async()=>{
 let touched=false;
 const client={auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>{touched=true;return {data:{user:{id:'spoof'}}}}}};
 assert.equal(await currentUser(client),null);
 assert.equal(touched,false);
});

test('9. retorno sem e-mail classifica erro de forma segura', async () => {
 const a=mockAuth();
 await assert.rejects(
   ()=>completeLogin(a,base,uriA+'?error=server_error&error_description=Error+getting+user+email+from+external+provider'),
   {message:'provider_email_missing'}
 );
 assert.equal(a.calls.length,0);
 assert.match(authFailureMessage(new Error('provider_email_missing')), /E_EMAIL/);
 assert.equal(authFailureMessage(new Error('internal-sensitive-detail')).includes('internal-sensitive-detail'),false);
});

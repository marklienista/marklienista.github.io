import assert from 'node:assert/strict';
import test from 'node:test';
import {currentUser, makeClient, signOutHere} from './identity.mjs';

// Simulated-only contract. No real Auth0 sessions, JWT or database writes.
const A = 'https://cft005-login-a-teste.onrender.com';
const B = 'https://cft005-login-b-teste.onrender.com';
const USER1 = '00000000-0000-0000-0000-000000000041';
const USER2 = '00000000-0000-0000-0000-000000000042';
let sequence=0;

function demoBrowser() {
  const origins = new Map([[A,new Map()],[B,new Map()]]);
  const audit=[];
  const idp={sessionOpen:true};
  const createClient=origin=>{
    const store=origins.get(origin);
    if(!store) throw new Error('origin-not-registered');
    return {origin,auth:{
      async getSession(){
        const session=store.get('session');
        if(!session) return {data:{session:null},error:null};
        if(session.expired){
          if(!session.refreshValid){
            store.delete('session');
            audit.push([origin,'refresh-denied']);
            return {data:{session:null},error:{name:'AuthApiError',message:'Invalid Refresh Token'}};
          }
          session.expired=false;
          session.refreshCycle++;
          session.access_token='fixture-'+(++sequence);
          audit.push([origin,'refreshed']);
        }
        return {data:{session},error:null};
      },
      async getUser(){
        const sess=store.get('session');
        if(!sess||sess.expired) return {data:{user:null},error:{name:'AuthApiError'}};
        return {data:{user:{id:sess.userId,email:'fixture@example.test'}},error:null};
      },
      async signOut({scope}){
        if(scope!=='local') return {error:new Error('test-only:no-global-logout')};
        store.delete('session');audit.push([origin,'local-signed-out']);return {error:null};
      }
    }};
  };
  function login(origin,userId=USER1){
    if(!idp.sessionOpen) throw new Error('test-only:central-session-absent');
    const session={userId,refreshCycle:0,refreshValid:true,expired:false,access_token:'fixture-'+(++sequence)};
    origins.get(origin).set('session',session);
    return session;
  }
  return {origins,createClient,login,audit,idp};
}

test('simulation: separate domains store independent sessions and return only UUID',async()=>{
  const x=demoBrowser();const a=x.login(A),b=x.login(B);
  assert.notStrictEqual(a,b);
  assert.notEqual(a.access_token,b.access_token);
  assert.deepEqual(await currentUser(x.createClient(A)),{id:USER1});
  assert.deepEqual(await currentUser(x.createClient(B)),{id:USER1});
  assert.equal(x.origins.get(A).has('session'),true);
  assert.equal(x.origins.get(B).has('session'),true);
});

test('simulation: session refresh for A does not rotate B',async()=>{
  const x=demoBrowser();x.login(A);x.login(B);
  const bToken=x.origins.get(B).get('session').access_token;
  const a=x.origins.get(A).get('session');
  const aToken=a.access_token;
  a.expired=true;
  assert.deepEqual(await currentUser(x.createClient(A)),{id:USER1});
  assert.notEqual(a.access_token,aToken);
  assert.equal(a.refreshCycle,1);
  assert.equal(x.origins.get(B).get('session').access_token,bToken);
});

test('simulation: revoked refresh denies expired local session',async()=>{
  const x=demoBrowser();const a=x.login(A);
  a.expired=true;a.refreshValid=false;
  await assert.rejects(()=>currentUser(x.createClient(A)),err=>err?.message==='Invalid Refresh Token');
  assert.equal(x.origins.get(A).has('session'),false);
  assert.equal(await currentUser(x.createClient(A)),null);
});

test('simulation: local logout of A retains B and central IdP',async()=>{
  const x=demoBrowser();x.login(A);x.login(B);
  assert.equal(await signOutHere(x.createClient(A)),true);
  assert.equal(await currentUser(x.createClient(A)),null);
  assert.deepEqual(await currentUser(x.createClient(B)),{id:USER1});
  assert.equal(x.idp.sessionOpen,true);
  assert.deepEqual(x.audit.slice(-1),[[A,'local-signed-out']]);
});

test('simulation: local logout of both apps does not close central IdP session',async()=>{
  const x=demoBrowser();x.login(A);x.login(B);
  await signOutHere(x.createClient(A));await signOutHere(x.createClient(B));
  assert.equal(await currentUser(x.createClient(A)),null);
  assert.equal(await currentUser(x.createClient(B)),null);
  assert.equal(x.idp.sessionOpen,true);
});

test('simulation: distinct people do not share a subject UUID',async()=>{
  const x=demoBrowser();x.login(A,USER1);x.login(B,USER2);
  assert.notDeepEqual(await currentUser(x.createClient(A)),await currentUser(x.createClient(B)));
});

test('SDK configuration: PKCE, persistence and auto-refresh, no automatic URL-token parsing',()=>{
  let options;
  const sdk={createClient:(_url,_key,opts)=>{options=opts;return {ok:true}}};
  const cfg={provider:'custom:conta-central',callbackUrl:A+'/callback.html',allowedCallbacks:[A+'/callback.html'],supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_FIXTURE'};
  makeClient(sdk,cfg);
  assert.equal(options.auth.flowType,'pkce');
  assert.equal(options.auth.autoRefreshToken,true);
  assert.equal(options.auth.persistSession,true);
  assert.equal(options.auth.detectSessionInUrl,false);
});

// This suite does NOT validate real browser/session state, server JWT signatures,
// global logout, Auth0 revocation, RLS product isolation or session timeouts.
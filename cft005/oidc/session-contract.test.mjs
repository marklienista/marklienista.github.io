import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as identity from './identity.mjs';
import {currentUser, makeClient, signOutHere, refreshCurrentSession, authFailureMessage} from './identity.mjs';

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

test('manual session refresh: returns verified ID only, not tokens', async()=>{
  let refreshCount=0;
  const auth={
    refreshSession:async()=>{refreshCount++;return {data:{session:{access_token:'fixture'}},error:null}},
    getSession:async()=>({data:{session:{access_token:'fixture'}},error:null}),
    getUser:async()=>({data:{user:{id:USER1,email:'fixture@example.test'}},error:null})
  };
  assert.deepEqual(await refreshCurrentSession({auth}),{id:USER1});
  assert.equal(refreshCount,1);
});

test('manual session refresh: revoked token fails and does not read identity', async()=>{
  let askedForUser=false;
  const auth={
    refreshSession:async()=>({data:{session:null},error:{name:'AuthApiError',message:'Invalid Refresh Token'}}),
    getSession:async()=>{askedForUser=true;return {data:{session:null},error:null}},
    getUser:async()=>{askedForUser=true;return {data:{user:{id:USER1}},error:null}}
  };
  await assert.rejects(()=>refreshCurrentSession({auth}), e=>e?.message==='Invalid Refresh Token');
  assert.equal(askedForUser,false);
});


test('revoked refresh is classified safely, without leaking the error details',()=>{
  const text=authFailureMessage(new Error('Invalid Refresh Token'));
  assert.match(text,/E_REFRESH/);
  assert.equal(text.includes('fixture-token'),false);
});

test('UI: a failed refresh or identity check still allows local logout and recovery', async()=>{
  const source=(await readFile(new URL('./app.mjs',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/, '');
  const elements=new Map(['status','enter','check','leave','refresh'].map(id=>[id,{
    disabled:true,textContent:'',listeners:{},addEventListener(event,handler){this.listeners[event]=handler;}
  }]));
  let failing=true, session=true, signouts=0;
  const auth={
    getSession:async()=>({data:{session:session?{access_token:'fixture'}:null},error:null}),
    getUser:async()=>({data:{user:{id:USER1}},error:failing?{code:'session_not_found',message:'private fixture'}:null}),
    refreshSession:async()=>({data:{session:null},error:{code:'refresh_token_not_found',message:'private fixture'}}),
    signOut:async({scope})=>{assert.equal(scope,'local');signouts++;session=false;return {error:null};}
  };
  const cfg={provider:'custom:conta-central',allowedCallbacks:[A+'/callback.html'],supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_FIXTURE'};
  const context=vm.createContext({...identity,URL,document:{getElementById:id=>elements.get(id)},
    location:{pathname:'/index.html',href:A+'/index.html'},
    fetch:async()=>({ok:true,json:async()=>cfg}),window:{supabase:{createClient:()=>({auth})}}
  });
  // Await startup without installing any real browser or SDK.
  await vm.runInContext(source.replace(/run\(\)\.catch\([\s\S]*$/, 'run()'),context);
  assert.equal(elements.get('leave').disabled,false);
  assert.match(elements.get('status').textContent,/E_REFRESH/);
  failing=false;
  await elements.get('check').listeners.click();
  await elements.get('refresh').listeners.click();
  assert.match(elements.get('status').textContent,/E_REFRESH/);
  assert.equal(elements.get('leave').disabled,false,'failed refresh must not trap local credentials');
  assert.equal(elements.get('refresh').disabled,true);
  failing=true;
  await elements.get('check').listeners.click();
  assert.match(elements.get('status').textContent,/E_REFRESH/);
  assert.equal(elements.get('leave').disabled,false);
  failing=false;
  await elements.get('check').listeners.click();
  assert.equal(elements.get('refresh').disabled,false);
  await elements.get('leave').listeners.click();
  assert.equal(signouts,1);
  assert.equal(elements.get('leave').disabled,true);
  assert.equal(elements.get('refresh').disabled,true);
  assert.equal(elements.get('status').textContent.includes('private fixture'),false);
});

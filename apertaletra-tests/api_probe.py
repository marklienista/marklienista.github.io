"""AL009 live API verification. No browser, email delivery, or school-use claims.
Credentials exist only in the runner temp directory; enrollment fixture is RSA encrypted.
Use two explicitly disposable test identities, seeded by the project operator.
"""
import json,os,sys,secrets,uuid,time,subprocess,pathlib,urllib.request,urllib.error,copy
ROOT='https://eyfmhnlzduoobdmwexmc.supabase.co'
KEY='sb_publishable_as-eMTlem4cWd29PVNFAhg_uVLIqZKu'
ORIGIN='https://apertaletra-al008-teste.onrender.com'
TMP=pathlib.Path(os.environ.get('RUNNER_TEMP','/tmp'))/'al009-api-probe'
OUT=pathlib.Path('al009-api-results'); OUT.mkdir(exist_ok=True)
TMP.mkdir(exist_ok=True,mode=0o700)
def call(path,body=None,token=None,student=None):
    h={'apikey':KEY,'Content-Type':'application/json','Origin':ORIGIN}
    if token:h['Authorization']='Bearer '+token
    if student:h['x-al-session']=student
    req=urllib.request.Request(ROOT+path,data=None if body is None else json.dumps(body).encode(),headers=h,method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(req,timeout=30) as r:status=r.status; raw=r.read()
    except urllib.error.HTTPError as e:status=e.code;raw=e.read()
    try:data=json.loads(raw) if raw else None
    except ValueError:data={'unparsed':True}
    return status,data

def prepare():
    import crypt
    accounts=[]
    pub=pathlib.Path('apertaletra-tests/probe-public.pem')
    for label in ['a','b']:
        ident=str(uuid.uuid4());email=f'al009-ci-{os.environ["GITHUB_RUN_ID"]}-{label}@example.invalid';password=secrets.token_urlsafe(48)
        account={'id':ident,'email':email,'password':password};accounts.append(account)
        public={'id':ident,'email':email,'hash':crypt.crypt(password,crypt.mksalt(crypt.METHOD_BLOWFISH)),'run':os.environ['GITHUB_RUN_ID']}
        plain=TMP/f'{label}.json';plain.write_text(json.dumps(public));os.chmod(plain,0o600)
        subprocess.run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(pub),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256','-in',str(plain),'-out',str(OUT/f'fixture-{label}.enc')],check=True)
        plain.unlink()
    f=TMP/'credentials.json';f.write_text(json.dumps(accounts));os.chmod(f,0o600)
    print('Two encrypted enrollment fixtures prepared; no credentials logged.')

def test():
    result={'scope':'LIVE Auth password grants + Edge + PostgreSQL/REST. Not browser UI or email confirmation. Test identities administratively seeded.','started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tests':[],'resource_ids':{}}
    accounts=json.loads((TMP/'credentials.json').read_text());tokens=[];students=[]
    def check(name,condition):
        result['tests'].append({'name':name,'pass':bool(condition)})
        print(('PASS ' if condition else 'FAIL ')+name,flush=True)
        if not condition:raise AssertionError(name)
    def edge(action,data=None,adult=None,child=None,expected=200):
        status,r=call('/functions/v1/apertaletra-classroom',{'action':action,**(data or {})},adult,child)
        if status!=expected:raise AssertionError(f'Edge {action}: HTTP {status}; code={r.get("code") if isinstance(r,dict) else None}; message={r.get("message") if isinstance(r,dict) else None}; expected {expected}')
        return r
    def login(a):
        return call('/auth/v1/token?grant_type=password',{'email':a['email'],'password':a['password']})
    try:
        print('Waiting for operator to seed the two disposable identities.',flush=True)
        deadline=time.time()+480
        while True:
            status,session=login(accounts[0])
            if status==200:break
            if time.time()>deadline:raise AssertionError('Fixture enrollment timed out')
            time.sleep(20)
        tokens.append(session['access_token']);a=tokens[0]
        status,session=login(accounts[1]);check('two real password grants',status==200);tokens.append(session['access_token']);b=tokens[1]
        status,u=call('/auth/v1/user',token=a);check('Auth validates actual teacher A token',status==200 and u['id']==accounts[0]['id'])
        status,u=call('/auth/v1/user',token=b);check('Auth validates actual teacher B token',status==200 and u['id']==accounts[1]['id'])
        edge('list',expected=401);check('anonymous teacher operations denied',True)
        r=edge('list',adult=a);check('A dashboard initially empty',r['activities']==[])
        payload={'app':'apertaletra','version':2,'document':{'kind':'recipe','layoutVersion':1,'title':'Salada fictícia AL009','html':'','settings':{'font':'Arial','size':24},'blocks':[{'id':'ingredients','html':'<ul><li>1 banana</li><li>1 <b>maçã</b></li></ul>'},{'id':'preparation','html':''}]}}
        activity=edge('create',{'title':'AL009 integração fictícia','payload':payload},adult=a);aid=activity['id'];result['resource_ids']['activity']=aid
        activity=edge('activity_save',{'activity_id':aid,'expected_revision':activity['revision'],'payload':payload,'locked_fields':['ingredients'],'interface_mode':'both'},adult=a)
        edge('roster',{'activity_id':aid,'names':['Juliana teste','Ravi teste']},adult=a)
        detail=edge('detail',{'activity_id':aid},adult=a);parts=detail['participants'];check('roster creates independent incomplete productions',len(parts)==2)
        activity=edge('state',{'activity_id':aid,'state':'open'},adult=a);code=activity['join_code'];check('activity code has six digits',len(code)==6 and code.isdigit())
        check('B dashboard excludes A activity',edge('list',adult=b)['activities']==[])
        edge('detail',{'activity_id':aid},adult=b,expected=403);check('B direct activity access denied',True)
        status,r=call('/rest/v1/apertaletra_activities?select=id',token=b);check('REST RLS also hides A from B',status==200 and r==[])
        status,r=call('/rest/v1/rpc/apertaletra_classroom_call',{'p_actor':accounts[0]['id'],'p_session_hash':None,'p_bucket':None,'p_request':{'action':'list'}},token=b);check('client cannot invoke server-only gateway with forged actor',status in (401,403))
        for p in parts:
            s=secrets.token_hex(32);students.append(s)
            joined=edge('join',{'code':code,'name':p['display_name']},child=s)
            pending=edge('read',child=s);check('pending request exposes no production '+str(len(students)),pending.get('pending') is True and 'production' not in pending)
            edge('approve',{'activity_id':aid,'request_id':joined['request_id'],'participant_id':p['id']},adult=a)
        s1,s2=students
        first=edge('read',child=s1);second=edge('read',child=s2);prod=first['production'];pid=prod['id'];p2id=second['production']['id']
        check('approved participants have distinct production IDs',pid!=p2id)
        check('incomplete recipe preserved',prod['payload']==payload)
        scoped=edge('read',{'production_id':p2id,'activity_id':aid},child=s1);check('participant cannot select another production',scoped['production']['id']==pid)
        bad=copy.deepcopy(payload);bad['document']['blocks'][0]['html']='alteração indevida'
        edge('save',{'payload':bad,'expected_revision':prod['revision'],'mutation_id':str(uuid.uuid4())},child=s1,expected=403);check('protected ingredient block enforced by server',True)
        edited=copy.deepcopy(payload);edited['document']['blocks'][1]['html']='<ol><li>Misturar devagar.</li></ol>';m=str(uuid.uuid4());req={'payload':edited,'expected_revision':prod['revision'],'mutation_id':m}
        prod=edge('save',req,child=s1)['production'];check('student save acknowledged with new revision',prod['revision']==2)
        replay=edge('save',req,child=s1)['production'];check('lost acknowledgement replay idempotent',replay['revision']==2)
        check('other participant text unchanged',edge('read',child=s2)['production']['payload']==payload)
        older=copy.deepcopy(edited);older['document']['blocks'][1]['html']='versão antiga'
        edge('save',{'payload':older,'expected_revision':1,'mutation_id':str(uuid.uuid4())},child=s1,expected=409);check('stale revision rejected',True)
        prod=edge('finish',{'expected_revision':prod['revision']},child=s1)['production'];check('Terminei records delivered state',prod['state']=='delivered')
        params={'activity_id':aid,'production_id':pid}
        edge('review_open',params,adult=a)
        revised=copy.deepcopy(edited);revised['document']['blocks'][1]['html']='<ol><li>Misturar devagar.</li><li>Revisão fictícia do professor.</li></ol>'
        prod=edge('review_save',{**params,'payload':revised,'expected_revision':prod['revision'],'mutation_id':str(uuid.uuid4())},adult=a)
        edge('return',{**params,'expected_revision':prod['revision']},adult=a)
        returned=edge('read',child=s1);check('student sees teacher return',returned['production']['state']=='returned' and returned['production']['payload']==revised)
        hist=edge('history',params,adult=a);authors={r['author'] for r in hist};check('history keeps template, student and teacher authors',authors=={'template','student','teacher'})
        edge('state',{'activity_id':aid,'state':'paused'},adult=a)
        edge('save',{'payload':edited,'expected_revision':prod['revision'],'mutation_id':str(uuid.uuid4())},child=s1,expected=423);check('paused activity blocks writes but retains text',edge('read',child=s1)['production']['payload']==revised)
        edge('state',{'activity_id':aid,'state':'open'},adult=a)
        s3=secrets.token_hex(32);students.append(s3)
        joined=edge('join',{'code':code,'name':'Julana teste'},child=s3);edge('approve',{'activity_id':aid,'request_id':joined['request_id'],'participant_id':first['participant']['id']},adult=a)
        resumed=edge('read',child=s3);check('new device and spelling variation resume same production',resumed['production']['id']==pid and resumed['production']['payload']==revised)
        edge('read',child=s1,expected=403);check('previous participant session revoked',True)
        resumed_payload=copy.deepcopy(revised);resumed_payload['document']['blocks'][1]['html']+='<p>Continuei em outro dia.</p>'
        prod=edge('save',{'payload':resumed_payload,'expected_revision':prod['revision'],'mutation_id':str(uuid.uuid4())},child=s3)['production'];check('resumed student continues teacher revision',prod['revision']==4)
        status,_=call('/auth/v1/logout?scope=local',{},token=a);check('actual teacher logout acknowledged',status in (200,204))
        status,session=login(accounts[0]);check('actual teacher re-login succeeds',status==200);a=session['access_token'];tokens.append(a)
        reopened=edge('production',params,adult=a);check('teacher reopens final saved production',reopened['production']['payload']==resumed_payload)
        free={'app':'apertaletra','version':1,'document':{'title':'Livre fictício','html':'','settings':{'font':'Arial','size':24}}}
        fa=edge('create',{'title':'Escrita livre fictícia','payload':free},adult=a);check('free writing activity accepts empty draft',fa['model']==free)
        result['status']='PASS'
    except Exception as e:
        result['status']='FAIL';result['failure']=str(e)[:700];print('FAIL '+result['failure'],flush=True)
    finally:
        for student in students:
            try:call('/functions/v1/apertaletra-classroom',{'action':'leave'},student=student)
            except Exception:pass
        for token in tokens:
            try:call('/auth/v1/logout?scope=local',{},token=token)
            except Exception:pass
        result['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        (OUT/'api-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        (TMP/'credentials.json').unlink(missing_ok=True)
    return result['status']=='PASS'
if sys.argv[1]=='prepare':prepare()
else:sys.exit(0 if test() else 1)

import {randomBytes,pbkdf2Sync,createHmac,createHash} from 'node:crypto';
import pg from 'pg';

export const target={host:'dpg-dbh8tghsrm7s73f4tc9g-a.virginia-postgres.render.com',database:'cft005_hml_db_teste',admin:'cft005_hml_db_teste_user'};
const ownerRole='cft005_hml_owner';
const products=['A','B'];
const role=p=>'cft005_hml_'+p.toLowerCase();
const table=p=>role(p)+'.records';
const fixture=(p,u)=>[`HML-${p}-${u}`,u,p,`synthetic-${p}-${u}-v1`,1];
const options=(url,user,password)=>({host:url.hostname,port:5432,database:target.database,user,password,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,statement_timeout:10000,application_name:'cft005-hml-validation'});

function scram(password){
  const salt=randomBytes(16),iterations=4096;
  const salted=pbkdf2Sync(password,salt,iterations,32,'sha256');
  const client=createHmac('sha256',salted).update('Client Key').digest();
  const stored=createHash('sha256').update(client).digest('base64');
  const server=createHmac('sha256',salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${stored}:${server}`;
}

// Secrets are supplied in memory. No environment, URL, SQL error or credential is logged.
export async function validateDatabase(connectionString){
  const url=new URL(connectionString);
  if(url.protocol!=='postgresql:'&&url.protocol!=='postgres:')throw Error('E_DB_TARGET');
  if(url.hostname!==target.host||url.pathname!=='/'+target.database||decodeURIComponent(url.username)!==target.admin||url.search||url.port&&url.port!=='5432')throw Error('E_DB_TARGET');
  const report={schemaVersion:1,kind:'REAL_DATABASE_LOGINS_AND_RLS',startedAt:new Date().toISOString(),databaseId:'dpg-dbh8tghsrm7s73f4tc9g-a',cases:[],limitations:[
    'Direct PostgreSQL test; no BFF adapter, HTTP identity integration or central logout attested',
    'Owner context is asserted by the trusted backend; one product login can select U1 or U2 context within its own product',
    'Runtime passwords were generated only in memory and discarded after validation; no BFF environment was configured',
    'No restart, backup, provider log retention or browser profile proof in this run'
  ]};
  const clients=[];
  const admin=new pg.Client(options(url,target.admin,decodeURIComponent(url.password)));clients.push(admin);
  const record=(id,ok,extra={})=>report.cases.push({id,result:ok?'PASS':'FAIL',...extra});
  const q=async(c,s,p=[])=>c.query(s,p);
  const transaction=async(c,u,fn)=>{
    await q(c,'BEGIN');try{if(u)await q(c,"SELECT set_config('cft005.owner',$1,true)",[u]);await fn();await q(c,'COMMIT');}
    catch(e){await q(c,'ROLLBACK');throw e;}
  };
  const denied=async(c,id,sql,args=[],expected='42501')=>{
    await q(c,'SAVEPOINT negative_probe');let code=null;
    try{await q(c,sql,args);}catch(e){code=e.code??'E_SQL';}
    await q(c,'ROLLBACK TO SAVEPOINT negative_probe');await q(c,'RELEASE SAVEPOINT negative_probe');
    record(id,code===expected,{expectedSqlState:expected,actualSqlState:code});
  };
  let stage='CONNECT';
  try{
    await admin.connect();
    const check=(await q(admin,"SELECT current_database()=$1 AS db,current_user=$2 AS admin,rolcreaterole,NOT rolsuper AS not_super FROM pg_roles WHERE rolname=current_user",[target.database,target.admin])).rows[0];
    record('TARGET_AND_ADMIN',check.db&&check.admin&&check.rolcreaterole&&check.not_super);
    if(!check.db||!check.admin||!check.rolcreaterole)throw Error('E_ADMIN_REQUIRED');
    const logging=(await q(admin,"SELECT current_setting('log_statement') AS statement,current_setting('log_parameter_max_length_on_error') AS error_parameters")).rows[0];
    record('PASSWORD_PARAMETER_LOGGING_GUARD',logging.statement==='none'&&logging.error_parameters==='0');
    if(logging.statement!=='none'||logging.error_parameters!=='0')throw Error('E_LOGGING_GUARD');
    const existing=(await q(admin,"SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%'")).rows[0].n;
    const tables=(await q(admin,"SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')")).rows[0].n;
    const roles=(await q(admin,"SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('cft005_hml_owner','cft005_hml_a','cft005_hml_b')")).rows[0].n;
    record('NEW_EMPTY_TARGET',existing===0&&tables===0&&roles===0);
    if(existing||tables||roles)throw Error('E_TARGET_NOT_EMPTY');
    stage='INSTALL';
    await q(admin,'BEGIN');
    try{
      await q(admin,`CREATE ROLE ${ownerRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await q(admin,`GRANT ${ownerRole} TO ${target.admin} WITH SET TRUE`);
      for(const p of products)await q(admin,`CREATE ROLE ${role(p)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2`);
      await q(admin,`REVOKE ALL ON DATABASE ${target.database} FROM PUBLIC`);
      await q(admin,`GRANT CONNECT ON DATABASE ${target.database} TO ${role('A')},${role('B')}`);
      await q(admin,'REVOKE ALL ON SCHEMA public FROM PUBLIC');
      for(const p of products)await q(admin,`CREATE SCHEMA ${role(p)} AUTHORIZATION ${ownerRole}`);
      await q(admin,`SET ROLE ${ownerRole}`);
      for(const p of products){
        await q(admin,`CREATE TABLE ${table(p)} (record_id text PRIMARY KEY,owner_label text NOT NULL CHECK(owner_label IN ('U1','U2')),product text NOT NULL CHECK(product='${p}'),value text NOT NULL CHECK(length(value)<=128),revision integer NOT NULL CHECK(revision>0),CHECK(record_id='HML-${p}-'||owner_label))`);
        await q(admin,`ALTER TABLE ${table(p)} ENABLE ROW LEVEL SECURITY`);
        await q(admin,`ALTER TABLE ${table(p)} FORCE ROW LEVEL SECURITY`);
        const predicate=`product='${p}' AND owner_label=current_setting('cft005.owner',true) AND current_setting('cft005.owner',true) IN ('U1','U2')`;
        await q(admin,`CREATE POLICY own_select ON ${table(p)} FOR SELECT TO ${role(p)} USING (${predicate})`);
        await q(admin,`CREATE POLICY own_insert ON ${table(p)} FOR INSERT TO ${role(p)} WITH CHECK (${predicate})`);
        await q(admin,`CREATE POLICY own_update ON ${table(p)} FOR UPDATE TO ${role(p)} USING (${predicate}) WITH CHECK (${predicate})`);
        await q(admin,`REVOKE ALL ON SCHEMA ${role(p)} FROM PUBLIC`);
        await q(admin,`GRANT USAGE ON SCHEMA ${role(p)} TO ${role(p)}`);
        await q(admin,`GRANT SELECT,INSERT,UPDATE ON ${table(p)} TO ${role(p)}`);
        await q(admin,'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
      }
      await q(admin,'RESET ROLE');await q(admin,'COMMIT');
    }catch(e){await q(admin,'ROLLBACK');throw e;}
    // Bound verifier parameter, generic exception, no cleartext password in SQL.
    await q(admin,`CREATE FUNCTION pg_temp.install_hml_password(r text,v text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF r NOT IN ('cft005_hml_a','cft005_hml_b') OR v NOT LIKE 'SCRAM-SHA-256$%' THEN RAISE EXCEPTION 'E_PASSWORD_INPUT'; END IF; EXECUTE format('ALTER ROLE %I PASSWORD %L',r,v); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'E_PASSWORD_INSTALL'; END $$`);
    await q(admin,'REVOKE ALL ON FUNCTION pg_temp.install_hml_password(text,text) FROM PUBLIC');
    stage='LOGINS';
    const runtime=new Map();
    for(const p of products){
      let password=randomBytes(32).toString('base64url');
      await q(admin,'SELECT pg_temp.install_hml_password($1,$2)',[role(p),scram(password)]);
      const c=new pg.Client(options(url,role(p),password));password=null;clients.push(c);await c.connect();runtime.set(p,c);
      const who=(await q(c,"SELECT session_user=$1 AND current_user=$1 AS exact_login,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl",[role(p)])).rows[0];
      record(`${p}_ACTUAL_LOGIN_TLS`,who.exact_login&&who.ssl);
    }
    await q(admin,'DROP FUNCTION pg_temp.install_hml_password(text,text)');
    stage='SEED';
    for(const p of products)for(const u of ['U1','U2']){
      await transaction(runtime.get(p),u,async()=>{
        const inserted=await q(runtime.get(p),`INSERT INTO ${table(p)}(record_id,owner_label,product,value,revision) VALUES($1,$2,$3,$4,$5) RETURNING record_id`,fixture(p,u));
        record(`${p}_${u}_OWN_INSERT`,inserted.rowCount===1);
      });
    }
    stage='POLICIES';
    for(const p of products){
      const c=runtime.get(p),other=p==='A'?'B':'A';
      const attrs=(await q(c,"SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AS minimal FROM pg_roles WHERE rolname=current_user")).rows[0];
      record(`${p}_MINIMAL_ATTRIBUTES`,attrs.minimal);
      const memberships=(await q(c,"SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)")).rows[0].n;
      record(`${p}_NO_ROLE_MEMBERSHIP`,memberships===0);
      const unset=(await q(c,`SELECT count(*)::int AS n FROM ${table(p)}`)).rows[0].n;
      record(`${p}_NO_CONTEXT_DENIES_READ`,unset===0);
      await transaction(c,null,async()=>{
        await denied(c,`${p}_NO_CONTEXT_DENIES_INSERT`,`INSERT INTO ${table(p)} VALUES($1,$2,$3,$4,$5)`,fixture(p,'U1'));
        await denied(c,`${p}_CROSS_SCHEMA_READ`,`SELECT * FROM ${table(other)}`);
        await denied(c,`${p}_CROSS_SCHEMA_WRITE`,`UPDATE ${table(other)} SET revision=revision+1`);
        for(const r of [ownerRole,role(other),target.admin])await denied(c,`${p}_CANNOT_ASSUME_${r===ownerRole?'OWNER':r===target.admin?'ADMIN':'OTHER_PRODUCT'}`,`SET ROLE ${r}`);
        await denied(c,`${p}_NO_SCHEMA_CREATE`,`CREATE TABLE ${role(p)}.unexpected(id integer)`);
        await denied(c,`${p}_NO_TEMP_CREATE`,'CREATE TEMP TABLE unexpected(id integer)');
        await denied(c,`${p}_NO_DELETE`,`DELETE FROM ${table(p)}`);
        await denied(c,`${p}_NO_TRUNCATE`,`TRUNCATE ${table(p)}`);
        await denied(c,`${p}_CANNOT_DISABLE_RLS`,`ALTER TABLE ${table(p)} DISABLE ROW LEVEL SECURITY`);
      });
      for(const u of ['U1','U2']){
        const foreign=u==='U1'?'U2':'U1';
        await transaction(c,u,async()=>{
          const own=await q(c,`SELECT record_id,value,revision FROM ${table(p)} WHERE record_id=$1`,[`HML-${p}-${u}`]);
          record(`${p}_${u}_OWN_READ`,own.rowCount===1&&own.rows[0].value===`synthetic-${p}-${u}-v1`);
          const foreignRead=await q(c,`SELECT record_id FROM ${table(p)} WHERE owner_label=$1`,[foreign]);
          record(`${p}_${u}_OTHER_USER_READ_EMPTY`,foreignRead.rowCount===0);
          const foreignWrite=await q(c,`UPDATE ${table(p)} SET value='unexpected' WHERE owner_label=$1 RETURNING record_id`,[foreign]);
          record(`${p}_${u}_OTHER_USER_UPDATE_ZERO`,foreignWrite.rowCount===0);
          await denied(c,`${p}_${u}_WITH_CHECK_OWNER`,`UPDATE ${table(p)} SET owner_label=$1 WHERE owner_label=$2`,[foreign,u]);
          await denied(c,`${p}_${u}_WITH_CHECK_PRODUCT`,`UPDATE ${table(p)} SET product=$1 WHERE owner_label=$2`,[other,u]);
          await denied(c,`${p}_${u}_OTHER_USER_INSERT_DENIED`,`INSERT INTO ${table(p)} VALUES($1,$2,$3,$4,$5)`,fixture(p,foreign));
          const wrote=await q(c,`UPDATE ${table(p)} SET value=$1,revision=revision+1 WHERE owner_label=$2 RETURNING value,revision`,[`synthetic-${p}-${u}-v2`,u]);
          record(`${p}_${u}_OWN_UPDATE`,wrote.rowCount===1&&wrote.rows[0].revision===2&&wrote.rows[0].value===`synthetic-${p}-${u}-v2`);
        });
        record(`${p}_${u}_CONTEXT_RESET_AFTER_COMMIT`,(await q(c,`SELECT count(*)::int AS n FROM ${table(p)}`)).rows[0].n===0);
      }
      await transaction(c,'INVALID',async()=>record(`${p}_INVALID_CONTEXT_DENIES`,(await q(c,`SELECT count(*)::int AS n FROM ${table(p)}`)).rows[0].n===0));
      const toggled=await q(admin,"SELECT relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(c.relowner)=$2 AS protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND relname='records'",[role(p),ownerRole]);
      record(`${p}_RLS_ENABLED_FORCED_SEPARATE_OWNER`,toggled.rows[0]?.protected===true);
      await q(admin,'BEGIN');await q(admin,`SET LOCAL ROLE ${ownerRole}`);
      record(`${p}_FORCED_OWNER_WITHOUT_POLICY_DENIED`,(await q(admin,`SELECT count(*)::int AS n FROM ${table(p)}`)).rows[0].n===0);await q(admin,'ROLLBACK');
    }
    stage='FINAL';
    // Four owner-authorized rereads prove all records survived negative probes intact.
    for(const p of products)for(const u of ['U1','U2'])await transaction(runtime.get(p),u,async()=>{
      const rows=(await q(runtime.get(p),`SELECT record_id,owner_label,product,value,revision FROM ${table(p)}`)).rows;
      record(`${p}_${u}_FINAL_OWN_RECORD_INTACT`,rows.length===1&&rows[0].record_id===`HML-${p}-${u}`&&rows[0].product===p&&rows[0].owner_label===u&&rows[0].value===`synthetic-${p}-${u}-v2`&&rows[0].revision===2);
    });
    const surfaces=(await q(admin,"SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b') AND c.relkind IN ('v','m'))::int AS views,(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b'))::int AS functions")).rows[0];
    record('NO_HML_VIEW_OR_RPC_BYPASS',surfaces.views===0&&surfaces.functions===0);
    report.syntheticRecords=4;report.fixtureRevision=2;report.stage='COMPLETED';
  }catch(e){report.stage=stage;report.executionError=e.code&&/^[A-Z0-9_]{3,50}$/.test(e.code)?e.code:e.message&&/^E_[A-Z_]+$/.test(e.message)?e.message:'E_DB_VALIDATION';}
  finally{for(const c of clients)try{await c.end();}catch{};report.finishedAt=new Date().toISOString();}
  report.counts={PASS:report.cases.filter(c=>c.result==='PASS').length,FAIL:report.cases.filter(c=>c.result==='FAIL').length};
  report.result=report.executionError?'BLOCKED':report.counts.FAIL?'FAIL':'PASS';
  return report;
}

export async function finalizeDatabase(connectionString,report){
  const url=new URL(connectionString);
  if(url.hostname!==target.host||url.pathname!=='/'+target.database||decodeURIComponent(url.username)!==target.admin||url.search)throw Error('E_DB_TARGET');
  const c=new pg.Client(options(url,target.admin,decodeURIComponent(url.password)));
  try{
    await c.connect();await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${ownerRole}`);
    // A schema-scoped revoke cannot remove PostgreSQL's global default PUBLIC EXECUTE.
    await c.query('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');await c.query('COMMIT');
    const checks=(await c.query(`SELECT
      EXISTS(SELECT 1 FROM pg_default_acl d WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='cft005_hml_owner') AND d.defaclnamespace=0 AND d.defaclobjtype='f') AND NOT EXISTS(SELECT 1 FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='cft005_hml_owner') AND d.defaclnamespace=0 AND d.defaclobjtype='f' AND a.grantee=0 AND a.privilege_type='EXECUTE') AS global_function_default,
      NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(d.datacl) a WHERE datname=current_database() AND a.grantee=0 AND a.privilege_type IN ('CONNECT','CREATE','TEMPORARY')) AS database_public_denied,
      NOT EXISTS(SELECT 1 FROM pg_namespace n,LATERAL aclexplode(n.nspacl) a WHERE nspname IN ('cft005_hml_a','cft005_hml_b','public') AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')) AS schema_public_denied,
      (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b') AND c.relkind='r') AS exact_private_tables`)).rows[0];
    for(const [key,id]of Object.entries({global_function_default:'OWNER_GLOBAL_DEFAULT_FUNCTION_EXECUTE_REVOKED',database_public_denied:'DATABASE_PUBLIC_PRIVILEGES_DENIED',schema_public_denied:'SCHEMA_PUBLIC_PRIVILEGES_DENIED',exact_private_tables:'EXACT_TWO_PRIVATE_TABLES'}))report.cases.push({id,result:checks[key]?'PASS':'FAIL'});
    report.defaultPrivilegeSupplementAt=new Date().toISOString();
    report.counts={PASS:report.cases.filter(x=>x.result==='PASS').length,FAIL:report.cases.filter(x=>x.result==='FAIL').length};report.result=report.counts.FAIL?'FAIL':'PASS';
    return report;
  }finally{await c.end();}
}

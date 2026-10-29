import pg from 'pg';
import {auditDatabase} from './technical-audit.mjs';

const HOST='dpg-dbh8tghsrm7s73f4tc9g-a';
const DATABASE='cft005_hml_db_teste';
const TLS_NAME=HOST+'.virginia-postgres.render.com';
const unavailable=(storeCategory='unknown')=>Object.assign(new Error('E_DATABASE_UNAVAILABLE'),{storeFailure:true,storeCategory});
export function databaseFailureCategory(error){
  if(['ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED'].includes(error?.code))return 'tls_validation';
  if(['28000','28P01'].includes(error?.code))return 'authentication';
  if(error?.code==='42501')return 'privilege';
  if(['ENOTFOUND','EAI_AGAIN'].includes(error?.code))return 'network_dns';
  if(['ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(error?.code))return 'network_connection';
  return 'unknown';
}

export function databaseOptions(product,connectionString){
  let url;try{url=new URL(connectionString);}catch{throw unavailable('configuration');}
  const user='cft005_hml_'+product?.toLowerCase();
  if(!['A','B'].includes(product)||!['postgres:','postgresql:'].includes(url.protocol)||![HOST,TLS_NAME].includes(url.hostname)||
    url.pathname!=='/'+DATABASE||decodeURIComponent(url.username)!==user||!url.password||url.search||url.hash||url.port&&url.port!=='5432')throw unavailable('configuration');
  return {host:url.hostname,port:5432,database:DATABASE,user,password:decodeURIComponent(url.password),
    ssl:{rejectUnauthorized:true,servername:TLS_NAME},max:1,connectionTimeoutMillis:8000,
    statement_timeout:5000,idle_in_transaction_session_timeout:5000,idleTimeoutMillis:120000,application_name:'cft005-bff-'+product};
}

export function createPostgresStore(cfg,connectionString,{Pool=pg.Pool}={}){
  const pool=new Pool(databaseOptions(cfg.product,connectionString));
  pool.on('error',()=>{}); // No raw database errors or credentials in application logs.
  const schema='cft005_hml_'+cfg.product.toLowerCase(),table=schema+'.records';
  let previousAudit;
  function principalLabel(principal){
    if(!principal||!Object.hasOwn(cfg.subjects,principal.subject)||cfg.subjects[principal.subject]!==principal.label)throw unavailable();
    return principal.label;
  }
  async function execute(principal,sql,values){
    const label=principalLabel(principal);let client,destroy=false;
    try{
      client=await pool.connect();await client.query('BEGIN');
      await client.query("SELECT set_config('cft005.owner',$1,true)",[label]);
      const result=await client.query(sql,values);await client.query('COMMIT');return result;
    }catch{
      if(client)try{await client.query('ROLLBACK');}catch{destroy=true;}
      throw unavailable();
    }finally{client?.release(destroy);}
  }
  function view(row){return row?{id:row.record_id,value:row.value,revision:row.revision}:null;}
  return Object.freeze({kind:'postgres',
    async ready(){
      try{
        const r=await pool.query(`SELECT current_user=$1 AND session_user=$1 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AS login_ok,
          (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND relname='records' AND relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(c.relowner)='cft005_hml_owner') AS rls
          FROM pg_roles WHERE rolname=current_user`,[schema,schema]);
        if(!r.rows[0]?.login_ok)throw unavailable('role_policy');
        if(!r.rows[0].tls)throw unavailable('tls_required');
        if(!r.rows[0].rls)throw unavailable('rls_policy');
      }catch(error){throw error?.storeFailure?error:unavailable(databaseFailureCategory(error));}
    },
    async read(principal,requested){
      if(!['U1','U2'].includes(requested))return null;
      const r=await execute(principal,`SELECT record_id,value,revision FROM ${table} WHERE record_id=$1`,[`HML-${cfg.product}-${requested}`]);return view(r.rows[0]);
    },
    async write(principal,requested,value){
      if(!['U1','U2'].includes(requested)||typeof value!=='string'||value.length>128)throw unavailable();
      const r=await execute(principal,`UPDATE ${table} SET value=$1,revision=revision+1 WHERE record_id=$2 RETURNING record_id,value,revision`,[value,`HML-${cfg.product}-${requested}`]);return view(r.rows[0]);
    },
    async audit(principal){
      const label=principalLabel(principal);let client,reuse=false;
      try{
        client=await pool.connect();
        const {checks,next}=await auditDatabase(client,cfg.product,label,previousAudit);
        reuse=Boolean(next&&checks.afterRollbackContextEmpty&&checks.afterCommitContextEmpty);
        previousAudit=reuse?next:undefined;
        return checks;
      }catch{previousAudit=undefined;throw unavailable('unknown');}
      finally{client?.release(!reuse);}
    },
    async close(){await pool.end();}
  });
}

// Local protocol fixture only. Production startup always supplies PostgreSQL.
export function createMemoryFixtureStore(cfg){
  const records=new Map(Object.values(cfg.subjects).map(label=>[label,{id:label+'-'+cfg.product,value:`synthetic-${label}-${cfg.product}`} ]));
  return {kind:'memory-fixture',async ready(){},async read(p,label){return p.label===label?records.get(label):null;},
    async write(p,label,value){if(p.label!==label)return null;const row=records.get(label);if(!row)return null;row.value=value;return {...row};},async close(){}};
}

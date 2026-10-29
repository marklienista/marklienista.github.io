// HML transaction boundary, shared by coordinator and product data stores.
import {verifyCommand,validEpoch} from './protocol.mjs';
const DB='cft005_hml_db_teste',S='cft005_hml_auth';
const denial=()=>Object.assign(new Error('E_LEDGER_DENIED'),{ledgerDenied:true});
const unavailable=()=>new Error('E_LEDGER_UNAVAILABLE');
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validBinding=b=>b&&Object.keys(b).length===3&&['owner','sessionHash','epoch'].every(k=>Object.hasOwn(b,k))&&['U1','U2'].includes(b.owner)&&validHash(b.sessionHash)&&validEpoch(b.epoch);

const auditContext=async c=>(await c.query("/* CFT005_LEDGER_AUDIT_CONTEXT */ SELECT pg_backend_pid() AS pid,current_user AS role,session_user AS login,current_setting('cft005.owner',true) AS owner")).rows[0];
const cleanAuditContext=(row,role)=>Number.isSafeInteger(row?.pid)&&row.pid>0&&row.role===role&&row.login===role&&(row.owner===null||row.owner==='');
async function transaction(pool,role,fn,{audit=false,rollbackOnly=false}={}){
  let c,destroy=false,commitStarted=false;
  try{
    c=await pool.connect();
    const before=audit?await auditContext(c):undefined;
    if(audit&&!cleanAuditContext(before,role))throw unavailable();
    await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await c.query("SET LOCAL synchronous_commit = 'on'");
    await c.query("SET LOCAL lock_timeout = '1500ms'");
    await c.query("SET LOCAL statement_timeout = '5000ms'");
    await c.query("SET LOCAL idle_in_transaction_session_timeout = '5000ms'");
    const check=await c.query(`SELECT current_database()=$1 AND current_user=$2 AND session_user=$2 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AND (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ok FROM pg_roles r WHERE rolname=current_user`,[DB,role]);
    if(check.rows[0]?.ok!==true)throw unavailable();
    const result=await fn(c);
    commitStarted=true;await c.query(rollbackOnly?'ROLLBACK':'COMMIT'); // No success before completion.
    if(!audit)return result;
    const after=await auditContext(c);
    if(!cleanAuditContext(after,role)||after.pid!==before.pid)throw unavailable();
    return {result,before,after,completion:rollbackOnly?'ROLLBACK':'COMMIT'};
  }catch(e){
    if(commitStarted||audit)destroy=true; // Unknown outcome or audit context never returns to pool.
    if(c)try{await c.query('ROLLBACK');}catch{destroy=true;}
    throw e?.ledgerDenied?denial():unavailable();
  }finally{c?.release(destroy);}
}
async function clock(c){return Number((await c.query('SELECT floor(extract(epoch FROM clock_timestamp()))::bigint AS now')).rows[0]?.now);}
async function epochRow(c,owner,exclusive=false){
  const r=await c.query(`SELECT epoch FROM ${S}.epochs WHERE owner_label=$1 FOR ${exclusive?'UPDATE':'SHARE'}`,[owner]);
  const epoch=Number(r.rows[0]?.epoch);if(!validEpoch(epoch))throw denial();return epoch;
}
async function sessionRow(c,product,b,exclusive=false){
  const r=await c.query(`SELECT epoch,expires_at,revoked FROM ${S}.sessions WHERE session_hash=$1 AND product=$2 AND owner_label=$3 FOR ${exclusive?'UPDATE':'SHARE'}`,[b.sessionHash,product,b.owner]);
  const row=r.rows[0],now=await clock(c);
  if(!row||!Number.isSafeInteger(now)||row.revoked!==false||Number(row.epoch)!==b.epoch||Number(row.expires_at)<=now)throw denial();
}

export async function executeCommand(pool,command,verification){
  // Signature and exact transport binding checked before opening any connection.
  const e=verifyCommand(command,verification),b=e.body;
  return transaction(pool,'cft005_hml_coordinator',async c=>{
    // A duplicate nonce aborts the transaction, including any later mutation.
    await c.query(`INSERT INTO ${S}.nonces(issuer,nonce,expires_at) VALUES($1,$2,$3)`,[e.issuer,e.nonce,e.exp]);
    let result;
    if(b.action==='snapshot'){
      const r=await c.query(`SELECT owner_label,epoch FROM ${S}.epochs ORDER BY owner_label FOR SHARE`);
      const epochs=Object.fromEntries(r.rows.map(r=>[r.owner_label,Number(r.epoch)]));
      if(r.rows.length!==2||!validEpoch(epochs.U1)||!validEpoch(epochs.U2))throw denial();
      result={action:'snapshot',epochs};
    }else{
      const epoch=await epochRow(c,b.owner,b.action==='revoke');
      if(epoch!==b.epoch)throw denial();
      if(b.action==='register'){
        const now=await clock(c);
        if(!Number.isSafeInteger(now)||b.expiresAt<=now||b.expiresAt>now+900)throw denial();
        await c.query(`INSERT INTO ${S}.sessions(session_hash,product,owner_label,epoch,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,[b.sessionHash,e.issuer,b.owner,b.epoch,now,b.expiresAt]);
        result={action:b.action,epoch};
      }else{
        await sessionRow(c,e.issuer,b,b.action==='logout');
        if(b.action==='revoke'){
          if(!validEpoch(epoch+1))throw denial();
          const r=await c.query(`UPDATE ${S}.epochs SET epoch=epoch+1 WHERE owner_label=$1 AND epoch=$2 RETURNING epoch`,[b.owner,epoch]);
          if(Number(r.rows[0]?.epoch)!==epoch+1)throw denial();
          result={action:b.action,epoch:epoch+1};
        }else if(b.action==='logout'){
          const r=await c.query(`UPDATE ${S}.sessions SET revoked=true WHERE session_hash=$1 AND product=$2 AND owner_label=$3 AND revoked=false RETURNING session_hash`,[b.sessionHash,e.issuer,b.owner]);
          if(r.rows.length!==1)throw denial();
          result={action:b.action,epoch};
        }else result={action:b.action,epoch};
      }
    }
    // Recheck the database clock after lock waits, before committing effects.
    const now=await clock(c);if(!Number.isSafeInteger(now)||e.iat>now+5||e.exp<=now)throw denial();
    return result;
  });
}

async function protectedOperation({pool,coordinator,cfg,principal,binding,operation},options){
  // Caller is trusted server code. No browser-selected principal or callback.
  if(!['A','B'].includes(cfg?.product)||!principal||cfg.subjects?.[principal.subject]!==principal.label||
    !validBinding(binding)||principal.label!==binding.owner||typeof operation!=='function'||typeof coordinator?.authorize!=='function')throw denial();
  // Mandatory online authorization, never cached; SQL locks close the later race.
  let auth;try{auth=await coordinator.authorize({product:cfg.product,...binding});}catch(e){throw e?.ledgerDenied?denial():unavailable();}
  if(auth?.action!=='authorize'||auth.epoch!==binding.epoch)throw denial();
  return transaction(pool,'cft005_hml_'+cfg.product.toLowerCase(),async c=>{
    await c.query("SELECT set_config('cft005.owner',$1,true)",[principal.label]);
    const epoch=await epochRow(c,binding.owner);
    if(epoch!==binding.epoch)throw denial();
    await sessionRow(c,cfg.product,binding);
    // Locks stay held on THIS connection through the data operation and COMMIT.
    // The callback must use only this client and fixed parameterized data SQL.
    return operation(c);
  },options);
}

export const protectedTransaction=input=>protectedOperation(input);
// Two fixed server-only phases. Both obtain fresh online authorization and the
// epoch/session locks before invoking fixed SQL. Only data-free context is read
// after completion. No callback can run outside the protected transaction here.
export function protectedAuditTransaction(input,phase){
  if(!['probe','verify'].includes(phase))throw denial();
  return protectedOperation(input,{audit:true,rollbackOnly:phase==='probe'});
}

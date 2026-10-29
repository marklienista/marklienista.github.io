// Fixed synthetic database only. Every mutation probe is rolled back.
// Never return SQL errors, backend PIDs, credentials or raw catalog definitions.
const empty=value=>value===null||value==='';
const normalize=value=>value.replace(/::text|[\s()]/g,'');
export async function auditDatabase(client,product,label,previous){
  if(!['A','B'].includes(product)||!['U1','U2'].includes(label))throw Error('E_AUDIT_INPUT');
  const role='cft005_hml_'+product.toLowerCase(),otherRole='cft005_hml_'+(product==='A'?'b':'a');
  const table=role+'.records',otherTable=otherRole+'.records';
  const id=`HML-${product}-${label}`,otherLabel=label==='U1'?'U2':'U1',otherId=`HML-${product}-${otherLabel}`;
  const checks={};let pid,transaction=false,initial;
  const query=(tag,sql,args=[])=>client.query(`/* CFT005_AUDIT:${tag} */ ${sql}`,args);
  const context=async tag=>(await query(tag,"SELECT pg_backend_pid() AS pid,current_user AS role,current_setting('cft005.owner',true) AS owner")).rows[0];
  const denied=async(tag,sql,args=[])=>{
    await query('SAVEPOINT','SAVEPOINT cft005_audit_probe');let rejected=false;
    try{await query(tag,sql,args);}catch(error){rejected=error?.code==='42501';}
    finally{await query('ROLLBACK_PROBE','ROLLBACK TO SAVEPOINT cft005_audit_probe');await query('RELEASE_PROBE','RELEASE SAVEPOINT cft005_audit_probe');}
    const restored=await context('PROBE_CONTEXT');
    return rejected&&restored.role===role&&restored.owner===label;
  };
  const record=async tag=>(await query(tag,`SELECT record_id,owner_label,product,value,revision FROM ${table} WHERE record_id=$1`,[id])).rows;
  try{
    const before=await context('BEFORE');pid=before.pid;
    checks.initialContextEmpty=empty(before.owner);checks.exactRuntimeRole=before.role===role;
    if(!checks.initialContextEmpty||!checks.exactRuntimeRole)return {checks,next:null};
    await query('BEGIN','BEGIN');transaction=true;
    await query('LOCK_TIMEOUT',"SET LOCAL lock_timeout='2s'");
    await query('OWNER',"SELECT set_config('cft005.owner',$1,true)",[label]);
    const policy=(await query('POLICY',`SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND NOT r.rolinherit
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS restricted_role,
      c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='cft005_hml_owner' AS forced_rls,
      NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS no_custom_triggers,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls
      FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname=current_user AND c.oid=$1::regclass`,[table])).rows[0];
    checks.restrictedRole=policy?.restricted_role===true;checks.forcedRls=policy?.forced_rls===true;
    checks.noCustomTriggers=policy?.no_custom_triggers===true;checks.tls=policy?.tls===true;
    // Unknown triggers could have effects outside a rollback: do not run mutation probes.
    if(!checks.restrictedRole||!checks.forcedRls||!checks.noCustomTriggers||!checks.tls)return {checks,next:null};
    const constraints=(await query('CONSTRAINTS',`SELECT contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass`,[table])).rows;
    const has=definition=>constraints.some(c=>c.convalidated&&normalize(c.definition)===definition);
    checks.identityConstraint=has(`CHECKrecord_id='HML-${product}-'||owner_label`);
    checks.productConstraint=has(`CHECKproduct='${product}'`);
    checks.ownerDomainConstraint=has("CHECKowner_label=ANYARRAY['U1','U2']");
    checks.idPrimaryKey=constraints.some(c=>c.contype==='p'&&c.convalidated&&normalize(c.definition)==='PRIMARYKEYrecord_id');
    initial=await record('INITIAL_ROW');
    checks.exactOwnRow=initial.length===1&&initial[0].owner_label===label&&initial[0].product===product;
    const visible=(await query('VISIBLE_ROWS',`SELECT record_id FROM ${table}`)).rows;
    checks.noExtraVisibleRows=visible.length===1&&visible[0].record_id===id;
    checks.noExtraRowsProvenForContext=checks.identityConstraint&&checks.ownerDomainConstraint&&checks.productConstraint&&checks.idPrimaryKey&&checks.noExtraVisibleRows;
    checks.otherReadFiltered=(await query('OTHER_READ',`SELECT record_id FROM ${table} WHERE record_id=$1`,[otherId])).rows.length===0;
    checks.ownUpdateReached=(await query('OWN_NOOP',`UPDATE ${table} SET value=value WHERE record_id=$1 RETURNING record_id`,[id])).rows.length===1;
    checks.otherUpdateFiltered=(await query('OTHER_UPDATE',`UPDATE ${table} SET value='synthetic-audit-denied' WHERE record_id=$1 RETURNING record_id`,[otherId])).rows.length===0;
    checks.withCheckOwnerDenied=await denied('WITH_CHECK_OWNER',`UPDATE ${table} SET owner_label=$1,record_id=$2 WHERE record_id=$3`,[otherLabel,otherId,id]);
    checks.withCheckProductDenied=await denied('WITH_CHECK_PRODUCT',`UPDATE ${table} SET product=$1 WHERE record_id=$2`,[product==='A'?'B':'A',id]);
    checks.otherSchemaDenied=await denied('OTHER_SCHEMA',`SELECT record_id FROM ${otherTable} LIMIT 1`);
    checks.otherRoleDenied=await denied('OTHER_ROLE',`SET LOCAL ROLE ${otherRole}`);
    checks.ownerRoleDenied=await denied('OWNER_ROLE','SET LOCAL ROLE cft005_hml_owner');
    checks.bypassDenied=await denied('BYPASS',`SET LOCAL row_security=off; SELECT record_id FROM ${table} LIMIT 1`);
    const inventory=(await query('INVENTORY',`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b') AND c.relkind IN ('v','m','f')) AS extra_relations,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b','public') AND p.prosecdef) AS security_definers,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b','public') AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_functions,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) AS public_relations,
      (SELECT count(*)=2 AND bool_and(c.relname='records') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cft005_hml_a','cft005_hml_b') AND c.relkind IN ('r','p')) AS fixed_private_tables,
      EXISTS(SELECT 1 FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole WHERE r.rolname='cft005_hml_owner' AND d.defaclobjtype='f' AND d.defaclnamespace=0 AND NOT EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AS default_public_execute_revoked,
      NOT EXISTS(SELECT 1 FROM pg_publication) AS no_publications,
      NOT has_schema_privilege(current_user,'public','CREATE') AS public_create_denied,
      NOT has_schema_privilege(current_user,$1,'USAGE') AS peer_schema_usage_denied`,[otherRole])).rows[0];
    checks.noViewsOrForeignTables=inventory?.extra_relations===0;checks.noSecurityDefiner=inventory?.security_definers===0;
    checks.noPublicFunctionExecute=inventory?.public_functions===0;checks.publicCreateDenied=inventory?.public_create_denied===true;
    checks.peerSchemaUsageDenied=inventory?.peer_schema_usage_denied===true;
    checks.noPublicRelations=inventory?.public_relations===0;checks.fixedPrivateTables=inventory?.fixed_private_tables===true;
    checks.ownerDefaultExecuteRevoked=inventory?.default_public_execute_revoked===true;checks.noPublications=inventory?.no_publications===true;
    checks.ownRowPreservedInsideTransaction=JSON.stringify(await record('FINAL_ROW'))===JSON.stringify(initial);
    await query('ROLLBACK','ROLLBACK');transaction=false;
    const rolledBack=await context('AFTER_ROLLBACK');checks.afterRollbackContextEmpty=empty(rolledBack.owner)&&rolledBack.role===role;
    checks.sameConnectionThroughRollback=rolledBack.pid===pid;
    // Read-only commit checks SET LOCAL cleanup independently from rollback.
    await query('READ_BEGIN','BEGIN READ ONLY');transaction=true;
    await query('READ_OWNER',"SELECT set_config('cft005.owner',$1,true)",[label]);
    checks.ownRowPreservedAfterRollback=JSON.stringify(await record('ROW_AFTER_ROLLBACK'))===JSON.stringify(initial);
    await query('COMMIT','COMMIT');transaction=false;
    const committed=await context('AFTER_COMMIT');checks.afterCommitContextEmpty=empty(committed.owner)&&committed.role===role;
    checks.sameConnectionThroughCommit=committed.pid===pid;
    checks.previousVerifiedOwnerDifferent=Boolean(previous&&previous.label!==label);
    checks.sameConnectionAsPreviousAudit=Boolean(previous&&previous.pid===pid);
    return {checks,next:{pid,label}};
  }finally{if(transaction)await query('ABORT','ROLLBACK');}
}

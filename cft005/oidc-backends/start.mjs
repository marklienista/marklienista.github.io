import {loadConfig} from './config.mjs';
import {createProvider} from './provider.mjs';
import {startBackend} from './backend.mjs';
import {createPostgresStore} from './record-store.mjs';
import {ledgerSettings} from './session-ledger/settings.mjs';
import {createLedgerClient} from './session-ledger/transport.mjs';
import {PROOF_ORIGINS} from './config.mjs';

try {
  const cfg=loadConfig(process.env);
  const port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('E_CONFIG');
  if(cfg.origin!==PROOF_ORIGINS[cfg.product])throw new Error('E_CONFIG');
  const ledger=createLedgerClient(ledgerSettings(process.env,cfg.product));
  const provider=await createProvider(cfg);
  const recordStore=createPostgresStore(cfg,process.env.HML_DATABASE_URL,{ledger});
  const server=await startBackend(cfg,provider,{host:'0.0.0.0',port,recordStore,sessionLedger:ledger});
  console.log(`CFT005 backend ${cfg.product} ready`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().then(()=>process.exit(0),()=>process.exit(1));});
}catch(error){
  const safeCategories=new Set(['configuration','tls_validation','authentication','privilege','network_dns','network_connection','role_policy','tls_required','rls_policy','unknown']);
  const category=error?.message==='E_LEDGER_CONFIG'?'session_ledger_configuration':error?.storeFailure&&safeCategories.has(error.storeCategory)?'database_'+error.storeCategory:'configuration_or_oidc';
  console.error('CFT005 backend unavailable: '+category+'. No credentials logged.');
  process.exitCode=1;
}

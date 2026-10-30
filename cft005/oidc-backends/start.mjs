import {loadConfig} from './config.mjs';
import {createProvider} from './provider.mjs';
import {startBackend} from './backend.mjs';
import {createPostgresStore} from './record-store.mjs';
import {ledgerSettings} from './session-ledger/settings.mjs';
import {createLedgerClient} from './session-ledger/transport.mjs';
import {PROOF_ORIGINS} from './config.mjs';
import {operatorEnabled,loadOperatorKeys} from './session-operator/protocol.mjs';
import {createWriteControl} from './session-operator/write-control.mjs';

try {
  const cfg=loadConfig(process.env);
  const port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('E_CONFIG');
  if(cfg.origin!==PROOF_ORIGINS[cfg.product])throw new Error('E_CONFIG');
  const signing=ledgerSettings(process.env,cfg.product),ledger=createLedgerClient(signing);
  let controlledSessions;
  if(operatorEnabled(process.env)){
    if(!/^[a-f0-9]{40}$/.test(process.env.RENDER_GIT_COMMIT??''))throw Error('E_OPERATOR_UNAVAILABLE');
    controlledSessions={privateKey:signing.privateKey,publicKeys:await loadOperatorKeys(signing.privateKey,cfg.product),sourceCommit:process.env.RENDER_GIT_COMMIT,writeControl:createWriteControl()};
  }
  const provider=await createProvider(cfg);
  const recordStore=createPostgresStore(cfg,process.env.HML_DATABASE_URL,{ledger,writeControl:controlledSessions?.writeControl});
  const server=await startBackend(cfg,provider,{host:'0.0.0.0',port,recordStore,sessionLedger:ledger,controlledSessions});
  console.log(`CFT005 backend ${cfg.product} ready`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().then(()=>process.exit(0),()=>process.exit(1));});
}catch(error){
  const safeCategories=new Set(['configuration','tls_validation','authentication','privilege','network_dns','network_connection','role_policy','tls_required','rls_policy','unknown']);
  const category=error?.message==='E_LEDGER_CONFIG'?'session_ledger_configuration':error?.storeFailure&&safeCategories.has(error.storeCategory)?'database_'+error.storeCategory:'configuration_or_oidc';
  console.error('CFT005 backend unavailable: '+category+'. No credentials logged.');
  process.exitCode=1;
}

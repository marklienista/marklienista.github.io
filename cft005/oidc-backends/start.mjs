import {loadConfig} from './config.mjs';
import {createProvider} from './provider.mjs';
import {startBackend} from './backend.mjs';

try {
  const cfg=loadConfig(process.env);
  const port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('E_CONFIG');
  const provider=await createProvider(cfg);
  const server=await startBackend(cfg,provider,{host:'0.0.0.0',port});
  console.log(`CFT005 backend ${cfg.product} ready`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().then(()=>process.exit(0),()=>process.exit(1));});
}catch{
  console.error('CFT005 backend unavailable: check configuration and OIDC discovery. No credentials logged.');
  process.exitCode=1;
}

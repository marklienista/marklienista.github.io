import pg from 'pg';
import {coordinatorSettings} from './settings.mjs';
import {startCoordinator} from './transport.mjs';
try{
  const settings=coordinatorSettings(process.env),port=Number(process.env.PORT??10000);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('E_LEDGER_CONFIG');
  const pool=new pg.Pool(settings.database);pool.on('error',()=>{});
  const server=await startCoordinator({pool,publicKeys:settings.publicKeys},{host:'0.0.0.0',port});
  console.log('CFT005 session ledger ready');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close().then(()=>process.exit(0),()=>process.exit(1)));
}catch{console.error('CFT005 session ledger unavailable. No credentials logged.');process.exit(1);}

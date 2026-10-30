import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {opaque,failure} from './protocol.mjs';

// A private one-use capability only delays an already authorized, fenced UPDATE.
// It never chooses SQL/principal and never bypasses the normal data transaction.
export function createWriteControl(){
  let active;
  return Object.freeze({
    arm(binding,onHeld,onCommit,onBlocked){
      if(active||binding?.owner!=='U1')throw failure();
      const a={binding,marker:opaque(),onHeld,onCommit,onBlocked,claimed:false};active=a;
      return {marker:a.marker,cancel(){if(active===a)active=undefined;}};
    },
    claim(marker,principal){
      if(!active||active.claimed||marker!==active.marker||principal?.label!=='U1'||principal.ledgerBinding?.sessionHash!==active.binding.sessionHash)throw failure();
      active.claimed=true;return active;
    },
    async afterQuery(client,permit,rowCount){
      if(!permit)return;
      if(active!==permit||!permit.claimed||rowCount!==1)throw failure();
      let settled=false;
      const pending=Promise.resolve().then(()=>permit.onHeld()).finally(()=>{settled=true;});
      // Attach immediately: unknown outcomes are observed, never retried.
      pending.catch(()=>{});permit.pending=pending;
      const deadline=performance.now()+750;let blocked=false;
      const timer=setTimeout(()=>{client.end().catch(()=>{});},750);timer.unref();
      try{while(performance.now()<deadline){
        const r=await client.query(`/* CFT005_OPERATOR_BLOCK */ SELECT EXISTS(SELECT 1 FROM pg_stat_activity a
          WHERE a.datname=current_database() AND a.usename='cft005_hml_coordinator'
          AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) AS blocked`);
        if(r.rows[0]?.blocked===true){blocked=true;break;}
        if(settled)throw failure();await delay(15);
      }}finally{clearTimeout(timer);}
      if(!blocked||settled)throw failure();
      permit.blocked=true;
      permit.onBlocked();
    },
    committed(permit){if(permit){if(permit!==active||!permit.blocked)throw failure();permit.onCommit();}},
    cancel(){active=undefined;}
  });
}

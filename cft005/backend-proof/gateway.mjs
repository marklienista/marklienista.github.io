import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {decodeProtectedHeader, jwtVerify} from 'jose';

// Isolated experiment, not an OAuth server, DPoP implementation or production API.
// There is no environment/config loader, external HTTP client or database adapter.
export const IDENTITY_ISSUER = 'https://identity.cft005.test/';
export const API_AUDIENCE = 'urn:cft005:synthetic-api';
export const SERVICE_AUDIENCE = 'urn:cft005:synthetic-gateway';
export const digest = value => createHash('sha256').update(value).digest('base64url');

class Rejection extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
const deny = (status=401, code='unauthorized') => { throw new Rejection(status,code); };

function protectedHeader(token, expectedType) {
  if (typeof token!=='string' || token.length>8192) deny();
  const header=decodeProtectedHeader(token);
  if (header.alg!=='ES256' || header.typ!==expectedType || typeof header.kid!=='string' ||
      Object.keys(header).some(key=>!['alg','typ','kid'].includes(key))) deny();
  return header;
}

function validLifetime(payload, now, maximum) {
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      payload.iat>now || payload.exp<=payload.iat || payload.exp-payload.iat>maximum) deny();
}

async function bodyBytes(req) {
  const chunks=[];
  let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>4096) deny(413,'body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function respond(res,status,body) {
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  });
  res.end(JSON.stringify(body));
}

/** Trust is injected by the test harness; no request can register a key or product. */
export async function startGateway({identityKey, services, subjects}) {
  // Copy mappings, keeping resource ownership and replay state private to this server.
  const trustedServices=new Map(services.map(s=>[s.kid,Object.freeze({...s})]));
  const trustedSubjects=new Map(subjects);
  if (trustedServices.size!==2 || trustedSubjects.size!==2 ||
      services.some(s=>!['A','B'].includes(s.product)) ||
      new Set(services.map(s=>s.product)).size!==2 ||
      new Set(services.map(s=>s.clientId)).size!==2) throw new Error('invalid_fixture_trust');
  const records=new Map();
  for (const userId of trustedSubjects.values()) {
    for (const product of ['A','B']) {
      const id=`${userId}-${product}`;
      records.set(id,{id,userId,product,value:`synthetic-${id}`});
    }
  }
  const usedProofs=new Map();
  let origin;

  const server=createServer({maxHeaderSize:24576,requestTimeout:5000,headersTimeout:5000},async(req,res)=>{
    try {
      // Never trust Host/forwarded headers as the signed API destination.
      if (req.headers.host!==new URL(origin).host) deny(400,'invalid_host');
      const raw=await bodyBytes(req);
      const auth=req.headers.authorization;
      if (typeof auth!=='string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(auth)) deny();
      const token=auth.slice(7);
      const proof=req.headers['x-cft005-service-proof'];
      const serviceHeader=protectedHeader(proof,'cft005-service+jwt');
      const service=trustedServices.get(serviceHeader.kid);
      if (!service) deny();
      const now=Math.floor(Date.now()/1000);
      const {payload:p}=await jwtVerify(proof,service.publicKey,{
        algorithms:['ES256'],typ:'cft005-service+jwt',
        issuer:service.id,subject:service.id,audience:SERVICE_AUDIENCE,
        requiredClaims:['iat','exp','jti','htm','htu','bht','ath'],
        maxTokenAge:30,clockTolerance:0
      });
      validLifetime(p,now,30);
      if (typeof p.jti!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(p.jti) ||
          p.htm!==req.method || p.htu!==origin+req.url ||
          p.bht!==digest(raw) || p.ath!==digest(token)) deny();
      for (const [key,expires] of usedProofs) if (expires<=now) usedProofs.delete(key);
      const replayKey=service.kid+':'+p.jti;
      // No await between checking and consuming the proof, including concurrent requests.
      if (usedProofs.has(replayKey)) deny();
      if (usedProofs.size>=5000) deny(503,'proof_capacity');
      usedProofs.set(replayKey,p.exp);

      const accessHeader=protectedHeader(token,'at+jwt');
      if (accessHeader.kid!=='identity-fixture') deny();
      const {payload:u}=await jwtVerify(token,identityKey,{
        algorithms:['ES256'],typ:'at+jwt',issuer:IDENTITY_ISSUER,audience:API_AUDIENCE,
        requiredClaims:['sub','azp','scope','iat','exp'],maxTokenAge:120,clockTolerance:0
      });
      validLifetime(u,now,120);
      if (typeof u.sub!=='string' || !trustedSubjects.has(u.sub)) deny();
      // One explicit access-token profile: Auth0-style azp. No ambiguous fallback.
      if ('client_id' in u || u.azp!==service.clientId) deny(403,'client_product_mismatch');
      if (typeof u.scope!=='string') deny(403,'scope_required');
      const permission=req.method==='GET'?'records:read':req.method==='PUT'?'records:write':null;
      if (!permission || !u.scope.split(' ').includes(permission)) deny(403,'scope_required');

      const route=/^\/products\/([AB])\/records\/(U[12]-[AB])$/.exec(req.url);
      if (!route) deny(404,'not_found');
      // Product comes from the verified service mapping, never app_id or Origin.
      if (route[1]!==service.product) deny(403,'product_forbidden');
      const row=records.get(route[2]);
      const userId=trustedSubjects.get(u.sub);
      if (!row || row.product!==service.product || row.userId!==userId) deny(404,'not_found');
      if (req.method==='PUT') {
        if (req.headers['content-type']!=='application/json') deny(415,'json_required');
        let input;
        try { input=JSON.parse(raw.toString('utf8')); } catch { deny(400,'invalid_body'); }
        if (!input || typeof input!=='object' || Array.isArray(input) ||
            Object.keys(input).length!==1 || typeof input.value!=='string' ||
            input.value.length>128) deny(400,'invalid_body');
        row.value=input.value;
      } else if (raw.length) deny(400,'unexpected_body');
      respond(res,200,{record:{id:row.id,value:row.value}});
    } catch(error) {
      // Never log/reflect token, proof, headers, payload, crypto errors or request URL.
      if (error instanceof Rejection) respond(res,error.status,{error:error.code});
      else respond(res,401,{error:'unauthorized'});
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  origin=`http://127.0.0.1:${server.address().port}`;
  return Object.freeze({origin,close:()=>new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
    server.closeAllConnections();
  })});
}

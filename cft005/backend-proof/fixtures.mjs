import {generateKeyPair, SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {API_AUDIENCE, IDENTITY_ISSUER, SERVICE_AUDIENCE, digest, startGateway} from './gateway.mjs';

// Test-only issuer and backend callers. Keys/tokens stay in process memory.
// No passwords, real accounts, credentials, Supabase or Auth0 connections.
export async function syntheticEnvironment() {
  const identity=await generateKeyPair('ES256',{extractable:false});
  const attacker=await generateKeyPair('ES256',{extractable:false});
  const serviceA=await generateKeyPair('ES256',{extractable:false});
  const serviceB=await generateKeyPair('ES256',{extractable:false});
  const services={
    A:{kid:'backend-a',id:'urn:cft005:backend-a',clientId:'client-a',product:'A',...serviceA},
    B:{kid:'backend-b',id:'urn:cft005:backend-b',clientId:'client-b',product:'B',...serviceB}
  };
  const gateway=await startGateway({identityKey:identity.publicKey,services:Object.values(services).map(({privateKey,...publicService})=>publicService),
    subjects:[['fixture-subject-1','U1'],['fixture-subject-2','U2']]});

  async function access({user='U1',product='A',claims={},header={},wrongKey=false}={}) {
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({iss:IDENTITY_ISSUER,aud:API_AUDIENCE,sub:user==='U1'?'fixture-subject-1':'fixture-subject-2',
      azp:services[product].clientId,scope:'records:read records:write',iat:now,exp:now+120,...claims})
      .setProtectedHeader({alg:'ES256',typ:'at+jwt',kid:'identity-fixture',...header})
      .sign(wrongKey?attacker.privateKey:identity.privateKey);
  }
  async function proof({product='A',token,method='GET',path='/products/A/records/U1-A',body='',claims={},header={},wrongKey=false}={}) {
    const s=services[product];
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({iss:s.id,sub:s.id,aud:SERVICE_AUDIENCE,iat:now,exp:now+30,jti:randomUUID(),
      htm:method,htu:gateway.origin+path,bht:digest(body),ath:digest(token),...claims})
      .setProtectedHeader({alg:'ES256',typ:'cft005-service+jwt',kid:s.kid,...header})
      .sign(wrongKey?attacker.privateKey:s.privateKey);
  }
  async function request({token,product='A',method='GET',path='/products/A/records/U1-A',body='',headers={},
    proofOptions={},signedProof,omitProof=false,omitToken=false}={}) {
    const actualToken=token??await access({product});
    const serviceProof=signedProof??await proof({product,token:actualToken,method,path,body,...proofOptions});
    const requestHeaders={
      ...(!omitToken?{Authorization:'Bearer '+actualToken}:{}),
      ...(!omitProof?{'X-CFT005-Service-Proof':serviceProof}:{}),
      ...(body?{'Content-Type':'application/json'}:{}),...headers
    };
    // node:http sends the exact Host header under test; fetch may silently replace it.
    return new Promise((resolve,reject)=>{
      const req=httpRequest(gateway.origin+path,{method,headers:requestHeaders,signal:AbortSignal.timeout(5000)},res=>{
        const chunks=[];
        res.on('data',chunk=>chunks.push(chunk));
        res.on('error',reject);
        res.on('end',()=>{
          try {resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8')),headers:new Headers(res.headers)});}
          catch {reject(new Error('synthetic_response_not_json'));}
        });
      });
      req.on('error',reject);
      req.end(body);
    });
  }
  return Object.freeze({access,proof,request,close:gateway.close});
}

export const ISSUER='https://dev-2lz845k6nrma2nhm.us.auth0.com/';
export const AUDIENCE='https://cft005-synthetic-api.invalid';

export function loadConfig(env) {
  const fail=()=>{throw new Error('E_CONFIG');};
  const product=env.PRODUCT;
  if (!['A','B'].includes(product)) fail();
  if (env.AUTH0_ISSUER!==ISSUER || env.AUTH0_AUDIENCE!==AUDIENCE) fail();
  const ids=[env.AUTH0_CLIENT_ID_A,env.AUTH0_CLIENT_ID_B];
  if (ids.some(x=>typeof x!=='string'||! /^[A-Za-z0-9_-]{8,128}$/.test(x)) || ids[0]===ids[1]) fail();
  if (typeof env.AUTH0_CLIENT_SECRET!=='string'||env.AUTH0_CLIENT_SECRET.length<32) fail();
  let origin,subjects;
  try {
    const url=new URL(env.PUBLIC_ORIGIN);
    if (url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash) fail();
    origin=url.origin;
    subjects=JSON.parse(env.SYNTHETIC_SUBJECTS_JSON);
  } catch {fail();}
  if (!subjects || Array.isArray(subjects) || typeof subjects!=='object' ||
      Object.keys(subjects).length<1 || Object.keys(subjects).length>2 ||
      Object.entries(subjects).some(([sub,label])=>typeof sub!=='string'||sub.length<5||sub.length>200||!['U1','U2'].includes(label)) ||
      new Set(Object.values(subjects)).size!==Object.keys(subjects).length) fail();
  return Object.freeze({product,issuer:ISSUER,audience:AUDIENCE,origin,
    clientId:ids[product==='A'?0:1],otherClientId:ids[product==='A'?1:0],
    clientSecret:env.AUTH0_CLIENT_SECRET,subjects:Object.freeze({...subjects})});
}

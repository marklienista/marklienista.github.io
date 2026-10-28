// Preparation only. This module has no network, environment or credential access.
export const contractVersion='CFT005-HML-1';
export const fixtures=Object.freeze(['A','B'].flatMap(product=>['U1','U2'].map(owner=>
  Object.freeze({id:`HML-${product}-${owner}`,product,owner,value:`synthetic-${product}-${owner}-v1`}))));

const reached={H09:['signatureVerifiedBeforeClientMismatch'],H11:['validCsrfUsedForNegativeProbe','productPolicyReached'],H21:['benignMarkerReachedApplication']};
const c=(id,gate,title,source,prerequisites,baseline,expect)=>Object.freeze({id,gate,title,source,prerequisites,baseline,evidenceChecks:reached[id]??[],expect});
export const cases=Object.freeze([
  c('H01','S02','Quatro sessões positivas em dois perfis isolados','browser',['isolatedTarget','separateProfiles'],[],{verifiedSessions:4,profilesSeparated:true,identitiesDistinct:true,noPersonalAccountUsed:true}),
  c('H02','S02','Persistência sem mistura entre perfis','browser',['isolatedTarget','separateProfiles'],['H01'],{reloadsVerified:4,reopenedTabsVerified:4,identityPreserved:true,noNewLogin:true}),
  c('H03','S11','Leitura e escrita próprias nas quatro combinações','http',['isolatedTarget','database'],['H01'],{ownReads200:4,ownWrites200:4,readBackMatches:true,persistentAdapterUsed:true}),
  c('H04','S11','Outro usuário no mesmo produto','http',['isolatedTarget','database'],['H03'],{otherReads404:4,otherWrites404:4,otherRowsUnchanged:true,noDataDisclosed:true}),
  c('H05','S11','Tentativa de alterar proprietário e produto','http',['isolatedTarget','database'],['H03'],{forgedWritesRejected:4,ownerAndProductUnchanged:true,noExtraRows:true}),
  c('H06','S11','RLS executada com papel sem bypass','database',['isolatedTarget','database'],['H03'],{verifiedContexts:4,nonOwnerRole:true,noBypassRls:true,selectOwnRows:4,selectOtherRows:0,updateOtherRows:0,withCheckRejected:true,otherRowsUnchanged:true}),
  c('H07','S12','Mesmo usuário cruza produtos nas duas direções','http',['isolatedTarget','database'],['H03'],{crossReads403:4,crossWrites403:4,allTargetsUnchanged:true}),
  c('H08','S12','Credencial de banco A não alcança B e vice-versa','database',['isolatedTarget','database'],['H03'],{aToBDenied:true,bToADenied:true,cannotAssumeOtherRole:true,noSharedAdminCredential:true,allTargetsUnchanged:true}),
  c('H09','S12','JWT real do outro cliente após validação criptográfica','http',['isolatedTarget','database'],['H03'],{aToB401:true,bToA401:true,signatureVerifiedBeforeClientMismatch:true,noDataRouteReached:true}),
  c('H10','S12','Bearer do navegador e JWT Supabase comum','http',['isolatedTarget','database'],['H03'],{browserBearer401:true,sharedSupabaseJwtDenied:true,noTokenToProductExchange:true,noDataDisclosed:true}),
  c('H11','S12','Origin ausente/forjado não concede produto','http',['isolatedTarget','database'],['H03'],{crossRequestsDenied:true,validCsrfUsedForNegativeProbe:true,productPolicyReached:true,authenticatedIdentityUnchanged:true,allTargetsUnchanged:true}),
  c('H12','S11/S12','Contorno por REST, GraphQL, RPC, view, Storage e Realtime','review',['isolatedTarget','database','surfaceInventory'],['H03'],{allSixSurfacesInventoried:true,enabledSurfacesTested:true,disabledSurfacesVerified:true,noPublicBypass:true,noSecurityDefinerBypass:true,noPublicFunctionExecute:true}),
  c('H13','S11','Conexão reutilizada não conserva proprietário anterior','database',['isolatedTarget','database'],['H03','H06'],{u1ThenU2Verified:true,transactionContextReset:true,ownerFromVerifiedPrincipal:true,otherRowsUnchanged:true}),
  c('H14','S13','Logout local é limitado à sessão atual','browser',['isolatedTarget','sessionLedger','separateProfiles'],['H01'],{aSession401:true,bSession200:true,u2Session200:true,noCentralLogoutClaim:true}),
  c('H15','S13','Revogação coordenada das sessões HML de U1','http',['isolatedTarget','sessionLedger','separateProfiles'],['H14'],{ackAfterDurableCommit:true,aOldSession401:true,bOldSession401:true,u2Session200:true,inFlightWriteOrdered:true,noOldEpochReactivation:true}),
  c('H16','S13','Coordenador indisponível falha fechado','http',['isolatedTarget','sessionLedger'],['H15'],{protectedReadsDenied:true,protectedWritesDenied:true,noSuccessAcknowledgement:true,localCleanupPossible:true,noCachedAllow:true}),
  c('H17','S13','Replay e falsificação da revogação','http',['isolatedTarget','sessionLedger'],['H15'],{unsignedCommandDenied:true,replayCannotRevokeNewSession:true,wrongClientDenied:true,wrongTargetDenied:true,u2Unchanged:true}),
  c('H18','S13','SSO Auth0: encerramento e retorno seguro','browser',['isolatedTarget','isolatedSso'],['H15'],{auth0SessionEnded:true,fixedReturnVerified:true,arbitraryReturnDenied:true,googleLogoutNotClaimed:true,publishedSessionsUntouched:true}),
  c('H19','S13','Credencial anterior não reativa sessão revogada','http',['isolatedTarget','sessionLedger'],['H15'],{oldCookie401:true,oldSessionEpochDenied:true,previousBearerCannotCreateSession:true,newLoginCreatesNewEpoch:true}),
  c('H20','S14','Dependências e artefatos completos','review',['isolatedTarget','securityInventory'],[],{fullDependencyGraphPinned:true,lockAndIntegrityVerified:true,advisoriesTriaged:true,deployedHashesMatch:true}),
  c('H21','S14','CSP e XSS no aplicativo, além do WAF','browser',['isolatedTarget','securityInventory'],['H01'],{benignMarkerReachedApplication:true,noScriptExecution:true,noReflection:true,cspEffective:true,noExternalExfiltration:true}),
  c('H22','S14','URLs, callbacks e redirecionamentos','http',['isolatedTarget','securityInventory'],['H01'],{callbackUrlCleared:true,noReferrerLeak:true,openRedirectDenied:true,providerDescriptionNotReflected:true,noRawCallbackInEvidence:true}),
  c('H23','S14','Logs e retenção dos provedores','review',['isolatedTarget','securityInventory'],[],{applicationLogsSanitized:true,hostRetentionDocumented:true,idpRetentionDocumented:true,noCredentialExports:true,unknownRetentionNotApproved:true}),
  c('H24','S12/S13','Reinício e concorrência na fronteira persistente','http',['isolatedTarget','database','sessionLedger'],['H03','H15'],{syntheticRowsPersist:true,revocationPersists:true,concurrentWriteOrdered:true,noCrossProductPrivilege:true,noProductionChanged:true})
]);

export const prerequisites=Object.freeze(['isolatedTarget','separateProfiles','database','surfaceInventory','sessionLedger','isolatedSso','securityInventory']);
export function blankReceipt(){
  return {contractVersion,runId:'HML-20261028-PREP',mode:'real',scope:'synthetic-only',
    safeguards:{publishedAppsUnchanged:true,apertaquemUnchanged:true,realDataUntouched:true,globalTtlUnchanged:true},
    prerequisites:Object.fromEntries(prerequisites.map(name=>[name,false])),observations:[]};
}

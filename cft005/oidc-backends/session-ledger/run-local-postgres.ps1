param([switch]$Integration,[switch]$Audit,[switch]$Operator)
$ErrorActionPreference='Stop'
$taskBin='C:/Program Files/PostgreSQL/17/bin'
$taskNode='C:/Users/Dune/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath "$taskBin/postgres.exe")) { throw 'E_LOCAL_PG17_MISSING' }
if (Get-NetTCPConnection -LocalPort 57517 -ErrorAction SilentlyContinue) { throw 'E_LOCAL_PORT_BUSY' }
$taskSuffix=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(6)).ToLowerInvariant()
$taskRoot=Join-Path 'D:/Dev/cft005-evidencias' ('pg17-ledger-'+$taskSuffix)
[IO.Directory]::CreateDirectory($taskRoot) | Out-Null
$taskAcl=[Security.AccessControl.DirectorySecurity]::new()
$taskAcl.SetAccessRuleProtection($true,$false)
$taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$taskAcl.SetOwner($taskSid)
$taskRule=[Security.AccessControl.FileSystemAccessRule]::new($taskSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
$taskAcl.AddAccessRule($taskRule)
Set-Acl -LiteralPath $taskRoot -AclObject $taskAcl
[IO.File]::WriteAllText((Join-Path $taskRoot 'local-synthetic-only.txt'),'CFT005-LOCAL-PG17')
$taskStarted=$false
$taskPwFile=Join-Path $taskRoot 'init-password.txt'
$taskKeyFile=Join-Path $taskRoot 'server.key'
try {
  $taskAdminPassword=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
  [IO.File]::WriteAllText($taskPwFile,$taskAdminPassword,[Text.UTF8Encoding]::new($false))
  $taskInit=& "$taskBin/initdb.exe" -D (Join-Path $taskRoot 'data') --encoding=UTF8 --no-locale --username=cft005_local_admin --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$taskPwFile 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'E_LOCAL_INITDB' }
  Remove-Item -LiteralPath $taskPwFile
  $taskRsa=[Security.Cryptography.RSA]::Create(2048)
  $taskRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$taskRsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $taskSan=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $taskSan.AddDnsName('localhost');$taskSan.AddDnsName('cft005-session-ledger-teste.onrender.com');$taskSan.AddIpAddress([Net.IPAddress]::Loopback)
  $taskRequest.CertificateExtensions.Add($taskSan.Build())
  $taskCert=$taskRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
  [IO.File]::WriteAllText($taskKeyFile,$taskRsa.ExportRSAPrivateKeyPem())
  [IO.File]::WriteAllText((Join-Path $taskRoot 'server.crt'),$taskCert.ExportCertificatePem())
  $taskCert.Dispose();$taskRsa.Dispose()
  $taskRootUnix=$taskRoot.Replace('\','/')
  $taskConfig=@"
listen_addresses='127.0.0.1'
port=57517
ssl=on
ssl_min_protocol_version='TLSv1.2'
ssl_cert_file='$taskRootUnix/server.crt'
ssl_key_file='$taskRootUnix/server.key'
password_encryption='scram-sha-256'
fsync=on
full_page_writes=on
synchronous_commit=on
log_statement='none'
log_min_messages='fatal'
log_min_error_statement='panic'
log_parameter_max_length=0
log_parameter_max_length_on_error=0
logging_collector=off
"@
  [IO.File]::AppendAllText((Join-Path $taskRoot 'data/postgresql.conf'),"`n"+$taskConfig+"`n")
  $taskHba=@"
hostssl all cft005_local_admin 127.0.0.1/32 scram-sha-256
hostssl cft005_hml_db_teste cft005_hml_a,cft005_hml_b,cft005_hml_coordinator 127.0.0.1/32 scram-sha-256
host all all 0.0.0.0/0 reject
host all all ::0/0 reject
"@
  [IO.File]::WriteAllText((Join-Path $taskRoot 'data/pg_hba.conf'),$taskHba)
  & "$PSScriptRoot/control-local-postgres.ps1" -Cluster $taskRoot -Mode Start
  $taskStarted=$true
  $env:CFT005_LOCAL_CLUSTER=$taskRoot
  $env:CFT005_LOCAL_ADMIN_PASSWORD=$taskAdminPassword
  $env:CFT005_LOCAL_PWSH=Join-Path $PSHOME 'pwsh.exe'
  if ($Integration -or $Audit -or $Operator) { $env:CFT005_LOCAL_INTEGRATION='1' }
  if ($Audit) { $env:CFT005_LOCAL_AUDIT='1' }
  if ($Operator) { $env:CFT005_LOCAL_OPERATOR='1' }
  & $taskNode "$PSScriptRoot/postgres-validation.mjs"
  if ($LASTEXITCODE -ne 0) { throw 'E_LOCAL_VALIDATION_FAILED' }
} finally {
  Remove-Item Env:CFT005_LOCAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:CFT005_LOCAL_CLUSTER -ErrorAction SilentlyContinue
  Remove-Item Env:CFT005_LOCAL_PWSH -ErrorAction SilentlyContinue
  Remove-Item Env:CFT005_LOCAL_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:CFT005_LOCAL_AUDIT -ErrorAction SilentlyContinue
  Remove-Item Env:CFT005_LOCAL_OPERATOR -ErrorAction SilentlyContinue
  $taskAdminPassword=$null
  try {
    if ($taskStarted -or (Test-Path -LiteralPath (Join-Path $taskRoot 'data/postmaster.pid'))) { & "$PSScriptRoot/control-local-postgres.ps1" -Cluster $taskRoot -Mode Stop }
  } finally {
    # Only the two exact ephemeral secret files in the verified fresh cluster.
    if ([IO.Path]::GetFullPath($taskRoot) -notmatch '^D:\\Dev\\cft005-evidencias\\pg17-ledger-[a-f0-9]{12}$') { throw 'E_CLEANUP_GUARD' }
    foreach ($taskSecretFile in @($taskPwFile,$taskKeyFile)) { if (Test-Path -LiteralPath $taskSecretFile) { Remove-Item -LiteralPath $taskSecretFile } }
  }
}

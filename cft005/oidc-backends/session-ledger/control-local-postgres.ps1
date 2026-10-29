param([Parameter(Mandatory=$true)][string]$Cluster,[ValidateSet('Start','Stop','Restart')][string]$Mode)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath($Cluster)
if ($taskRoot -notmatch '^D:\\Dev\\cft005-evidencias\\pg17-ledger-[a-f0-9]{12}$' -or
    (Get-Content -LiteralPath (Join-Path $taskRoot 'local-synthetic-only.txt') -Raw) -ne 'CFT005-LOCAL-PG17') { throw 'E_LOCAL_CLUSTER_GUARD' }
$taskData=Join-Path $taskRoot 'data'
$taskBin='C:/Program Files/PostgreSQL/17/bin'
if ($Mode -in @('Stop','Restart')) {
  $taskStop=& "$taskBin/pg_ctl.exe" -D $taskData -m fast -w stop 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'E_LOCAL_STOP' }
}
if ($Mode -in @('Start','Restart')) {
  [IO.File]::WriteAllText((Join-Path $taskRoot 'empty-stdin.txt'),'')
  $taskProcess=Start-Process -FilePath "$taskBin/postgres.exe" -ArgumentList @('-D',$taskData) -WindowStyle Hidden -PassThru -RedirectStandardInput (Join-Path $taskRoot 'empty-stdin.txt') -RedirectStandardError (Join-Path $taskRoot 'server-stderr.txt') -RedirectStandardOutput (Join-Path $taskRoot 'server-stdout.txt')
  $taskReady=$false
  for ($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++) {
    $taskProbe=& "$taskBin/pg_isready.exe" -h 127.0.0.1 -p 57517 2>&1
    if ($LASTEXITCODE -eq 0) { $taskReady=$true;break }
    if ($taskProcess.HasExited) { throw 'E_LOCAL_PROCESS_EXIT' }
    Start-Sleep -Milliseconds 100
  }
  if (-not $taskReady) { throw 'E_LOCAL_START_TIMEOUT' }
}
Write-Output ('LOCAL_PG_'+$Mode.ToUpper()+'_OK')

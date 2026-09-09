param([int]$OwnerId, [int]$CoreId, [long]$CoreStarted, [string]$CorePath)
$ErrorActionPreference = 'Stop'
try {
  $owner = [System.Diagnostics.Process]::GetProcessById($OwnerId)
  $core = [System.Diagnostics.Process]::GetProcessById($CoreId)
  $started = ([DateTimeOffset]$core.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
  if ($started -lt $CoreStarted -or $started -gt ($CoreStarted + 15000) -or $core.MainModule.FileName -ne $CorePath) { exit }
  $null = $owner.Handle
  $null = $core.Handle
  while (-not $core.HasExited) {
    if ($owner.WaitForExit(1000)) {
      if (-not $core.HasExited) { $core.Kill() }
      break
    }
  }
} catch { exit }

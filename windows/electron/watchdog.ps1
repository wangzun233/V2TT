param([int]$OwnerId, [int]$CoreId, [long]$CoreStarted, [string]$CorePath)
$ErrorActionPreference = 'Stop'
try {
  $core = [System.Diagnostics.Process]::GetProcessById($CoreId)
  $started = ([DateTimeOffset]$core.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
  if ($started -lt $CoreStarted -or $started -gt ($CoreStarted + 15000) -or $core.MainModule.FileName -ne $CorePath) { exit }
  $null = $core.Handle
  # The owner may exit while PowerShell is still starting. Validate the core
  # identity first so that this race cannot leave an orphaned tunnel behind.
  try {
    $owner = [System.Diagnostics.Process]::GetProcessById($OwnerId)
  } catch [System.ArgumentException] {
    if (-not $core.HasExited) { $core.Kill() }
    exit
  }
  $null = $owner.Handle
  Write-Output 'V2TT_WATCHDOG_READY'
  while (-not $core.HasExited) {
    if ($owner.WaitForExit(1000)) {
      if (-not $core.HasExited) { $core.Kill() }
      break
    }
  }
} catch { exit }

param([Parameter(Mandatory = $true)][string]$InstallDirectory, [switch]$KeepStartup)
$ErrorActionPreference = 'Stop'
$installRoot = [System.IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
$mainExe = Join-Path $installRoot 'V2TT Client.exe'
$coreExe = Join-Path $installRoot 'resources\bin\sing-box.exe'

$task = Get-ScheduledTask -TaskPath '\' | Where-Object { $_.TaskName -eq 'V2TT Client Auto Start' }
if (-not $KeepStartup -and $task -and $task.Actions[0].Execute -eq $mainExe) {
  $task | Unregister-ScheduledTask -Confirm:$false
}
Get-CimInstance Win32_Process -Filter "Name = 'sing-box.exe'" | Where-Object {
  $_.ExecutablePath -eq $coreExe
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

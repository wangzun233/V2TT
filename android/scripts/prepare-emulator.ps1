param([ValidateSet(30,35)][int]$Api = 35,
    [string]$ToolchainRoot = $(if ($env:V2TT_TOOLCHAIN_ROOT) { $env:V2TT_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'V2TT-Toolchains\android' }))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = $ToolchainRoot
$sdk = "$root\sdk"
$items = @(
    @{ Manifest='https://dl.google.com/android/repository/repository2-3.xml'; Id='emulator'; Base='https://dl.google.com/android/repository/'; Zip='emulator.zip'; Extract=$sdk; Check="$sdk\emulator\emulator.exe" },
    @{ Manifest='https://dl.google.com/android/repository/sys-img/android/sys-img2-3.xml'; Id="system-images;android-$Api;default;x86_64"; Base='https://dl.google.com/android/repository/sys-img/android/'; Zip="system-image-$Api.zip"; Extract="$sdk\system-images\android-$Api\default"; Check="$sdk\system-images\android-$Api\default\x86_64\system.img" }
)
foreach ($item in $items) {
    if (Test-Path $item.Check) { continue }
    [xml]$repo = (Invoke-WebRequest -UseBasicParsing $item.Manifest).Content
    $package = $repo.SelectNodes("//*[local-name()='remotePackage']") | Where-Object { $_.path -eq $item.Id } | Select-Object -First 1
    $archive = $package.archives.archive | Where-Object { $_.'host-os' -eq 'windows' -or !($_.'host-os') } | Select-Object -First 1
    $zip = Join-Path $root $item.Zip
    Write-Output "Preparing $($item.Id)"
    if (!(Test-Path $zip)) {
        & curl.exe --noproxy '*' --fail --silent --show-error --location --retry 3 --connect-timeout 30 --max-time 900 --output $zip ($item.Base + $archive.complete.url)
        if ($LASTEXITCODE -ne 0) { throw 'Emulator download failed' }
    }
    if ((Get-FileHash $zip -Algorithm SHA1).Hash -ne $archive.complete.checksum.'#text') { throw 'Emulator checksum mismatch' }
    New-Item -ItemType Directory -Force $item.Extract | Out-Null
    & tar.exe -xf $zip -C $item.Extract
    if ($LASTEXITCODE -ne 0) { throw 'Emulator extraction failed' }
}
Write-Output 'Emulator files ready'

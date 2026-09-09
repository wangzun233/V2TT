param([string]$ToolchainRoot = $(if ($env:V2TT_TOOLCHAIN_ROOT) { $env:V2TT_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'V2TT-Toolchains\android' }))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = $ToolchainRoot
New-Item -ItemType Directory -Force $root | Out-Null
function Download($url, $path, $hash, $algorithm = 'SHA256') {
    if (!(Test-Path -LiteralPath $path)) {
        & curl.exe --fail --silent --show-error --location --retry 3 --connect-timeout 30 --max-time 1200 --output $path $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm $algorithm).Hash -ne $hash) { throw "Checksum mismatch: $path" }
}
$jdk = "$root\jdk"
if (!(Test-Path "$jdk\bin\java.exe")) {
    $asset = (Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows')[0].binary.package
    Write-Output 'Downloading verified Temurin JDK 21'
    Download $asset.link "$root\jdk.zip" $asset.checksum
    New-Item -ItemType Directory -Force "$root\jdk-extract" | Out-Null
    & tar.exe -xf "$root\jdk.zip" -C "$root\jdk-extract"
    if ($LASTEXITCODE -ne 0) { throw 'JDK extraction failed' }
    $source = Get-ChildItem "$root\jdk-extract" -Directory | Select-Object -First 1
    Move-Item -LiteralPath $source.FullName -Destination $jdk
}
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
$sdk = "$root\sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
if (!(Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    [xml]$repo = (Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/repository2-3.xml').Content
    $package = $repo.SelectNodes("//*[local-name()='remotePackage']") | Where-Object { $_.path -eq 'cmdline-tools;latest' }
    $archive = $package.archives.archive | Where-Object { $_.'host-os' -eq 'windows' }
    Write-Output 'Downloading verified Android command-line tools'
    Download ('https://dl.google.com/android/repository/' + $archive.complete.url) "$root\sdk-tools.zip" $archive.complete.checksum.'#text' 'SHA1'
    New-Item -ItemType Directory -Force "$root\sdk-extract", "$sdk\cmdline-tools" | Out-Null
    & tar.exe -xf "$root\sdk-tools.zip" -C "$root\sdk-extract"
    if ($LASTEXITCODE -ne 0) { throw 'SDK extraction failed' }
    Move-Item -LiteralPath "$root\sdk-extract\cmdline-tools" -Destination "$sdk\cmdline-tools\latest"
}
$manager = "$sdk\cmdline-tools\latest\bin\android.exe"
Write-Output 'Installing Android platform, build tools and NDK'
foreach ($package in @('platforms/android-37.1', 'build-tools/36.0.0')) {
    if (Test-Path "$sdk/$package/package.xml") { continue }
    & $manager --no-metrics "--sdk=$sdk" sdk install $package
    if (!(Test-Path "$sdk/$package/package.xml")) { throw "SDK package installation incomplete: $package (exit $LASTEXITCODE)" }
}
if (!(Test-Path "$sdk\ndk\28.0.13004108\source.properties")) {
    [xml]$repo = (Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/repository2-3.xml').Content
    $package = $repo.SelectNodes("//*[local-name()='remotePackage']") | Where-Object { $_.path -eq 'ndk;28.0.13004108' }
    $archive = $package.archives.archive | Where-Object { $_.'host-os' -eq 'windows' }
    Write-Output 'Downloading NDK directly with official checksum verification'
    if (!(Test-Path "$root\ndk.zip")) {
        & curl.exe --noproxy '*' --fail --silent --show-error --location --retry 3 --connect-timeout 30 --max-time 1200 --output "$root\ndk.zip" ('https://dl.google.com/android/repository/' + $archive.complete.url)
        if ($LASTEXITCODE -ne 0) { throw 'NDK download failed' }
    }
    if ((Get-FileHash "$root\ndk.zip" -Algorithm SHA1).Hash -ne $archive.complete.checksum.'#text') { throw 'NDK checksum mismatch' }
    New-Item -ItemType Directory -Force "$root\ndk-extract", "$sdk\ndk" | Out-Null
    & tar.exe -xf "$root\ndk.zip" -C "$root\ndk-extract"
    if ($LASTEXITCODE -ne 0) { throw 'NDK extraction failed' }
    Move-Item -LiteralPath "$root\ndk-extract\android-ndk-r28" -Destination "$sdk\ndk\28.0.13004108"
}
if (!(Test-Path "$root\go\bin\go.exe")) {
    $releases = Invoke-RestMethod 'https://go.dev/dl/?mode=json&include=all'
    $go = ($releases | Where-Object { $_.version -eq 'go1.25.12' }).files | Where-Object { $_.os -eq 'windows' -and $_.arch -eq 'amd64' -and $_.kind -eq 'archive' }
    if (!$go) { throw 'Pinned Go version not found' }
    Write-Output 'Downloading verified Go 1.25.12'
    Download ('https://go.dev/dl/' + $go.filename) "$root\go.zip" $go.sha256
    & tar.exe -xf "$root\go.zip" -C $root
    if ($LASTEXITCODE -ne 0) { throw 'Go extraction failed' }
}
Write-Output "Toolchains ready in $root"

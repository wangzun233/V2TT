param([switch]$SkipCore, [switch]$Release,
    [string]$ToolchainRoot = $(if ($env:V2TT_TOOLCHAIN_ROOT) { $env:V2TT_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'V2TT-Toolchains\android' }))
$ErrorActionPreference = 'Stop'
$root = $ToolchainRoot
$project = Split-Path $PSScriptRoot
$core = Join-Path (Split-Path $project) 'v2tt-android-core'
$env:JAVA_HOME = "$root\jdk"
$env:ANDROID_HOME = "$root\sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_NDK_HOME = "$root\sdk\ndk\28.0.13004108"
$env:GOPATH = "$root\gopath"
$env:GOCACHE = "$root\go-cache"
$env:GRADLE_USER_HOME = "$root\gradle-cache"
$env:PATH = "$root\go\bin;$env:GOPATH\bin;$env:JAVA_HOME\bin;$env:PATH"
$proxyArgs = @()
if ($env:HTTPS_PROXY) {
    $proxy = [Uri]$env:HTTPS_PROXY
    if ($proxy.Host -and !$proxy.UserInfo) {
        $proxyArgs = @("-Dhttps.proxyHost=$($proxy.Host)", "-Dhttps.proxyPort=$($proxy.Port)", "-Dhttp.proxyHost=$($proxy.Host)", "-Dhttp.proxyPort=$($proxy.Port)")
    }
}
if (!$SkipCore) {
    Push-Location $core
    try {
        $revision = & git rev-parse HEAD
        if ($revision -ne 'b5ebaa1fc0f2b94256180b95468e73ef53caa27d') { throw 'Unexpected sing-box revision' }
        & go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.12
        if ($LASTEXITCODE -ne 0) { throw 'gomobile installation failed' }
        & go install github.com/sagernet/gomobile/cmd/gobind@v0.1.12
        if ($LASTEXITCODE -ne 0) { throw 'gobind installation failed' }
        New-Item -ItemType Directory -Force "$project\app\libs" | Out-Null
        # Build only the protocols required by V2TT, from the unmodified pinned source.
        & gomobile bind -o "$project\app\libs\libbox.aar" -target android/arm64,android/amd64 -androidapi 26 -javapkg io.nekohasekai -libname box -trimpath -buildvcs=false -ldflags '-X github.com/sagernet/sing-box/constant.Version=1.13.19 -s -w -buildid= -checklinkname=0' -tags 'with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,badlinkname,tfogo_checklinkname0' ./experimental/libbox
        if ($LASTEXITCODE -ne 0) { throw 'libbox build failed' }
    } finally { Pop-Location }
}
Push-Location $project
try {
    & .\gradlew.bat @proxyArgs :manifest-tests:test --console=plain --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Manifest tests failed' }
    $task = if ($Release) { ':app:assembleOtherRelease' } else { ':app:assembleOtherDebug' }
    & .\gradlew.bat @proxyArgs $task --console=plain --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed' }
} finally { Pop-Location }

param([switch]$SkipCore, [switch]$Release,
    [string]$ToolchainRoot = $(if ($env:V2TT_TOOLCHAIN_ROOT) { $env:V2TT_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'V2TT-Toolchains\android' }))
$ErrorActionPreference = 'Stop'
$root = $ToolchainRoot
$project = Split-Path $PSScriptRoot
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
    & (Join-Path (Split-Path $project) 'scripts/build-core.ps1') -Platform android -ToolchainRoot $ToolchainRoot
}
Push-Location $project
try {
    & .\gradlew.bat @proxyArgs :manifest-tests:test --console=plain --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Manifest tests failed' }
    $task = if ($Release) { ':app:assembleOtherRelease' } else { ':app:assembleOtherDebug' }
    & .\gradlew.bat @proxyArgs $task --console=plain --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed' }
} finally { Pop-Location }

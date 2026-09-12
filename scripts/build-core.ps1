param(
    [ValidateSet('windows', 'android')][string]$Platform = 'windows',
    [Parameter(Mandatory)][string]$ToolchainRoot
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$archive = Join-Path $repo 'vendor/sing-box-0b89958.tar.gz'
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne '6D64F6555B5AA79691F7CF7ECFF7D6CBDA0AD6841F3E32DC7C85A8FD28B87D69') {
    throw 'Pinned sing-box source checksum mismatch'
}
$source = Join-Path $repo "audit-work/core-build-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $source -Force | Out-Null
& tar.exe -xf $archive -C $source --strip-components=1
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
$env:JAVA_HOME = "$ToolchainRoot\jdk"
$env:ANDROID_HOME = "$ToolchainRoot\sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\28.0.13004108"
$env:GOPATH = "$ToolchainRoot\gopath"
$env:GOCACHE = "$ToolchainRoot\go-cache"
$env:PATH = "$ToolchainRoot\go\bin;$env:GOPATH\bin;$env:JAVA_HOME\bin;$env:PATH"
Push-Location $source
try {
    if ($Platform -eq 'windows') {
        $env:CGO_ENABLED = '0'
        & go build -trimpath -buildvcs=false -tags 'with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api' -ldflags '-X github.com/sagernet/sing-box/constant.Version=1.14.0 -s -w' -o "$repo\windows\resources\bin\sing-box.exe" ./cmd/sing-box
    } else {
        $env:CGO_ENABLED = '1'
        & go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.12
        if ($LASTEXITCODE -ne 0) { throw 'gomobile installation failed' }
        & go install github.com/sagernet/gomobile/cmd/gobind@v0.1.12
        if ($LASTEXITCODE -ne 0) { throw 'gobind installation failed' }
        & gomobile bind -o "$repo\android\app\libs\libbox.aar" -target android/arm64,android/amd64 -androidapi 26 -javapkg io.nekohasekai -libname box -trimpath -buildvcs=false -ldflags '-X github.com/sagernet/sing-box/constant.Version=1.14.0 -s -w -buildid= -checklinkname=0' -tags 'with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,badlinkname,tfogo_checklinkname0' ./experimental/libbox
    }
    if ($LASTEXITCODE -ne 0) { throw 'Core build failed' }
} finally { Pop-Location }

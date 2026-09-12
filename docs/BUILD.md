# 构建说明

所有构建输出、日志、私有配置和签名文件均应保留在 Git 忽略目录中。不要把开发者的整个用户目录复制进仓库。

## Windows

使用 Windows x64、Node.js 和 npm。在 `windows` 目录执行：

```powershell
npm ci
npm run build
npm run lint
npm test
npm run test:native
npx playwright install chromium
npm run test:e2e
npm run dist:win
npm run release:verify
```

输出位于 `windows/release`。通过锁文件固定依赖；不要手工拼装 EXE 或复用含个人运行目录的压缩包。安装包默认未签名，正式代码签名需要单独保管证书及凭证。

`resources/bin/sing-box.exe` 使用 sing-box 1.14.0，由固定的上游源码本地编译，并非官方发行 ZIP 中的二进制。源码提交为 `0b8995879f29a9b98ee027bc17b75e101445b238`。在仓库根目录运行 `scripts/build-core.ps1 -Platform windows -ToolchainRoot <工具链目录>` 可重新编译；脚本先验证随仓库源码归档的 SHA256。

## Android

项目位于 `android`。工具链默认使用 `%LOCALAPPDATA%\V2TT-Toolchains\android`，可用 `V2TT_TOOLCHAIN_ROOT` 指定其他目录。构建不要求上传或提交 `local.properties`。

```powershell
cd android
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap-android.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1 -SkipCore
```

仓库包含固定的 `app/libs/libbox.aar`。自行准备工具链时需 JDK 21、Android SDK 37.1、Build Tools 36、NDK 28.0.13004108，使用仓库 Gradle Wrapper。当前 AGP 对较新 SDK 有兼容范围警告，未将它隐藏。

要重编译核心，在仓库根目录操作：

```powershell
cd android
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
```

核心编译使用 Go 1.25.12、gomobile/gobind 0.1.12；具体标签见 `scripts/build-core.ps1`。1.14.0 原始核心源码归档位于 `vendor/sing-box-0b89958.tar.gz`，不含私人 Git 历史。旧版归档保留供追溯。

Android 输出位于 `android/app/build/outputs/apk/other/debug`。正式签名需要自己创建并离线保管的 keystore，通过本地属性提供，不能提交私钥或签名口令。上游公开 keystore 已从发布快照排除。

## 国内规则与许可证

`vendor/rules` 包含随包 `.srs` 对应的可编辑 JSON。使用相同版本 `sing-box rule-set compile` 编译，并核对各客户端资源哈希。规则为固定快照，不宣称实时更新。

分发客户端安装包时保留本仓库相同标签的完整源码、`vendor` 核心源码、构建说明和第三方许可证。只贴上游首页不能代替提供本项目修改后的源码。

## 发布

优先在单独发布目录构建。检查源码后再扫描解包的 Windows ASAR 和 Android APK/AAR 内容，不仅扫描文件名。

`scripts/privacy-check.mjs` 提供基础检查，不代替人工审查和更全面的密钥扫描。仓库默认不启用自动上传工作流，发布 Release 前人工确认附件和 SHA256。

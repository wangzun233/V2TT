# V2TT Client for Android

Android 原生测试版，基于 sing-box for Android 的 VPN 服务及 Compose 界面实现。
独立应用 ID：`top.wangzun233.v2tt.android`。不是 SagerNet 官方发行版。

## 当前范围

- Android 8.0 及以上；ARM64 手机和 x86_64 测试设备。
- 直接导入现有 V2TT Client 专属 HTTPS JSON 订阅，不内置任何真实账号。
- 智能：国内直连，国外 VLESS + WebSocket + TLS。
- 极速：国内直连，国外 TUIC，OpenAI/ChatGPT 域名仍走 VLESS。
- 全局：全部流量 VLESS；直连：全部流量直连。
- 原生系统 VPN 授权、通知栏控制、内核实时流量、日志和按应用绕过设置。
- 显示账号有效期；启动和连接期间验证到期状态。服务端仍须执行账号鉴权和有效期，客户端检查不替代服务端限制。
- 远程订阅缓存最多离线使用 72 小时；收到 401/403/404/410 时使缓存失效并断开当前账号。
- 订阅刷新只在实际网络配置变化时重连；仅时间戳/有效期/显示信息变化不重连。
- 导入深链：`v2tt://import-remote-profile?url=<URL编码后的HTTPS订阅>&name=<名称>`。

## 隐私边界

订阅链接等同账号凭证。配置只保存在 Android 应用私有目录中，关闭云备份和设备迁移备份。
没有额外的应用层密码加密；依赖 Android 应用沙箱和设备加密。导出/分享订阅会主动暴露账号凭证。
本版本不包含遥测或内置真实服务器账号。上游 APK 自动更新入口已禁用，不能以官方 SFA 包覆盖升级。

## 构建

在本仓库的 `android` 目录执行构建。内核源码如需重编译，放在仓库根目录的 `v2tt-android-core`。
工具链默认安装在 `%LOCALAPPDATA%\V2TT-Toolchains\android`，可用 `V2TT_TOOLCHAIN_ROOT` 指定其他目录，不修改系统 Java/Go 环境或当前 Windows 代理。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap-android.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
# 内核未改动时：
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1 -SkipCore
```

测试版 APK 使用本机 Android debug 签名，仅用于安装验收；不等于正式发行签名。
源码包含本次编译的 libbox，可在工具链准备好后运行 `scripts/build-android.ps1 -SkipCore`。需要重编译内核时，请将官方 sing-box 仓库克隆到仓库根目录的 `v2tt-android-core` 并检出下文固定提交，再运行不带 `-SkipCore` 的构建命令。固定内核源码归档位于 `vendor`。
正式发布前需要独立长期保存的签名密钥，不得使用仓库中继承的上游公开 keystore。
构建 release 时需通过本地构建属性指定自己的密钥文件，不能提交密码到代码仓库。

## 固定上游

- Android 客户端：`aed2b6ea126e627fca2c6189a944000dcf5315b5`。
- sing-box 1.13.19：`b5ebaa1fc0f2b94256180b95468e73ef53caa27d`。
- gomobile/gobind：SagerNet `v0.1.12`，Go `1.25.12`，NDK r28。
- libbox 由源码构建；启用 gVisor、QUIC、WireGuard、uTLS 和 Clash API，不包含 Naive/Tailscale。
- 国内分流数据复制自现有 Windows 客户端；版本哈希见 `docs/PROVENANCE.md`。

界面基于 Android Compose，不使用 WebView/Electron。现阶段并未移植 Windows 的逐应用「日常/游戏」出口分配界面；Android 设置中可选择代理/绕过应用。

## 授权与分发

本项目及 sing-box 核心遵循原项目许可证。保留 `LICENSE`、`UPSTREAM.md` 和第三方许可证。
向他人分发 APK 时，应同时提供本项目修改后的对应源码、固定内核源码及构建脚本。
不要把仅有上游链接的网页当成修改版的完整源码交付。当前没有自动发布、上传商店或对外发送。

---

以下保留上游声明；上游项目介绍另见 `UPSTREAM.md`。

# SFA (upstream)

Experimental Android client for sing-box, the universal proxy platform.

## Documentation

https://sing-box.sagernet.org/installation/clients/sfa/

## License

```
Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.

In addition, no derivative work may use the name or imply association
with this application without prior consent.
```

Under the license, that forks of the app are not allowed to be listed on F-Droid or other app stores
under the original name.

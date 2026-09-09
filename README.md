# V2TT Client

Windows 与 Android 原生代理客户端，使用同一份 V2TT 专属 JSON 订阅，提供 VLESS 日常线路、TUIC 低延迟线路和国内直连分流。

本仓库是脱敏后的独立发布快照，不包含真实订阅、服务器地址、账号、SSH 密钥、证书私钥或个人客户端设置。示例使用保留域名 `example.com`，不能直接连接真实服务。

## 下载与使用

安装包位于本仓库的 [Releases](https://github.com/wangzun233/V2TT/releases)。私有仓库需要获授权的 GitHub 账号才能下载；不要为了分发而共享 GitHub 密码。

| 平台 | 本次版本 | 文件 | 说明 |
| --- | --- | --- | --- |
| Windows 10/11 x64 | 0.2.1 脱敏重打包 | `V2TT-Client-Setup-0.2.1-Windows-x64.exe` | 安装程序，无数字签名 |
| Android 8.0+ ARM64 | 0.1.0 Preview | `V2TT-Android-0.1.0-arm64-preview.apk` | Debug 签名，已收到用户手机联网正常的反馈 |

安装后自行导入管理员通过私密渠道发放的 **V2TT Client 专属 HTTPS JSON 订阅**。不是 Clash YAML、Hiddify 订阅或单节点分享链接。安装包不提供账号，不保证任何地区、运营商或目标网站可用。

- [Windows 安装、托盘、自启、升级和排障](docs/WINDOWS.md)
- [Android 安装、VPN 授权和排障](docs/ANDROID.md)
- [订阅格式与账号有效期](docs/SUBSCRIPTION.md)
- [脱敏服务器配置和部署说明](server/README.md)
- [构建说明](docs/BUILD.md)
- [隐私边界与发布检查](docs/PRIVACY.md)
- [测试结果及已知限制](docs/VALIDATION.md)

## 模式

| 模式 | 主要行为 |
| --- | --- |
| 智能 | 国内与本地网络直连，其他流量走 VLESS |
| 极速 | 国内直连，其他流量主要走 TUIC；OpenAI/ChatGPT 相关域名仍走 VLESS |
| 全局 | 捕获的流量走 VLESS |
| 直连 | Windows 停止代理内核并恢复系统网络；Android 保留 VPN 服务但使用直连出口 |

Windows 支持应用出口规则，规则会影响分流优先级；Android 当前提供应用代理/绕过选择，不是逐应用日常/游戏出口编辑器。国内规则是固定快照，不保证覆盖每一个国内服务。

## 目录

```text
windows/   Windows Electron + React 客户端源码与依赖锁文件
android/   Android Compose + libbox 客户端源码
server/    兼容配置模板，不是线上服务器备份
docs/      中文使用、构建、隐私和验收说明
scripts/   本地发布检查
vendor/    固定内核源码归档和可编辑国内规则数据
```

不包含原来的私人管理后台、用户数据库或流量记录。服务器模板说明如何对接同一种订阅，但不宣称完整复刻商业管理面板或月流量计费系统。

## 来源与许可证

Android 基于 [sing-box for Android](https://github.com/SagerNet/sing-box-for-android)，内核为 [sing-box](https://github.com/SagerNet/sing-box) 1.13.19。本项目不是 SagerNet、Cloudflare 或 OpenAI 官方产品。

保留各组件的许可证；Android 的许可证见 `android/LICENSE`，其他组件说明见 `windows/docs/THIRD-PARTY-NOTICES.md`。根目录 `LICENSE` 保留 GPLv3 文本，不替换第三方组件自己的授权条款。分发二进制时需同时提供对应源码及许可证。未建立正式签名和自动更新服务，本次按预发布交付。

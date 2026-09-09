# 本次上传前检查

日期：2026-09-09。目标为私有仓库 `wangzun233/V2TT`，不上传原工程历史。

| 项目 | 实际结果 |
| --- | --- |
| Windows 构建及前端检查 | 通过 |
| Windows Vitest | 5 项通过 |
| Windows 原生测试 | 9 项通过 |
| Windows Playwright UI/Electron | 9 项通过 |
| Windows 安装程序重打包 | 完成，默认节点改为示例域名 |
| Windows 包结构、核心资源、权限与 Electron fuses | 通过 |
| Android JVM 测试 | 19 项通过，含服务器订阅示例的四模式兼容测试 |
| Android APK 签名 | APK v2 校验通过，仍为 Debug 签名 |
| 服务端示例 | sing-box 1.13.19 check 通过，使用临时测试证书，不含生产证书 |
| 示例订阅与 PC | 4 模式 × 2 IPv6 设置均通过核心配置校验 |
| Caddy 模板 | Caddy 2.11.4 validate 通过；校验工具按官方 SHA512 清单核对 |
| 源码隐私检查 | 通用规则与本地私密标记扫描通过；未上传私密标记清单 |
| 解包审查 | Android APK/AAR、Windows ASAR/应用目录及内核源码归档，未发现本地私密标记 |

安装包 SHA256：

```text
a36a74af2d9feb94756550f85fe14f0bf964b223f3fd3967ebe51801b6074e5d  V2TT-Client-Setup-0.2.1-Windows-x64.exe
b8d897b1c4064c606db0400ee1200041db7a9d0c84801b089c16a845755809c5  V2TT-Android-0.1.0-arm64-preview.apk
```

Android APK 沿用用户已在手机测试的包，没有因为上传 GitHub 更改连接逻辑。用户确认手机连接正常，不代表所有系统、运营商和长时间运行条件都已验收。

保留的限制：Android 完整 Lint 尚未全部通过，Windows 无正式数字签名，实际服务器模板没有部署。发布快照脱敏与测试不等同于全面安全审计或无条件稳定保证。

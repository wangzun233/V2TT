# sing-box 1.14.0 升级验收

日期：2026-09-11。Windows 客户端版本 0.2.2，Android 版本 0.1.1（versionCode 2）。

## 变更

- 两端内核从 1.13.19 升至 1.14.0，VLESS / WebSocket / TLS 和 TUIC 保留，未改动线上服务器。
- Windows 移除未使用的旧式 block 出口，保留 reject 规则；国内直连及各模式分流逻辑不变。
- Android 适配 DNS 地址列表、系统证书 JNI、日志初始化和命令回调。未启用新内核的宿主 Shell、SSH agent、SFTP 或网桥权限。
- 新增固定源码校验构建脚本，保留旧源码归档和旧安装包用于追溯及回退。

## 来源与校验

上游：[sing-box v1.14.0](https://github.com/SagerNet/sing-box/releases/tag/v1.14.0)。
源码提交：`0b8995879f29a9b98ee027bc17b75e101445b238`。

两端均由固定源码本地编译，不冒充官方预编译发行包。Windows 官方 ZIP 下载超时，改用 GitHub API 获取指定提交源码，未关闭 TLS 校验。

| 文件 | SHA256 |
| --- | --- |
| vendor/sing-box-0b89958.tar.gz | 6d64f6555b5aa79691f7cf7ecff7d6cbda0ad6841f3e32dc7c85a8fd28b87d69 |
| windows/resources/bin/sing-box.exe | 3ee79756bc0d04cfaf78136dd00ecda174ea0a4062eeb872b5a1a2eefc2a299b |
| android/app/libs/libbox.aar | 6586f080128bcbc7994a0c9f66548b34084a515163b387ac0c059accfde4f320 |
| V2TT-Client-Setup-0.2.2-Windows-x64.exe | 47d64bc1959e9070a025dd1c8a6c7140eb9d8c79b1aac82723b2a073fe0f2999 |
| V2TT-Android-0.1.1-arm64-v8a-debug.apk | a416e89c5aaa2de48cdb96c73ed02d525f8ceeeec18c64057c6126f3df791d55 |

## 已验证

- Windows：构建、lint、6 项配置测试、9 项原生测试、9 项界面测试通过。
- Windows 打包后：3 项 ASAR 启动/托盘/订阅测试通过；资源哈希、版本、完整性设置及安装包内容检查通过。未执行提权安装程序。
- Windows 固定源码构建脚本重新编译后的核心哈希一致。
- Android：19 项 JVM 测试重新执行通过；5 项 API 35 x86_64 模拟器测试通过，包括实际 libbox 版本和全部模式配置校验。
- Android：模拟器先安装 0.1.0，再覆盖安装 0.1.1 成功，签名兼容；使用虚构本地配置成功启动和停止 VPN，tun0 同时具有 IPv4 和 IPv6 地址，未发现 AndroidRuntime 崩溃。
- Android：VPN 启动时域名能解析；ICMP 测试未收到回包，不将其表述为互联网连接测速通过。
- 服务端示例配置及 8 种客户端模式/IPv6 组合通过新版内核检查，没有连接生产服务器。
- 已扫描受版本控制的源文件、解包 APK、Windows ASAR 及上游源码中的私人标记，未发现个人订阅或服务凭据。

## 限制与安装

没有测试真实订阅的 VLESS/TUIC 握手、国内外网络路由表现、长时间稳定性或速度；不承诺升级会降低延迟。Android ARM64 安装包已经构建，但本轮设备端运行测试使用 x86_64 模拟器，仍需手机实测。

Windows 安装包未配置正式代码签名；Android 包仍为沿用本地调试签名的预览包。上游 Android 构建工具的兼容警告及先前记录的全量 lint 遗留问题未在本次升级中消除，不将其称为无警告正式版。

安装前退出客户端后覆盖安装，不要勾选清除个人数据；Android 选择更新而不是卸载重装。保留原有订阅备份。旧版 Android versionCode 较低，回退可能需要重新安装和重新导入订阅。

本次未覆盖安装当前 PC 客户端，未变更服务器、订阅或账号，也未自动发布 GitHub Release。

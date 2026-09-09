# 构建来源

Android 项目源自 https://github.com/SagerNet/sing-box-for-android ，固定提交
`aed2b6ea126e627fca2c6189a944000dcf5315b5`，本项目在其基础上修改。

内核源自 https://github.com/SagerNet/sing-box ，固定提交
`b5ebaa1fc0f2b94256180b95468e73ef53caa27d`，对应标签 `v1.13.19`。
内核源码没有修改，编译标签由 `scripts/build-android.ps1` 显式指定。

本次本地 libbox.aar SHA256：
`90cdfdb461a88bca961c1f32d237e502cca06cded954dc0ac4dbc29ec9f850fb`

规则文件来自现有 V2TT Windows 项目的 `resources/rules`，复制时校验：

| 文件 | SHA256 |
| --- | --- |
| geoip-cn.srs | 0acf5dad38fba9db2dade29ce5e4edc6902220944f30628ae46ed16cb0ec5edd |
| geosite-cn.srs | 23dc7b1af27f8f4b8d39baa046a885eb54ff93ce93cf4de8852c211513b2a7b0 |

这些规则快照没有在本次重新更新，不应表述为最新规则库。
图标直接复用现有 Windows 项目的 `build/icon.png`。

JDK、Go、SDK 和 NDK 下载均通过官方分发地址及官方元数据中的校验值核对。
本地编译后的 AAR 不是下载的官方发行二进制。

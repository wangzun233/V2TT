# V2TT 专属订阅

PC 和 Android 读取同一种 JSON，示例见 [`server/subscription.example.json`](../server/subscription.example.json)。它不是 sing-box 原始配置；客户端会校验并生成自己控制的路由。

## 必要字段

| 字段 | 要求 |
| --- | --- |
| `schema_version` | 当前为 `1` |
| `generated_at` | ISO 8601 时间字符串 |
| `profile.id` / `name` | 账号标识和显示名称，不要放邮箱或其他个人信息 |
| `profile.expires_at` | ISO 8601、含时区的到期时间；`null` 表示不限时 |
| `routing.daily_node` | 对应一个 VLESS 节点的 `id` |
| `routing.game_node` | 对应一个 TUIC 节点的 `id` |
| `nodes` | 同时包含 VLESS + WS + TLS 与 TUIC + TLS 两条所需线路 |

VLESS 需要 UUID、服务器、443 等实际端口、SNI、WS 路径和 Host。TUIC 需要独立 UUID、密码、服务器和 UDP 端口、SNI、ALPN `h3`、拥塞控制和 UDP 转发模式。字段必须和服务器一致。

仅有一条节点、纯链接/Base64、Clash YAML 和任意自定义 sing-box 配置不属于专属远程订阅契约。

## 分发安全

每个账户一个高强度随机订阅 Token，通过 HTTPS 返回 JSON。客户端不能依赖浏览器交互式验证码或登录 Cookie；Android 不自动跟随重定向，地址应直接返回 HTTP 200 JSON。

禁止把真实订阅写进仓库，包括私有仓库。响应设置 `Cache-Control: no-store`，Cloudflare 对订阅路径显式绕过缓存，不记录完整订阅 URL。管理员私下发送链接，不把真实 Token 写在教程、issue 或截图里。

示例文件中的 UUID 和密码是公开占位符，必须在服务器上生成独立随机值后替换。不要把它们用于真实服务。

## 有效期与统计

客户端会检查到期时间，并限制远程订阅离线缓存使用时间。订阅返回 401/403/404/410 时会阻止使用失效缓存；刷新失败不能等同于账号被撤销。

**客户端有效期不是服务端鉴权。** 裸 sing-box 的示例用户列表不会自动按照 `profile.expires_at` 到期。管理员必须在到期时从 VLESS/TUIC 入站移除该用户、撤销订阅、校验配置并重载/重启。否则旧凭证仍可能被其他客户端使用。

两端界面流量是当前连接状态，不是账户月流量。服务器的每账户计量需要单独的采集、持久化和重置策略；本仓库的最小模板没有实现管理面板、自动到期调度或月计费。

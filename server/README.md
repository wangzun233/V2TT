# 脱敏服务器部署参考

这是与两个客户端兼容的 **最小配置模板**，不是线上服务器配置备份。所有域名、UUID、密码、邮箱及路径占位符都必须自行替换。不要在生产服务器上未经检查覆盖现有配置。

## 拓扑与端口

```text
客户端 -> daily.example.com -> Cloudflare HTTPS/WS -> Caddy TCP 443
                                                     -> 127.0.0.1:10000 VLESS
客户端 -> game.example.com (仅 DNS) -> sing-box TUIC UDP 443
客户端 -> sub.example.com -> Cloudflare HTTPS -> Caddy 单账号 JSON 文件
```

- `daily.example.com`、`sub.example.com` 开启 Cloudflare 代理；SSL/TLS 使用 Full (strict)，源站也要有效证书。
- `game.example.com` 设为仅 DNS，不能用普通 Cloudflare HTTP CDN 代理 TUIC。需要 IPv6 时添加正确 AAAA，并先验证手机网络具备 IPv6。
- Caddy 模板关闭 HTTP/3，以免 Caddy 与 TUIC 抢占同一主机的 UDP 443。TCP 443 与 UDP 443 可以分别由两者使用。
- 防火墙开放所需的 TCP 80/443、UDP 443，并保留自己的 SSH 入口。VLESS 的 10000 仅监听回环，不对外开放。
- 管理面板不在这个模板中；部署面板时应另加登录控制或仅通过 SSH 隧道访问，不能把管理员密码放到订阅里。

**同机双协议不能隐藏全部源站信息。** 若 TUIC 域名直指与 CDN 源站相同的 IP，查询该域名就可能获得源站 IP。真正隔离应使用独立游戏服务器/IP，并结合历史 DNS、其他 DNS 记录及源站防火墙检查。CDN、协议和证书均不保证不被封锁或第三方网站一定可访问。

## 1. 准备程序与账号

在新 Linux 服务器安装 Caddy 和支持 QUIC 的 sing-box。本模板按客户端配套的 sing-box 1.13.19 校验；更换版本先阅读迁移说明再校验，不能直接认为最新配置与旧版兼容。

通过 [sing-box 官方安装说明](https://sing-box.sagernet.org/installation/) 与 [Caddy 官方安装说明](https://caddyserver.com/docs/install) 安装，核对下载来源和校验值。服务模板假定 sing-box 位于 `/usr/local/bin/sing-box`，实际位置不同需调整。

生成独立凭证，在服务器的私有终端执行，**不要把输出提交到 Git**：

```bash
umask 077
python3 -c 'import uuid,secrets; print("VLESS_UUID="+str(uuid.uuid4())); print("TUIC_UUID="+str(uuid.uuid4())); print("TUIC_PASSWORD="+secrets.token_urlsafe(32)); print("WS_PATH=/"+secrets.token_urlsafe(24)); print("SUB_TOKEN="+secrets.token_urlsafe(32))'
```

每个账号使用独立 UUID、TUIC 密码和订阅 Token。WS 路径可按实例统一，但它不能替代 UUID 鉴权。

## 2. 证书

Caddy 管理日常与订阅域名的 HTTPS。确保 ACME 验证路径不会被 Cloudflare 交互式挑战拦住。

TUIC 使用 `game.example.com` 对应的、客户端信任的公开证书，配置里的 SNI 必须匹配。可用 ACME 客户端的 DNS-01 获取并自动续期；若使用 DNS API Token，只放在服务器私有文件中，权限 `0600`，只授权必要的 DNS 区域。

将证书部署为：

```text
/etc/v2tt/tls/game/fullchain.pem
/etc/v2tt/tls/game/privkey.pem
```

让 `v2tt` 服务用户可以读取证书与私钥，但其他普通用户不可读取私钥。不要直接开放整个 ACME 私钥目录权限。续期后原子替换文件、校验配置并重启服务；重启会造成现有连接重连，应安排低峰。

不能把只受 Cloudflare 信任的 Origin CA 证书直接用于普通客户端直连的 TUIC，也不能靠关闭客户端 TLS 校验解决证书错误。

## 3. 安装配置

以管理员身份创建最小权限运行用户与配置目录；如果已存在，应检查并复用，不重复覆盖：

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin v2tt
sudo install -d -o root -g v2tt -m 0750 /etc/v2tt /etc/v2tt/tls /etc/v2tt/tls/game
```

把 `sing-box.example.json` 复制为私有的 `/etc/v2tt/sing-box.json`，替换全部示例凭证、域名与 WS 路径，文件属主 `root:v2tt`、权限 `0640`。模板拒绝代理访问私有地址，避免成为访问服务器内网的入口；特殊内网需求需单独评估，不能随意删除防护。

把修改后的 `Caddyfile.example` 放到 `/etc/caddy/Caddyfile`。把 `v2tt-sing-box.service` 放到 `/etc/systemd/system/`。替换前先备份已有配置。

```bash
sudo -u v2tt /usr/local/bin/sing-box check -c /etc/v2tt/sing-box.json
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now v2tt-sing-box
sudo systemctl reload caddy
sudo systemctl status v2tt-sing-box caddy --no-pager
sudo ss -lntup
```

这些命令假定 Caddy 已通过官方服务安装并启动。未启动时使用 `systemctl enable --now caddy`。不要在 SSH 会话中直接启用不完整防火墙规则，避免把自己锁在外面。

## 4. 单账号订阅

复制 `subscription.example.json`，将两条节点与服务器对应起来。`profile.expires_at` 为含时区的 ISO 8601 时间，或 `null`。

订阅文件存放为 `/var/lib/v2tt-subscriptions/s/<随机Token>.json`。父目录 `root:caddy`、`0750`，文件 `root:caddy`、`0640`；文件名不要使用姓名、手机号、日期或容易猜到的账号名。

通过私密渠道将 `https://sub.example.com/s/<随机Token>.json` 发给该账号用户。**这个链接是凭证，不是可以公开的下载链接。** 手机和 PC 都导入它，不需要共享管理员账号。

在 Cloudflare 缓存规则中对订阅路径 `/s/*` 明确设为绕过缓存。客户端无法完成浏览器 JS/验证码挑战，需按最小范围配置适合 API 的访问策略，而非关闭全站安全防护。源站不启用订阅访问日志，不公开目录索引；错误日志和 CDN 控制台也可能记录路径，仍需限制访问与保留期限。

本模板通过不可猜测 Token 保护静态订阅，未实现账户登录、速率限制或审计系统。要撤销账号，应同时删除该订阅文件和两个入站里的用户；只删除链接不够。

## 5. 到期与流量管理

示例是静态配置，不会自动执行到期任务，也没有后台数据库。正式账号管理必须由独立程序在到期时撤销订阅、删除 VLESS/TUIC 用户、校验后应用新配置。更新应原子写入并备份，避免新建账号覆盖其他账号的到期日期。

每月流量统计需要保存“账号标识、上行、下行、计量周期”并正确处理核心重启和计数归零。客户端的本次连接流量不能替代服务端账单。原有私人管理后台与统计数据库没有被上传。

## 6. 验收与运维

先分别验证订阅 HTTPS、日常 VLESS、游戏 TUIC，然后检查国内直连、OpenAI 相关流量、Wi-Fi/移动数据切换与锁屏。不要仅凭端口开放或延迟测试成功判定全部功能正常。

日志可能包含目标域名、IP 和账号标识。排障时仅分享脱敏片段，禁止上传完整 journal、SSH 配置、证书目录或账户库。

参考官方文档：[VLESS 入站](https://sing-box.sagernet.org/configuration/inbound/vless/)、[TUIC 入站](https://sing-box.sagernet.org/configuration/inbound/tuic/)、[Caddy 反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。本模板没有在现有生产服务器上执行。

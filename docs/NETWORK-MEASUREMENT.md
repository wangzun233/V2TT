# 延迟与速度测试

Windows：连接节点后进入「诊断 → 服务器测速」。Android：连接后在仪表盘打开「服务器测速」。升级后先断开并重新连接一次，让新的测速入口生效。

选择直连、VLESS 或 TUIC，再点击「测延迟」或「测速度」。速度测试需要确认，每个方向最多传输 128 MiB 应用数据，可随时停止。测试不修改正常上网的分流模式。数值使用 Mbps，不是 MB/s；除以 8 可换算成 MB/s。

这是本机到服务器、经过所选线路的实测表现，不是保证带宽。手机端尚需在自己的 Wi-Fi 或移动网络下实测，模拟器结果不能代表手机网络。

## Technical details

Windows: Diagnostics > Server measurement. Android: connect a V2TT profile,
then open Server measurement on the dashboard. Both clients require a running
core with the measurement inbounds; reconnect once after upgrading.

Choose direct, VLESS, or TUIC. This selection applies only to the test and does
not change normal application routing. Direct tests bypass the proxy outbound;
VLESS and TUIC tests traverse their respective tunnels. TUIC throughput uses
HTTPS over TUIC, not a raw UDP game benchmark.

Latency is the median of five HTTPS requests to your own server. The first
request includes connection establishment. Jitter is mean absolute difference
between successive successful requests, and failures are HTTP request failures,
not an ICMP packet-loss measurement.

Speed tests use four concurrent transfers for up to approximately ten seconds
per direction, bounded to 128 MiB of application payload per direction. Protocol
overhead and interrupted/unconfirmed uploads can make billed traffic differ
from the confirmed payload displayed. Downloads stream into memory buffers and
uploads are discarded by the server, never saved to disk. Upload results count
only bytes acknowledged by the server. Mbps means megabits per second; divide
by eight for MB/s. Peaks use approximately one-second samples. If the payload
cap is reached in under one second, a one-second peak is unavailable.

Results describe this device, network, route and server at that moment. They
are not a guaranteed maximum line rate. Other users, CPU limits, congestion,
CDN paths and Wi-Fi can change the result. Stop other large transfers when
comparing routes. Testing requires manual confirmation and is never automatic.

## Server deployment

Source: `server/measurement/main.go` (Go standard library only). Build for the
server architecture, install the executable at `/usr/local/lib/v2tt-measure`
with mode 0755, and install the provided systemd unit. The service binds only
to `127.0.0.1:41917`. It requires read access to the active sing-box JSON config
through the `sing-box` supplementary group. Adapt this group if your deployment
uses a different service group; never make credential files world-readable.

Include `nginx-location.conf` inside the existing HTTPS vhost corresponding
to the daily node's TLS server name. Back up the vhost, run `nginx -t`, then
reload Nginx gracefully. Enable and start only `v2tt-measure`; a sing-box restart
is unnecessary. The TLS certificate must be publicly trusted. The TUIC server
address must reach this same HTTPS origin on TCP 443. Independent daily/game
servers need an explicit endpoint design before using this implementation.

Endpoints under `/_v2tt/measure/v1/`:
- `GET ping`: 204.
- `GET download`: 16 MiB uncompressed payload.
- `POST upload`: fixed Content-Length, at most 16 MiB, JSON received byte count.

Every request requires a Bearer token matching an active inbound user UUID.
Auth cache lasts at most five seconds. Responses must carry `X-V2TT-Measure: 1`.
The service rejects unauthenticated requests, limits concurrent requests to
eight and applies request deadlines. Nginx disables response caching, gzip,
request buffering and access logs for this location. Do not publish tokens.

Client measurement proxies bind to loopback and use random per-connection
credentials and ports. Android uses a scoped `override_address` rule to route
the measurement HTTPS host to the origin, retaining normal TLS verification.
See the [sing-box route action documentation](https://sing-box.sagernet.org/configuration/route/rule_action/).

Rollback: remove the Nginx measurement include after backing up and validating
the configuration, reload Nginx, then stop and disable `v2tt-measure`. Existing
proxy and subscription services are independent of this measurement service.

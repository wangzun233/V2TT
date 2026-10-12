# Windows 0.2.8-rc.2

Windows prerelease; not published to the stable update feed.

- Add TCP mode with a subscription-provided VLESS TCP TLS endpoint.
- Domestic rules retain direct routing. In TCP mode, proxy application rules use TCP instead of TUIC; explicit direct rules remain direct. This is not a native UDP gaming mode.
- Preserve the two legacy nodes. An optional top-level `tcp_node` uses the VLESS fields with `role: "tcp"` and `transport: { "type": "tcp" }`. Legacy clients ignore the extension; subscriptions without it cannot select TCP mode.
- Add a separate authenticated diagnostic port, line test, and TCP-aware OpenAI diagnostic routing. No endpoint credentials are bundled.
- Handle restored TCP mode before subscription loading without crashing the configuration preview.
- Retain the bounded health-recovery changes from rc.1. These are not a claim to fix upstream UDP restrictions.

## Usage

Install this Windows candidate, update the existing V2TT subscription, then select TCP on the connection screen. Keep other VPN clients disconnected before connecting V2TT. Installation or switching the active client can interrupt networking.

## Verification

- 21 configuration tests, 30 native tests, 13 Playwright tests passed.
- TCP configuration passes the bundled sing-box checker with IPv4 and IPv6 settings.
- Minimum-window TCP screenshot and delayed-subscription startup verified; the focused UI test was repeated after final label changes.
- Actual extended subscription fetched over HTTPS and validated without printing credentials.
- Elevated installation, active TUN operation, authenticated Codex sessions and long-duration stability have not been verified for this candidate.
- Existing throughput measurement choices remain unchanged; TCP has its own HTTP latency test on the Lines screen.

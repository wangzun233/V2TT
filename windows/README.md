# V2TT Client 0.2.1

0.2.1 is a blank-window compatibility patch: software UI rendering replaces the forced in-process GPU mode, a static startup screen survives a failed app bundle, renderer/preload failures are logged, and the tray can reload the interface without reconnecting the proxy. The exact cause of the reported elevated white window remains unconfirmed; the elevated diagnostic launch was canceled. Normal-resource, migrated-account and failure-recovery tests do not replace acceptance of the elevated installed app.

Windows client for a V2TT dedicated subscription: one VLESS + WebSocket + TLS daily route and one TUIC game route. No subscriber credentials are embedded in the installer.

## Install on another computer

1. Use Windows 10/11 x64. ARM64 and older Windows have not been validated.
2. Run `V2TT-Client-Setup-0.2.1-Windows-x64.exe`, approve elevation, and complete the installation wizard.
3. Launch the installed desktop or Start menu shortcut. Approve elevation for TUN networking.
4. Import that user's **V2TT Client dedicated HTTPS subscription**. Generic Clash YAML, Hiddify links and standalone node URLs are not accepted.
5. Select a mode and connect. Do not run another TUN/VPN client at the same time.
6. Enable startup in Settings if needed. The app creates a highest-privilege task for the current Windows account, launching to the tray ten seconds after sign-in. Auto-connect is a separate setting.

Electron, the core, and local China routing rules are bundled. Node.js, Python and WebView2 are not required on the target computer. Copying only the unpacked application EXE is not supported.

The release is **not code-signed**. Windows or security software may warn about an unknown publisher. There is no automatic update service. Do not disable antivirus or certificate validation to make it work.

## Modes

| Mode | Behavior |
| --- | --- |
| Smart | Application rules first; China/local traffic direct; remaining traffic VLESS. Foreign web UDP/443 is dropped to allow TCP fallback. |
| Fast | OpenAI domains/protected processes VLESS; application rules next; China/local traffic direct; remaining traffic TUIC. |
| Global | Captured traffic VLESS, with web UDP/443 dropped for TCP fallback. |
| Direct | Stops the core and restores ordinary system networking. No proxy traffic is counted. |

Application rules override China bypass in Smart/Fast. Protected OpenAI traffic takes precedence in Fast mode. Changing an active route or network setting briefly restarts the core; existing connections may reconnect.

## Upgrades and removal

- The normal distribution is the Setup installer. Portable/ZIP builds are optional troubleshooting formats.
- Close the old app from its tray before upgrading. This intentionally disconnects its proxy.
- Settings and encrypted subscriptions remain at `%APPDATA%\v2tt-client\runtime`. Version 0.2.0 migrates the earlier matching `subscription.bin`/`manifest.bin` pair to `account.bin`.
- A corrupt/undecryptable account produces an import error, not a crash. Import a fresh dedicated subscription to recover.
- Encryption is bound to the local Windows account. Do not copy another computer's account cache.
- After moving from portable to installed, enable startup again if the old task still points to the portable EXE. In-place installed upgrades preserve the task.
- Uninstall through Windows Settings. Startup is removed only if it points to this installation. User data is retained for reinstallation.
- To permanently remove credentials, remove the subscription inside Settings before uninstalling, or delete your own `%APPDATA%\v2tt-client` after all client processes exit.

## Reliability and diagnostics

- Native code owns the connection lifecycle. Reloading the interface does not start a second core.
- Connection, account and setting changes are serialized. Invalid replacement subscriptions leave the existing account intact.
- HTTPS subscriptions are capped at 256 KiB, schema-checked and atomically encrypted with Electron safeStorage.
- Offline cache lasts at most 72 hours and never past account expiry. HTTP 401/403/404/410 and expired refreshed accounts block cached reconnects until a valid refresh.
- Traffic comes from the native core. Rates use elapsed time, not generated graph data. Totals describe this connection, not monthly server billing.
- Node tests make actual HTTP requests through each respective outbound. HTTP round-trip latency is not ICMP or game latency.
- ChatGPT and API tests are independent. An unauthenticated API HTTP 401 proves TLS/API reachability only, not a logged-in Codex session.
- Exit stops only the owned core. A separate watcher also closes it if the main process dies. Cleanup cannot run during power loss.
- Crash recovery retries at most three times. Sleep/resume reconnects only if previously connected.
- Logs rotate at approximately 1 MiB. Reports exclude account credentials and redact common URLs, UUIDs and IPv4 addresses. Inspect reports before sharing; OS paths and other context may remain.

For startup failures, inspect `%APPDATA%\v2tt-client\runtime\startup.log` and security-software quarantine records. The top-right export button creates a diagnostic JSON report.

## Architecture and build

React/TypeScript renders the UI. Electron uses sandboxed, context-isolated, allowlisted IPC. The renderer cannot submit arbitrary native configuration. Loopback controllers/probes use random ports and authentication secrets. Plaintext runtime configuration is removed after startup and on normal cleanup.

Use the lockfile on Windows with Node.js/npm; first-time dependency and installer-tool downloads require network access:

```powershell
npm ci
npm run build
npm run lint
npm test
npm run test:native
npx playwright install chromium
npm run test:e2e
npm run dist:win
```

Playwright starts the built preview on port 41921 unless V2TT_TEST_URL is set. Native tests use isolated temporary data. Fixture accounts do not validate real server availability or alter the existing live TUN.

The browser preview is a disconnected UI sandbox and cannot start a proxy or run network diagnostics. Run `npm run desktop` for native development. Scheduled startup is available only in packaged builds.

See `docs/THIRD-PARTY-NOTICES.md` for bundled attribution and `docs/RELEASE-CHECKLIST.md` for verification scope. Code signing, automated updates, clean-machine/second-PC acceptance, and long-running network tests are separate release gates.

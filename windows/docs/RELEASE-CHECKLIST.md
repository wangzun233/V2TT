# 0.2.0 Release Verification

Verified on the build computer on 2026-09-06. This is an installable release candidate, not a claim of cross-machine production certification.

## Completed

| Check | Observed result |
| --- | --- |
| TypeScript and production build | Passed |
| Frontend lint | Passed |
| Vitest routing tests | 5 passed |
| Native validation/lifecycle tests | 9 passed |
| Playwright UI and Electron workflows | 7 passed |
| Packaged ASAR workflows through development Electron | 3 passed |
| Real sing-box configuration validation | All 4 modes x 2 IPv6 settings passed |
| Real core lifecycle without TUN | Start, API authentication, traffic read, normal stop, unexpected exit passed |
| Watchdog ownership test | Designated child stopped after owner death; unrelated process retained |
| NSIS installer build | Completed |
| Packaged dependencies | Required code, core, routing files, license texts and unpacked watchdog present |
| Package hashes and production fuses | Passed; report in release/package-verification.json |
| Runtime dependency audit | npm audit --omit=dev: 0 reported vulnerabilities |
| Installer signature | NotSigned, confirmed with Get-AuthenticodeSignature |
| Existing connection | The existing client remained running during isolated tests |

The 21 main automated tests and 3 packaged-resource reruns are separate counts. Passing static configuration validation does not prove real route reachability.

## Fixed during this pass

- Added an assisted, per-machine installer with desktop/Start menu shortcuts and uninstall support.
- Preserved encrypted account and preference migration; kept personal data outside the installer.
- Centralized native connection ownership and serialized mutating actions.
- Persisted application rules and applied active route settings with rollback attempts.
- Replaced synthetic latency, traffic and diagnostics with native measurements or explicit untested states.
- Blocked revoked/expired account caches; bounded downloads and offline-cache age.
- Limited privileged IPC inputs; randomized authenticated local controllers/probes; hid node credentials from renderer metadata.
- Added encrypted atomic account storage, temporary configuration cleanup, rotating redacted logs and report export.
- Added bounded crash recovery, sleep/resume reconnect and an owned-process cleanup watcher.
- Disabled production Node environment injection, RunAsNode and main-process debugging; enabled ASAR-only loading/integrity checking.
- Fixed a silent-launch shutdown hang caused by showing a load-failure dialog during intentional quit.

## Unfinished external acceptance gates

- The elevated production EXE could not be launched by the non-administrator automation host: Windows returned EACCES before app startup. Production fuses now also intentionally disable the debugger needed by Playwright. Packaged-resource testing used a development Electron host; it is not equivalent to testing elevation, the full installer or hardened executable on another PC.
- Do a clean install, desktop launch, startup-task round trip, upgrade and uninstall on a separate Windows 10/11 x64 computer. ARM64 is unverified.
- Import a real dedicated subscription and test Smart/Fast/Global routes, games, sleep/resume and extended operation on that computer. This pass deliberately did not change the build machine's active TUN.
- Code signing is not configured. SmartScreen or security software can still warn or block an unsigned build. No clean-install/antivirus compatibility guarantee is made.
- An authenticated automatic-update service and public distribution endpoint are not configured. Upgrades use the installer manually.
- The existing core's reported revision was resolved to the official source repository, but a fresh official Windows ZIP download stalled. Byte-for-byte official archive verification remains incomplete; see dependency-provenance.json.

No external publishing, paid certificate purchase, server changes or replacement of the user's running client were performed.

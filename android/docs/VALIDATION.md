# Android 0.1.0 preview validation

Date: 2026-09-09. This is an installable debug-signed preview, not a production release.

## Passed

- Gradle assembleOtherDebug and assembleOtherDebugAndroidTest completed successfully.
- 18 JVM manifest tests passed (four routing modes, validation, expiry and metadata-only refresh).
- Android API 35 x86_64 emulator: APK installation and in-place upgrade succeeded.
- Five instrumentation tests passed against the final APK: native libbox 1.13.19 configuration checks, atomic cache and mode persistence, revoked cache rejection, stale cache rejection, isolated profile setup and VPN service selection.
- Main activity rendered in English and Simplified Chinese without a blank screen or observed AndroidRuntime crash.
- Notification and system VPN permission prompts appeared. After authorization, the foreground VPN service started and tun0 had IPv4 and IPv6 addresses with MTU 1400.
- ARM64 APK package identity, minimum API 26, native ABI and APK v2 signature verified.
- No real account is bundled. The example fixture exists only in the separate instrumentation test APK.

## Not passed or not tested

- Lint: 68 errors, 240 warnings and five hints remain. Errors comprise 44 Compose resource-read findings, 20 missing translations, two privileged broadcast permission findings and two API 37 private API findings. The raw report is in app/build/reports/lint-results-otherDebug.html. Lint was not disabled or baselined to hide these findings.
- A missing notification permission check was fixed; the upstream first-launch update prompt was removed for this application ID.
- A host-to-emulator synthetic transfer attempt timed out. An established TUN interface is not proof of successful traffic forwarding. Traffic counters are wired to native status, but changing counters were not demonstrated by this test.
- No real V2TT subscription was downloaded; no actual VLESS/TUIC server handshake, ChatGPT access, China bypass correctness, performance or long-running reconnection was verified.
- ARM64 physical hardware, Android 8 and Android 17 were not run. API 35 x86_64 was the only running Android test environment.
- AGP 9.0.1 reports that compile SDK 37.1 is newer than its tested range.
- Debug signing is not a permanent production signing identity. Do not distribute this preview as a stable release.

## Release gates

Resolve the remaining lint findings and inherited advanced features; test a real account on ARM64 hardware over Wi-Fi and mobile data, including screen-off, network switching, account expiry and subscription refresh. Verify China bypass, OpenAI over VLESS, TUIC throughput, real counters and DNS behavior. Establish a privately held release signing key before general distribution.

## Test evidence

- manifest-tests/build/test-results/test/TEST-DeviceManifestTest.xml
- app/src/androidTest/java/io/nekohasekai/sfa/v2tt/ClientSmokeTest.kt
- artifacts/dashboard.png and artifacts/connected.png (isolated fake local profile, not a server connection)

The user's Windows proxy and server configuration were not modified by these Android tests.

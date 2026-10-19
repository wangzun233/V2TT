# Windows 0.2.8-rc.3

Local candidate; not published or enabled in the stable update feed.

## Changes

- Sanitize structured logs and exported reports, including nested JSON, historical JSONL records, authorization headers, proxy URIs, encoded proxy URIs and user filesystem paths. Sanitize old log contents before truncating them for export.
- Do not blanket-mask arbitrary Base64 strings or hashes. Credentials are masked based on known fields and formats; unrelated encoding formats are not guaranteed to be detected. Previously written logs are not deleted or rewritten.
- Poll status every second while visible and every ten seconds while hidden. Hidden polling does not append chart points. Visibility restoration refreshes promptly without overlapping requests. Core health monitoring remains independent.
- Reset stale health-failure streaks after gaps longer than 90 seconds or backwards clock changes. Preserve existing recovery limits and game-mode protection.
- Add Windows CI for build, configuration/native/UI tests and package verification. Read-only repository permissions; no private subscription, production server access, release creation or automatic publishing.

## Scope

Network recovery tests simulate sleep gaps and DNS failure/recovery. They are not real hotspot-switching tests and do not establish that company-network UDP issues are fixed.

Large component refactors, CJS-to-ESM migration and automatic protocol switching remain out of scope. Installation and live TUN behavior must be verified separately. CI cannot run on GitHub until the workflow is pushed.

CI setup follows the [GitHub Node.js workflow guide](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) and uses minimal token permissions.

## Local verification

- 23 configuration/polling tests, 36 native tests and 13 Playwright tests passed (72 total).
- TypeScript build and frontend lint passed. Workflow YAML and read-only/no-publish assertions passed locally; GitHub execution remains unverified.
- Package text scan matched bundled application code to local sources and found none of the known private endpoint/credential markers.
- Initial packaging failed during icon conversion with Node allocation errors; retry reused the previously generated icon without changing application behavior.

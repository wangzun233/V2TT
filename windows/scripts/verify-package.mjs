import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { extractFile, listPackage } from '@electron/asar'
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses'

const packaged = path.resolve('release/win-unpacked')
const asar = path.join(packaged, 'resources/app.asar')
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const files = listPackage(asar).map((file) => file.replaceAll('\\', '/').replace(/^\//, ''))
for (const file of ['dist/index.html', 'dist/startup.js', 'electron/main.cjs', 'electron/preload.cjs', 'electron/runtime.cjs',
  'electron/state.cjs', 'electron/network.cjs', 'electron/startup.cjs', 'electron/generated/config.cjs',
  'docs/THIRD-PARTY-NOTICES.md', 'LICENSES/sing-box.txt', 'LICENSES/sing-geoip.txt', 'LICENSES/sing-geosite.txt', 'LICENSES/GPL-3.0.txt', 'LICENSES/npm/index.json']) {
  assert.ok(files.includes(file), `Missing packaged file: ${file}`)
}
assert.ok(!files.some((file) => /(?:^|\/)(?:account\.bin|subscription\.bin|manifest\.bin|preferences\.json|\.env)$/.test(file)), 'User data must not be packaged')
const metadata = JSON.parse(extractFile(asar, 'package.json'))
const project = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(metadata.version, project.version)
const resources = {}
for (const file of ['bin/sing-box.exe', 'rules/geoip-cn.srs', 'rules/geosite-cn.srs']) {
  const actual = path.join(packaged, 'resources', file)
  assert.equal(hash(actual), hash(path.join('resources', file)), `Bundled resource mismatch: ${file}`)
  resources[file] = hash(actual)
}
const watchdog = path.join(packaged, 'resources/app.asar.unpacked/electron/watchdog.ps1')
assert.equal(hash(watchdog), hash('electron/watchdog.ps1'))
assert.ok(existsSync(path.join(packaged, 'LICENSES.chromium.html')))
const exe = path.join(packaged, 'V2TT Client.exe')
const manifest = readFileSync(exe).toString('utf8')
assert.match(manifest, /requestedExecutionLevel[^>]*requireAdministrator/)
const fuses = await getCurrentFuseWire(exe)
for (const key of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments']) assert.equal(fuses[FuseV1Options[key]], 48, `${key} must be disabled`)
for (const key of ['EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar']) assert.equal(fuses[FuseV1Options[key]], 49, `${key} must be enabled`)
const installer = `release/V2TT-Client-Setup-${project.version}-Windows-x64.exe`
assert.ok(existsSync(installer))
const report = { version: project.version, verifiedAt: new Date().toISOString(), installer: { file: path.basename(installer), sha256: hash(installer) }, resources,
  packagedFiles: files.length, checks: ['required files', 'no named account caches', 'resource hashes', 'watchdog unpacked', 'version', 'elevation manifest', 'production fuses'],
  limitations: ['Does not execute the elevated installer', 'Does not validate a real server connection', 'Does not verify code signing'] }
writeFileSync('release/package-verification.json', JSON.stringify(report, null, 2) + '\n')
writeFileSync('release/SHA256SUMS.txt', `${report.installer.sha256}  ${report.installer.file}\n`)
console.log(JSON.stringify(report, null, 2))

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { buildSingBoxConfig } = require('../../electron/generated/config.cjs')
const { DEFAULT_SETTINGS, validateManifest, validateSubscriptionUrl, validateRules, assertActive, publicManifest, createQueue, readBounded } = require('../../electron/state.cjs')

const { manifest } = require('./fixture.cjs')

test('manifest normalization rejects malformed routing and TLS and removes injected options', () => {
  const candidate = structuredClone(manifest)
  candidate.nodes[0].tls.insecure = true
  candidate.nodes[0].extra = { arbitrary: true }
  const result = validateManifest(candidate)
  assert.equal(result.nodes[0].tls.insecure, undefined)
  assert.equal(result.nodes[0].extra, undefined)
  candidate.routing.game_node = 'daily'
  assert.throws(() => validateManifest(candidate), /引用/)
  candidate.routing.game_node = 'game'
  candidate.nodes[0].tls.enabled = false
  assert.throws(() => validateManifest(candidate), /TLS/)
})

test('expiration and subscription credentials cannot be bypassed through cache or URL syntax', () => {
  const candidate = structuredClone(manifest)
  candidate.profile.expires_at = '2026-01-01T00:00:00Z'
  assert.throws(() => assertActive(candidate, Date.parse('2026-02-01')), /到期/)
  assert.doesNotThrow(() => assertActive(manifest))
  assert.throws(() => validateSubscriptionUrl('http://example.com/account'), /HTTPS/)
  assert.throws(() => validateSubscriptionUrl('https://user:secret@example.com/account'), /凭据/)
})

test('renderer metadata contains no subscription node credentials', () => {
  const publicValue = JSON.stringify(publicManifest(manifest))
  for (const value of [manifest.nodes[0].uuid, manifest.nodes[1].password, manifest.nodes[0].transport.path]) assert.equal(publicValue.includes(value), false)
})

test('rules reject duplicate processes and filesystem paths', () => {
  assert.equal(validateRules(DEFAULT_SETTINGS.appRules).length, 2)
  assert.throws(() => validateRules([DEFAULT_SETTINGS.appRules[0], { ...DEFAULT_SETTINGS.appRules[0], id: 'different' }]), /重复/)
  assert.throws(() => validateRules([{ ...DEFAULT_SETTINGS.appRules[0], executable: '..\\bad.exe' }]), /文件名/)
})

test('operation queue serializes connection changes and recovers after rejection', async () => {
  const queue = createQueue()
  const events = []
  const first = queue(async () => { events.push(1); await new Promise((r) => setTimeout(r, 15)); events.push(2); throw new Error('expected') })
  const second = queue(() => events.push(3))
  await assert.rejects(first)
  await second
  assert.deepEqual(events, [1, 2, 3])
})

test('streamed subscriptions are bounded without trusting content-length', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(300000)); controller.close() } }))
  await assert.rejects(readBounded(response), /过大/)
  assert.equal(await readBounded(new Response('{"ok":true}')), '{"ok":true}')
})

test('all routing modes and IPv6 choices pass the bundled sing-box validator', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'v2tt-config-test-'))
  try {
    for (const mode of ['smart', 'fast', 'global', 'direct']) {
      for (const ipv6 of [false, true]) {
        const config = buildSingBoxConfig(manifest, { ...DEFAULT_SETTINGS, mode, ipv6, ruleSetDirectory: path.resolve('resources/rules') })
        // Use the same authenticated mixed inbound shape as live diagnostics.
        config.inbounds.push({ type: 'mixed', tag: 'probe-daily', listen: '127.0.0.1', listen_port: 45679, users: [{ username: 'probe', password: 'test' }] })
        config.route.rules.unshift({ inbound: ['probe-daily'], outbound: 'daily-vless' })
        const file = path.join(directory, `${mode}-${ipv6}.json`)
        fs.writeFileSync(file, JSON.stringify(config))
        const result = spawnSync(path.resolve('resources/bin/sing-box.exe'), ['check', '-c', file], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
        assert.equal(result.status, 0, `${mode}/${ipv6}: ${result.stderr}`)
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

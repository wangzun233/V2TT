const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { validateManifest, publicManifest, DEFAULT_SETTINGS } = require('../../electron/state.cjs')
const { buildSingBoxConfig } = require('../../electron/generated/config.cjs')
const { connectionChanged } = require('../../electron/runtime.cjs')
const { manifest } = require('./fixture.cjs')

function candidate() {
  const value = structuredClone(manifest)
  value.tcp_node = { ...value.nodes[0], id: 'tcp', role: 'tcp', transport: { type: 'tcp' } }
  return value
}

test('advanced options are allowlisted, survive normalization and trigger connection refresh', () => {
  for (const mutate of [
    m => { m.network = { dns_mode: 'fakeip', secure_dns: 'https' } },
    m => { m.nodes[0].transport.type = 'httpupgrade' },
    m => { Object.assign(m.nodes[0].transport, { max_early_data: 2048, early_data_header_name: 'Sec-WebSocket-Protocol' }) },
    m => { m.nodes[0].tls.fingerprint = 'chrome' },
    m => { m.tcp_node.flow = 'xtls-rprx-vision' },
    m => { m.tcp_node.multiplex = true },
  ]) {
    const original = candidate()
    const next = candidate()
    mutate(next)
    const checked = validateManifest(next)
    assert.equal(connectionChanged(original, checked, DEFAULT_SETTINGS, 'smart'), true)
    assert.equal(JSON.stringify(publicManifest(checked)).includes('/private-test-path'), false)
  }
})

test('invalid and conflicting optimization options fail closed', () => {
  for (const mutate of [
    m => { m.network = null },
    m => { m.network = { dns_mode: 'typo' } },
    m => { m.tcp_node.flow = 'unknown' },
    m => { m.tcp_node.multiplex = 'true' },
    m => { m.tcp_node.flow = 'xtls-rprx-vision'; m.tcp_node.multiplex = true },
    m => { m.nodes[0].tls.fingerprint = 'unknown' },
    m => { m.nodes[0].transport.max_early_data = 2048 },
    m => { Object.assign(m.nodes[0].transport, { max_early_data: 2049, early_data_header_name: 'Sec-WebSocket-Protocol' }) },
    m => { Object.assign(m.nodes[0].transport, { type: 'httpupgrade', max_early_data: 1, early_data_header_name: 'Sec-WebSocket-Protocol' }) },
  ]) {
    const value = candidate()
    mutate(value)
    assert.throws(() => validateManifest(value))
  }
})

test('FakeIP is opt-in and disabled for game mode, direct mode and active game rules', () => {
  const value = candidate()
  const options = { ...DEFAULT_SETTINGS, mode: 'smart', appRules: [] }
  const hasFake = (m, o) => buildSingBoxConfig(m, o).dns.servers.some(s => s.type === 'fakeip')
  assert.equal(hasFake(value, options), false)
  value.network = { dns_mode: 'fakeip', secure_dns: 'https' }
  assert.equal(hasFake(value, options), true)
  for (const mode of ['game', 'direct']) assert.equal(hasFake(value, { ...options, mode }), false)
  assert.equal(hasFake(value, { ...options, appRules: DEFAULT_SETTINGS.appRules }), false)
  const dns = buildSingBoxConfig(value, options).dns
  assert.equal(dns.servers[0].type, 'https')
  assert.equal(dns.servers[0].server_port, 443)
  assert.ok(dns.rules.findIndex(r => r.domain_suffix?.includes('cn')) < dns.rules.findIndex(r => r.server === 'fakeip-dns'))
  assert.equal(buildSingBoxConfig(value, options).outbounds.find(o => o.type === 'tuic').zero_rtt_handshake, undefined)
})

test('advanced DNS and transport combinations pass the bundled core validator', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2tt-opt-check-'))
  try {
    for (const variant of ['legacy', 'early', 'httpupgrade', 'vision', 'mux']) {
      const value = candidate()
      value.network = { dns_mode: 'fakeip', secure_dns: variant === 'legacy' ? 'tls' : 'https' }
      if (variant === 'early') Object.assign(value.nodes[0].transport, { max_early_data: 2048, early_data_header_name: 'Sec-WebSocket-Protocol' })
      if (variant === 'httpupgrade') value.nodes[0].transport.type = 'httpupgrade'
      if (variant === 'vision') value.tcp_node.flow = 'xtls-rprx-vision'
      if (variant === 'mux') value.tcp_node.multiplex = true
      value.nodes[0].tls.fingerprint = 'chrome'
      for (const mode of ['smart', 'fast', 'game', 'tcp', 'global', 'direct']) {
        for (const ipv6 of [false, true]) {
          const config = buildSingBoxConfig(validateManifest(value), { ...DEFAULT_SETTINGS, appRules: [], mode, ipv6, ruleSetDirectory: path.resolve('resources/rules') })
          const file = path.join(dir, 'config.json')
          fs.writeFileSync(file, JSON.stringify(config))
          const result = spawnSync(path.resolve('resources/bin/sing-box.exe'), ['check', '-c', file], { windowsHide: true, encoding: 'utf8', timeout: 10000 })
          assert.equal(result.status, 0, `${variant}/${mode}/${ipv6}: ${result.stderr}`)
        }
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

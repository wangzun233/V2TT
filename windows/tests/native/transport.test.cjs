const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { once } = require('node:events')
const { spawn, spawnSync } = require('node:child_process')
const { freePort } = require('../../electron/network.cjs')
const { buildSingBoxConfig } = require('../../electron/generated/config.cjs')
const { manifest } = require('./fixture.cjs')

test('real loopback TLS transfers work for WS, early data, HTTPUpgrade, Vision and mux', { timeout: 60000 }, async () => {
  const binary = path.resolve('resources/bin/sing-box.exe')
  const generated = spawnSync(binary, ['generate', 'tls-keypair', 'localhost'], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  assert.equal(generated.status, 0)
  const key = generated.stdout.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)[0]
  const cert = generated.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2tt-transport-'))
  const target = http.createServer((req, res) => { res.end('v2tt-loopback-ok') })
  target.listen(0, '127.0.0.1')
  await once(target, 'listening')
  try {
    for (const variant of ['ws', 'early', 'httpupgrade', 'vision', 'mux']) {
      const serverPort = await freePort()
      const proxyPort = await freePort()
      const password = crypto.randomBytes(16).toString('hex')
      const value = structuredClone(manifest)
      value.nodes[0].server = '127.0.0.1'
      value.nodes[0].server_port = serverPort
      value.nodes[0].tls = { enabled: true, server_name: 'localhost', fingerprint: 'chrome' }
      value.nodes[0].transport.host = 'localhost'
      if (variant === 'early') Object.assign(value.nodes[0].transport, { max_early_data: 2048, early_data_header_name: 'Sec-WebSocket-Protocol' })
      if (variant === 'httpupgrade') value.nodes[0].transport.type = 'httpupgrade'
      const tcp = ['vision', 'mux'].includes(variant)
      if (tcp) value.tcp_node = { ...value.nodes[0], role: 'tcp', transport: { type: 'tcp' }, ...(variant === 'vision' ? { flow: 'xtls-rprx-vision' } : { multiplex: true }) }
      const built = buildSingBoxConfig(value, { mode: tcp ? 'tcp' : 'smart', appRules: [], strictRoute: false, ipv6: false })
      const outbound = built.outbounds.find(o => o.tag === (tcp ? 'tcp-vless' : 'daily-vless'))
      // Trust only the ephemeral test certificate, never disable verification.
      outbound.tls.certificate = [cert]
      const inbound = {
        type: 'vless', tag: 'server', listen: '127.0.0.1', listen_port: serverPort,
        users: [{ uuid: outbound.uuid, ...(outbound.flow ? { flow: outbound.flow } : {}) }],
        tls: { enabled: true, certificate: [cert], key: [key] },
        ...(outbound.transport ? { transport: outbound.transport } : {}),
        ...(outbound.multiplex ? { multiplex: { enabled: true, padding: true } } : {}),
      }
      const config = {
        log: { level: 'warn' },
        inbounds: [inbound, { type: 'mixed', tag: 'client', listen: '127.0.0.1', listen_port: proxyPort, users: [{ username: 'probe', password }] }],
        outbounds: [outbound, { type: 'direct', tag: 'direct' }],
        route: { rules: [{ inbound: ['server'], outbound: 'direct' }], final: outbound.tag },
      }
      const file = path.join(dir, 'config.json')
      fs.writeFileSync(file, JSON.stringify(config))
      const child = spawn(binary, ['run', '-c', file], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let errors = ''
      child.stderr.on('data', b => { errors = (errors + b).slice(-5000) })
      const closed = once(child, 'close')
      try {
        await new Promise(r => setTimeout(r, 400))
        assert.equal(child.exitCode, null, `${variant}: ${errors}`)
        for (let i = 0; i < 3; i++) {
          const body = await new Promise((resolve, reject) => {
            const req = http.get({ hostname: '127.0.0.1', port: proxyPort, path: `http://127.0.0.1:${target.address().port}/`,
              headers: { 'Proxy-Authorization': `Basic ${Buffer.from(`probe:${password}`).toString('base64')}` } }, res => {
              let body = ''
              res.on('data', b => { body += b })
              res.on('end', () => resolve(body))
              res.on('error', reject)
            })
            req.setTimeout(5000, () => req.destroy(new Error(`${variant}: timeout`)))
            req.on('error', reject)
          })
          assert.equal(body, 'v2tt-loopback-ok', `${variant}: ${errors}`)
        }
      } finally {
        if (child.exitCode === null) child.kill()
        await closed
      }
    }
  } finally {
    await new Promise(resolve => target.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

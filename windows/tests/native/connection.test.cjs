const { test } = require('node:test')
const assert = require('node:assert/strict')
const { connectionChanged } = require('../../electron/runtime.cjs')
const { DEFAULT_SETTINGS } = require('../../electron/state.cjs')
const { manifest } = require('./fixture.cjs')

test('subscription metadata and ordering do not interrupt an active connection', () => {
  const next = structuredClone(manifest)
  next.generated_at = '2030-01-01T00:00:00Z'
  next.profile.name = 'Renamed'
  next.nodes[0].name = 'Renamed daily'
  next.nodes.reverse()
  next.routing.default_mode = 'global'
  for (const mode of ['smart', 'fast', 'global']) {
    assert.equal(connectionChanged(manifest, next, DEFAULT_SETTINGS, mode), false)
  }
})

test('connection parameters still trigger refresh reconnect', () => {
  for (const mutate of [
    (m) => { m.nodes[0].server = 'changed.example.com' },
    (m) => { m.nodes[0].uuid = '00000000-0000-4000-8000-000000000099' },
    (m) => { m.nodes[0].transport.path = '/changed' },
    (m) => { m.nodes[1].password = 'changed' },
    (m) => { m.nodes[1].tls.alpn = ['changed'] },
  ]) {
    const next = structuredClone(manifest)
    mutate(next)
    assert.equal(connectionChanged(manifest, next, DEFAULT_SETTINGS, 'fast'), true)
  }
})

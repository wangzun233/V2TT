const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHealthMonitor, sampleHealth, allowsHealthRecovery } = require('../../electron/health.cjs')

test('game mode warns instead of restarting a live game after unrelated health failures', () => {
  assert.equal(allowsHealthRecovery('game'), false)
  assert.equal(allowsHealthRecovery('fast'), true)
})

test('only sustained failures trigger once; successful sample resets the counter', async () => {
  let healthy = false
  let recoveries = 0
  const counts = []
  const monitor = createHealthMonitor({ interval: 60000, sample: async () => ({ healthy }),
    onSample: (r) => counts.push(r.failures), onFailure: () => recoveries++ })
  try {
    await monitor.tick(); await monitor.tick()
    assert.equal(recoveries, 0)
    healthy = true
    await monitor.tick()
    healthy = false
    await monitor.tick(); await monitor.tick(); await monitor.tick(); await monitor.tick()
    assert.deepEqual(counts, [1, 2, 0, 1, 2, 3, 4])
    assert.equal(recoveries, 1)
  } finally { monitor.stop() }
})

test('stop cancels the probe and discards late samples without reconnecting', async () => {
  let finish
  let signal
  let calls = 0
  const monitor = createHealthMonitor({ interval: 60000, threshold: 1,
    sample: (s) => { signal = s; return new Promise((resolve) => { finish = resolve }) },
    onSample: () => calls++, onFailure: () => calls++ })
  const pending = monitor.tick()
  await monitor.tick()
  monitor.stop()
  assert.equal(signal.aborted, true)
  finish({ healthy: false })
  await pending
  assert.equal(calls, 0)
})

test('a probe implementation exception is not classified as network failure', async () => {
  let calls = 0
  const monitor = createHealthMonitor({ interval: 60000, threshold: 1,
    sample: async () => { throw Error('test') }, onSample: () => calls++, onFailure: () => calls++ })
  try { await monitor.tick(); assert.equal(calls, 0) } finally { monitor.stop() }
})

const base = () => ({ control: async () => true, dnsProbe: async () => true,
  signal: new AbortController().signal, port: 12345, password: 'test' })

test('HTTP 403 is reachable, not an outage', async () => {
  const result = await sampleHealth({ ...base(), httpProbe: async () => ({ httpStatus: 403 }) })
  assert.deepEqual(result, { healthy: true, controller: true, dns: true, web: true, proxy: null })
})

test('one blocked test site falls back to another without requesting recovery', async () => {
  let calls = 0
  const result = await sampleHealth({ ...base(), httpProbe: async () => {
    if (++calls === 1) throw Error('unreachable')
    return { httpStatus: 200 }
  } })
  assert.equal(result.healthy, true)
  assert.equal(calls, 2)
})

test('DNS failure cannot be hidden by a working controller or cached web connection', async () => {
  const ports = []
  const result = await sampleHealth({ ...base(), dnsProbe: async () => false,
    httpProbe: async (_url, port) => { ports.push(port); return { httpStatus: 200 } } })
  assert.equal(result.healthy, false)
  assert.equal(result.proxy, true)
  assert.deepEqual(ports, [undefined, 12345])
})

test('records total transport failure without leaking errors or credentials', async () => {
  const result = await sampleHealth({ ...base(), dnsProbe: async () => false,
    httpProbe: async () => { throw Error('private data') } })
  assert.deepEqual(result, { healthy: false, controller: true, dns: false, web: false, proxy: false })
})

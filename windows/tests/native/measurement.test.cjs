const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMeasurement, summarize } = require('../../electron/measurement.cjs')

test('latency summary never fabricates empty or single sample jitter', () => {
  assert.deepEqual(summarize([]), { median: null, jitter: null })
  assert.deepEqual(summarize([30]), { median: 30, jitter: null })
  assert.deepEqual(summarize([30, 10, 20]), { median: 20, jitter: 15 })
  assert.deepEqual(summarize([10, 20]), { median: 15, jitter: 10 })
})
test('measurement stops promptly, rejects overlap and returns isolated snapshots', async () => {
  const meter = createMeasurement()
  const options = { id: 'vless', kind: 'speed', hostname: 'example.com', servername: 'example.com', port: 1, password: 'fixture', token: 'fixture' }
  const result = meter.start(options)
  await assert.rejects(meter.start(options), /已有测速/)
  meter.cancel()
  assert.equal((await result).phase, 'cancelled')
  const copy = meter.status()
  copy.running = true
  assert.equal(meter.status().running, false)
  assert.equal(meter.status().bytes, 0)
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { redact, sanitize } = require('../../electron/privacy.cjs')

test('structured logs remove secrets at any nesting level without mutating input', () => {
  const value = { password: 'fake-pass', inner: [{ access_token: 'fake-token', privateKey: 'fake-key' }], status: 403 }
  const result = sanitize(value)
  assert.equal(result.password, '[REDACTED]')
  assert.equal(result.inner[0].access_token, '[REDACTED]')
  assert.equal(result.inner[0].privateKey, '[REDACTED]')
  assert.equal(result.status, 403)
  assert.equal(value.password, 'fake-pass')
  assert(!redact(JSON.stringify(value)).includes('fake-'))
})

test('text filters cover authorization, partial records, proxy URIs, encoded URIs and paths', () => {
  for (const value of [
    'Authorization: Bearer fake-credential', 'Proxy-Authorization: Basic ZmFrZS1jcmVkZW50aWFs',
    'prefix {"password":"fake credential"}', 'password=fake-credential',
    'vmess://ZmFrZS1jcmVkZW50aWFs', 'tuic://fake-credential@example.com:443',
    'vless%3A%2F%2Ffake-credential%40example.com',
    'C:\\Users\\fake-user\\Local Files\\config.json', '/home/fake-user/private.json',
  ]) {
    const result = redact(value)
    assert(!/fake-|fake credential|ZmFrZS1jcmVkZW50aWFs/.test(result), result)
    assert.equal(redact(result), result)
  }
  assert.equal(redact('timeout 15s; HTTP 403; sha256 abc123'), 'timeout 15s; HTTP 403; sha256 abc123')
})

test('export sanitizes old JSONL logs and keeps the report valid JSON', () => {
  const input = { startupLog: [
    JSON.stringify({ details: JSON.stringify({ password: 'old-private-value' }) }),
    JSON.stringify({ details: 'Authorization: Bearer old-private-value' }),
  ].join('\n'), status: { error: 'https://example.com/private-subscription' } }
  const result = JSON.stringify(sanitize(input))
  assert(!result.includes('old-private-value'))
  assert(!result.includes('private-subscription'))
  assert.equal(typeof JSON.parse(result).startupLog, 'string')
})

test('cycles and deep values are bounded and exception paths are sanitized', () => {
  const cycle = {}; cycle.self = cycle
  assert.equal(sanitize(cycle).self, '[CIRCULAR]')
  assert(!redact(new Error('C:\\Users\\FakeUser\\config.json')).includes('FakeUser'))
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { newer, parseUpdate, checkUpdate } = require('../../electron/updates.cjs')
const good = { schema: 1, windows: { version: '0.2.4', releaseUrl: 'https://github.com/wangzun233/V2TT/releases/tag/v-test' } }
test('update versions compare numerically and never downgrade', () => {
  assert.equal(newer('0.2.10', '0.2.9'), true)
  assert.equal(newer('0.2.3', '0.2.3'), false)
  assert.equal(newer('0.1.9', '0.2.3'), false)
  assert.throws(() => newer('0.2.3-beta', '0.2.3'))
})
test('only this repository release pages are allowed', () => {
  assert.equal(parseUpdate(JSON.stringify(good), '0.2.3').version, '0.2.4')
  assert.equal(parseUpdate(JSON.stringify(good), '0.2.4'), null)
  for (const url of ['https://evil.test', 'file:///installer.exe', `${good.windows.releaseUrl}/../../other`, `${good.windows.releaseUrl}?redirect=evil`]) {
    assert.throws(() => parseUpdate(JSON.stringify({ ...good, windows: { ...good.windows, releaseUrl: url } }), '0.2.3'))
  }
})
test('update transport distinguishes failure from no update and bounds body', async () => {
  await assert.rejects(checkUpdate(async () => new Response('', { status: 404 }), '0.2.3'))
  await assert.rejects(checkUpdate(async () => new Response(' '.repeat(16385)), '0.2.3'))
  assert.equal((await checkUpdate(async () => new Response(JSON.stringify(good)), '0.2.3')).version, '0.2.4')
})

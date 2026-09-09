import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fallbackManifest } from '../src/data/fallbackManifest'

// A development Electron host exercises packaged resources; production fuses
// deliberately disable the main-process inspector needed by Playwright.
const launchArgs = [process.env.V2TT_PACKAGED_ASAR || '.']

test('desktop shell requires a subscription and minimizes closing windows to tray', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'v2tt-client-test-'))
  const application = await electron.launch({
    args: [...launchArgs, `--user-data-dir=${userData}`],
    env: { ...process.env, V2TT_ALLOW_MULTIPLE_INSTANCES: '1' },
  })
  try {
    const window = await application.firstWindow()
    await expect(window.getByRole('heading', { name: '导入你的订阅' })).toBeVisible({ timeout: 10000 })
    const gpu = await application.evaluate(({ app }) => app.getGPUFeatureStatus())
    expect(gpu.gpu_compositing).toMatch(/disabled|unavailable/)
    const bridgeShape = await window.evaluate(() => ({
      hasNode: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
      methods: Object.keys(window.v2tt ?? {}).sort(),
    }))
    expect(bridgeShape.hasNode).toBe(false)
    expect(bridgeShape.methods).toEqual(['connect', 'disconnect', 'exportReport', 'getManifest', 'getSettings', 'getStatus', 'getSubscription', 'refreshManifest', 'removeSubscription', 'runDiagnostics', 'setMode', 'setSetting', 'setSubscription', 'testNode'])
    const initialSettings = await window.evaluate(() => window.v2tt?.getSettings())
    expect(initialSettings).toMatchObject({ startup: false, autoConnect: true, strictRoute: true, ipv6: false, lastMode: 'smart' })
    const updatedSettings = await window.evaluate(() => window.v2tt?.setSetting({ key: 'autoConnect', value: false }))
    expect(updatedSettings?.autoConnect).toBe(false)
    expect((await window.evaluate(() => window.v2tt?.getSettings()))?.autoConnect).toBe(false)
    await window.evaluate(() => window.v2tt?.setSetting({ key: 'appRules', value: [{ id: 'test', name: 'Game', executable: 'Game.exe', target: 'game', enabled: true }] }))
    await window.reload()
    await expect(window.getByRole('heading', { name: '导入你的订阅' })).toBeVisible()
    expect((await window.evaluate(() => window.v2tt?.getSettings()))?.appRules).toEqual([{ id: 'test', name: 'Game', executable: 'Game.exe', target: 'game', enabled: true }])
    const rejected = await window.evaluate(async () => {
      try { await window.v2tt?.connect({ mode: 'bad' as never }); return false } catch { return true }
    })
    expect(rejected).toBe(true)
    await window.getByLabel('订阅链接', { exact: true }).fill('http://example.com/device/test')
    await window.getByRole('button', { name: '验证并导入' }).click()
    await expect(window.getByRole('alert')).toContainText('必须使用 HTTPS')
    await window.screenshot({ path: 'artifacts/subscription-setup.png' })
    const overflow = await window.evaluate(() => ({
      document: document.documentElement.scrollHeight - window.innerHeight,
      body: document.body.scrollHeight - window.innerHeight,
    }))
    expect(overflow).toEqual({ document: 0, body: 0 })
    const closeBehavior = await application.evaluate(async ({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]
      target.close()
      await new Promise((resolve) => setTimeout(resolve, 150))
      return { destroyed: target.isDestroyed(), visible: target.isVisible() }
    })
    expect(closeBehavior).toEqual({ destroyed: false, visible: false })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
    await expect(window.getByRole('heading', { name: '导入你的订阅' })).toBeVisible()
    const startupLog = join(userData, 'runtime', 'startup.log')
    await expect.poll(() => existsSync(startupLog)).toBe(true)
    expect(readFileSync(startupLog, 'utf8')).toContain('"event":"APP_READY"')
    await expect.poll(() => readFileSync(startupLog, 'utf8')).toContain('UI_RENDERED')
    await window.evaluate(() => console.error('startup-diagnostic-test https://example.test/private-fixture'))
    await expect.poll(() => readFileSync(startupLog, 'utf8')).toContain('startup-diagnostic-test [URL]')
    expect(readFileSync(startupLog, 'utf8')).not.toContain('private-fixture')
  } finally {
    await application.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('auto-start launch stays hidden while the tray process initializes', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'v2tt-client-autostart-test-'))
  const application = await electron.launch({
    args: [...launchArgs, '--autostart', `--user-data-dir=${userData}`],
    env: { ...process.env, V2TT_ALLOW_MULTIPLE_INSTANCES: '1' },
  })
  try {
    await application.firstWindow()
    const windowState = await application.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]
      return { exists: Boolean(target), visible: target?.isVisible() }
    })
    expect(windowState).toEqual({ exists: true, visible: false })
  } finally {
    await application.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('subscription replacement is validated, encrypted, and revocation blocks cached access', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'v2tt-account-test-'))
  const application = await electron.launch({ args: [...launchArgs, `--user-data-dir=${userData}`], env: { ...process.env, V2TT_ALLOW_MULTIPLE_INSTANCES: '1' } })
  try {
    const window = await application.firstWindow()
    await expect(window.getByRole('heading', { name: '导入你的订阅' })).toBeVisible()
    const fixture = structuredClone(fallbackManifest)
    fixture.profile.name = 'Release Test'
    fixture.nodes[0].uuid = '00000000-0000-4000-8000-000000000001'
    fixture.nodes[1].uuid = '00000000-0000-4000-8000-000000000002'
    if (fixture.nodes[1].type === 'tuic') fixture.nodes[1].password = 'fixture-password-not-a-real-account'
    const url = 'https://subscription.test/api/v1/device/private-fixture-token'
    await application.evaluate((_electron, data) => {
      const original = globalThis.fetch
      globalThis.fetch = async (input, init) => String(input) === data.url ? new Response(JSON.stringify(data.manifest)) : original(input, init)
    }, { url, manifest: fixture })
    await window.getByLabel('订阅链接', { exact: true }).fill(url)
    await window.getByRole('button', { name: '验证并导入' }).click()
    await expect(window.getByRole('heading', { name: '未连接' })).toBeVisible()
    const publicAccount = await window.evaluate(() => window.v2tt?.getManifest())
    expect(JSON.stringify(publicAccount)).not.toContain('fixture-password')
    expect(JSON.stringify(publicAccount)).not.toContain(fixture.nodes[0].uuid)
    const encrypted = readFileSync(join(userData, 'runtime', 'account.bin'))
    expect(encrypted.includes(Buffer.from(url))).toBe(false)
    expect(encrypted.includes(Buffer.from('fixture-password'))).toBe(false)
    await window.getByRole('button', { name: '直连', exact: true }).click()
    await window.getByRole('button', { name: '开始连接' }).click()
    await expect(window.getByRole('heading', { name: '已连接' })).toBeVisible()
    await application.evaluate(() => { globalThis.fetch = async () => new Response('{"schema_version":1,"nodes":[]}') })
    await window.getByRole('button', { name: '设置', exact: true }).click()
    await window.getByLabel('专属订阅链接').fill('https://subscription.test/bad')
    await window.getByRole('button', { name: '更换订阅', exact: true }).click()
    await expect(window.getByRole('alert')).toContainText('专属订阅')
    expect((await window.evaluate(() => window.v2tt?.getSubscription()))?.url).toBe(url)
    expect((await window.evaluate(() => window.v2tt?.getStatus()))?.state).toBe('connected')
    await application.evaluate(() => { globalThis.fetch = async () => new Response('', { status: 403 }) })
    const refreshError = await window.evaluate(async () => {
      try { await window.v2tt?.refreshManifest(); return '' } catch (error) { return String(error) }
    })
    expect(refreshError).toContain('403')
    expect((await window.evaluate(() => window.v2tt?.getStatus()))?.state).toBe('disconnected')
    const connectError = await window.evaluate(async () => {
      try { await window.v2tt?.connect({ mode: 'smart' }); return '' } catch (error) { return String(error) }
    })
    expect(connectError).toContain('拒绝')
    expect(existsSync(join(userData, 'runtime', 'config.json'))).toBe(false)
    const expired = structuredClone(fixture)
    expired.profile.expires_at = '2000-01-01T00:00:00Z'
    await application.evaluate((_electron, manifest) => { globalThis.fetch = async () => new Response(JSON.stringify(manifest)) }, expired)
    const expiryError = await window.evaluate(async () => {
      try { await window.v2tt?.refreshManifest(); return '' } catch (error) { return String(error) }
    })
    expect(expiryError).toContain('已到期')
  } finally {
    await application.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

import { expect, test } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('failed app bundle shows recovery controls instead of a blank window', async ({ page }) => {
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'V2TT Client', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '界面加载失败' })).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: join(tmpdir(), 'v2tt-0.2.1-startup-recovery.png') })
  await page.unroute('**/assets/*.js')
  await page.getByRole('button', { name: '重新加载界面' }).click()
  await expect(page.getByRole('heading', { name: '未连接' })).toBeVisible()
})

test('startup content is visible even when no JavaScript can execute', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(baseURL!)
    await expect(page.getByRole('heading', { name: 'V2TT Client', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '正在加载界面' })).toBeVisible()
  } finally { await context.close() }
})

test('main workflow remains functional across desktop views', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '未连接' })).toBeVisible()
  await expect(page.getByText('已更新')).toBeVisible()

  await expect(page.getByTestId('download-total')).toHaveText('0.0 MB')

  await page.getByRole('button', { name: '全局' }).click()
  await expect(page.getByText('所有流量使用日常线路')).toBeVisible()
  await page.getByRole('button', { name: '极速' }).click()
  await expect(page.getByText('OpenAI 使用 VLESS，其他国外流量使用 TUIC')).toBeVisible()
  await expect(page.getByText('DEMO TUIC', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '智能' }).click()

  await page.getByRole('button', { name: '应用规则' }).click()
  await expect(page.getByRole('heading', { name: '应用规则' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'DemoGame.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('demo'),
  })
  await expect(page.getByText('DemoGame', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '线路', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'DEMO VLESS CDN' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'DEMO TUIC' })).toBeVisible()

  await page.getByRole('button', { name: '诊断', exact: true }).click()
  await page.getByRole('button', { name: '开始诊断' }).click()
  await expect(page.getByRole('alert')).toContainText('浏览器预览无法运行网络诊断')
  await expect(page.getByText('尚未测试', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('heading', { name: '配置预览' })).toBeVisible()
  await expect(page.locator('pre')).toContainText('game-tuic')
  await expect(page.getByRole('button', { name: '开机自动启动' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: '自动连接' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '自动连接' }).click()
  await expect(page.getByRole('button', { name: '自动连接' })).toHaveAttribute('aria-pressed', 'false')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(consoleErrors).toEqual([])
})

test('connection view fits the minimum desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '未连接' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'artifacts/connection-1024.png', fullPage: true })
})

test('captures the polished connection dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await expect(page.getByText('已更新')).toBeVisible()
  await page.screenshot({ path: 'artifacts/connection-1440.png', fullPage: true })
})

test('captures every glass interface surface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  const surfaces = [
    ['应用规则', 'rules'],
    ['线路', 'lines'],
    ['诊断', 'diagnostics'],
    ['设置', 'settings'],
  ] as const
  for (const [label, filename] of surfaces) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { name: label === '诊断' ? '诊断中心' : label })).toBeVisible()
    await page.screenshot({ path: `artifacts/${filename}-1440.png`, fullPage: true })
  }
})

import { test, expect } from '@playwright/test'

test('measurement requires confirmation and preview never fabricates speed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '诊断', exact: true }).click()
  await expect(page.getByRole('heading', { name: '服务器测速' })).toBeVisible()
  await page.getByRole('button', { name: '测速度', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('128 MiB')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始测速', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '测延迟', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请在桌面客户端连接节点后测试')
  await page.waitForTimeout(700)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.screenshot({ path: 'artifacts/measurement-desktop.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('tray update action shows a verified release and keeps proxy disconnected', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'v2tt-update-test-'))
  const application = await electron.launch({ args: [process.env.V2TT_PACKAGED_ASAR || '.', `--user-data-dir=${userData}`], env: { ...process.env, V2TT_ALLOW_MULTIPLE_INSTANCES: '1' } })
  try {
    const window = await application.firstWindow()
    await expect(window.getByRole('heading', { name: '导入你的订阅' })).toBeVisible()
    await application.evaluate(({ Menu, net, dialog, shell }) => {
      const state = globalThis as unknown as { updateTest: { click?: () => void; messages: string[]; opened: string[] } }
      state.updateTest = { messages: [], opened: [] }
      const original = Menu.buildFromTemplate.bind(Menu)
      Menu.buildFromTemplate = (items) => {
        const action = items.find((item) => item.label === '检查更新')
        if (action?.click) state.updateTest.click = () => action.click!({} as never, undefined, {} as never)
        return original(items)
      }
      net.fetch = async () => new Response(JSON.stringify({ schema: 1, windows: { version: '999.0.0', releaseUrl: 'https://github.com/wangzun233/V2TT/releases/tag/test-only' } }))
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string }
        state.updateTest.messages.push(options.message)
        return { response: 0, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
      shell.openExternal = async (url) => { state.updateTest.opened.push(url) }
    })
    await window.evaluate(() => window.v2tt?.setMode({ mode: 'smart' }))
    await application.evaluate(() => (globalThis as unknown as { updateTest: { click: () => void } }).updateTest.click())
    await expect.poll(() => application.evaluate(() => (globalThis as unknown as { updateTest: { opened: string[] } }).updateTest.opened)).toEqual(['https://github.com/wangzun233/V2TT/releases/tag/test-only'])
    expect((await window.evaluate(() => window.v2tt?.getStatus()))?.state).toBe('disconnected')
    await application.evaluate(({ net }) => {
      net.fetch = async () => { throw new Error('offline') }
      ;(globalThis as unknown as { updateTest: { click: () => void } }).updateTest.click()
    })
    await expect.poll(() => application.evaluate(() => (globalThis as unknown as { updateTest: { messages: string[] } }).updateTest.messages)).toContain('暂时无法检查更新')
  } finally {
    await application.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

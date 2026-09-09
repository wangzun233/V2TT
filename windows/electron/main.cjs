const { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, Tray, dialog, powerMonitor } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { createStartup } = require('./startup.cjs')
const { createRuntime } = require('./runtime.cjs')
const { DEFAULT_SETTINGS, normalizeSettings, validateMode, validateRules, validateSubscriptionUrl, validateManifest,
  assertActive, publicManifest, atomicWrite, readBounded, createQueue, redact } = require('./state.cjs')

// Keep the UI independent of driver-specific GPU/compositor behavior on Windows.
app.disableHardwareAcceleration()
app.setAppUserModelId('top.wangzun233.v2tt.client')
// Keep the portable preview's data directory when installing or upgrading.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'v2tt-client'))
const hidden = process.argv.includes('--autostart')
const directory = path.join(app.getPath('userData'), 'runtime')
const entry = path.join(__dirname, '..', 'dist', 'index.html')
const bundlePath = path.join(directory, 'account.bin')
const settingsPath = path.join(directory, 'preferences.json')
const queue = createQueue()
const startup = createStartup(app)
const labels = { smart: '智能', fast: '极速', global: '全局', direct: '直连' }
let window = null
let tray = null
let quitting = false
let quitReady = false
let bundle = null
let source = 'cache'
let settings = structuredClone(DEFAULT_SETTINGS)
let recoveryAttempts = 0
let recoverTimer = null
let refreshTimer = null
let expiryTimer = null
let bootPromise = Promise.resolve()
let logErrorShown = false
let renderCheck = null
const single = (!app.isPackaged && process.env.V2TT_ALLOW_MULTIPLE_INSTANCES === '1') || app.requestSingleInstanceLock()

function log(event, details = {}) {
  try {
    fs.mkdirSync(directory, { recursive: true })
    const file = path.join(directory, event === 'CORE' ? 'sing-box.log' : 'startup.log')
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
      fs.rmSync(`${file}.previous`, { force: true })
      fs.renameSync(file, `${file}.previous`)
    }
    const message = details instanceof Error ? details.message : typeof details === 'string' ? details : JSON.stringify(details)
    fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event, details: redact(message) }) + '\n')
  } catch { /* Logging must not interrupt network cleanup. */ }
}

const runtime = createRuntime({ app, directory, log, onChange: updateTray, onUnexpectedExit: () => {
  if (quitting || recoveryAttempts >= 3 || !bundle) return
  recoveryAttempts += 1
  clearTimeout(recoverTimer)
  recoverTimer = setTimeout(() => {
    void queue(async () => {
      if (quitting || !bundle) return
      runtime.setError(`正在恢复代理连接（${recoveryAttempts}/3）`)
      await connect(settings.lastMode, false)
    }).catch((error) => runtime.setError(error.message))
  }, 5000 * recoveryAttempts)
} })

function showWindow() {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function updateTray() {
  if (!tray) return
  const status = runtime.status()
  const label = status.state === 'connected' ? `已连接 · ${labels[status.mode]}` : status.state === 'connecting' ? '正在连接' : '未连接'
  tray.setToolTip(`V2TT Client · ${label}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 V2TT Client', click: showWindow },
    { label: '重新加载界面', click: () => { showWindow(); window?.reload() } },
    { label, enabled: false }, { type: 'separator' },
    { label: '退出并断开连接', click: () => app.quit() },
  ]))
}

function readEncrypted(file) {
  if (!fs.existsSync(file)) return null
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用')
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) }
  catch { throw new Error('本机订阅无法解密，请使用这台电脑自己的订阅重新导入') }
}

function saveBundle(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用，订阅未保存')
  atomicWrite(bundlePath, safeStorage.encryptString(JSON.stringify(value)))
  bundle = value
}

function loadBundle() {
  let saved = readEncrypted(bundlePath)
  if (!saved) {
    const oldSubscription = readEncrypted(path.join(directory, 'subscription.bin'))
    const oldManifest = readEncrypted(path.join(directory, 'manifest.bin'))
    if (oldSubscription && oldManifest?.fingerprint === crypto.createHash('sha256').update(oldSubscription.url).digest('hex')) {
      saved = { url: oldSubscription.url, manifest: oldManifest.manifest, fetchedAt: fs.statSync(path.join(directory, 'manifest.bin')).mtimeMs }
    }
  }
  if (!saved) return null
  saved.url = validateSubscriptionUrl(saved.url)
  saved.manifest = validateManifest(saved.manifest)
  saveBundle(saved)
  for (const name of ['subscription.bin', 'manifest.bin']) fs.rmSync(path.join(directory, name), { force: true })
  return saved
}

function saveSettings(value) {
  const next = normalizeSettings(value)
  atomicWrite(settingsPath, JSON.stringify(next, null, 2))
  settings = next
}

async function requestManifest(url) {
  let response
  try { response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) }) }
  catch { const error = new Error('订阅服务器暂时无法连接'); error.transient = true; throw error }
  if (!response.ok) {
    await response.body?.cancel()
    const error = new Error(`订阅服务器返回 HTTP ${response.status}`)
    error.transient = response.status >= 500 || response.status === 429
    error.revoked = [401, 403, 404, 410].includes(response.status)
    throw error
  }
  let parsed
  try { parsed = JSON.parse(await readBounded(response)) }
  catch (error) { throw new Error(error.message === '订阅内容过大' ? error.message : '订阅内容无效，请确认这是 V2TT Client 专属链接') }
  const manifest = validateManifest(parsed)
  try { assertActive(manifest) }
  catch (error) { error.revoked = true; throw error }
  return manifest
}

function requireAccount() {
  if (!bundle) throw new Error('请先导入 V2TT Client 专属订阅')
  if (bundle.blocked) throw new Error('订阅已被服务器拒绝，请更新订阅或联系管理员')
  assertActive(bundle.manifest)
  if (!Number.isFinite(bundle.fetchedAt) || Date.now() - bundle.fetchedAt > 72 * 3600 * 1000) throw new Error('订阅缓存已超过 72 小时，请联网更新后再连接')
  return bundle.manifest
}

function publicAccount() {
  if (!bundle) throw new Error('请先导入订阅链接')
  return { manifest: publicManifest(bundle.manifest), source }
}

async function connect(mode, resetRecovery = true) {
  if (quitting) throw new Error('客户端正在退出')
  validateMode(mode)
  const manifest = mode === 'direct' ? bundle?.manifest : requireAccount()
  if (resetRecovery) recoveryAttempts = 0
  clearTimeout(recoverTimer)
  const result = await runtime.start(manifest, settings, mode)
  saveSettings({ ...settings, lastMode: mode })
  return result
}

async function refresh() {
  if (!bundle) throw new Error('请先导入订阅链接')
  try {
    const manifest = await requestManifest(bundle.url)
    const changed = JSON.stringify(manifest.nodes) !== JSON.stringify(bundle.manifest.nodes) || JSON.stringify(manifest.routing) !== JSON.stringify(bundle.manifest.routing)
    saveBundle({ url: bundle.url, manifest, fetchedAt: Date.now(), blocked: false })
    source = 'remote'
    if (changed && runtime.status().state === 'connected' && runtime.status().mode !== 'direct') await connect(settings.lastMode)
    return publicAccount()
  } catch (error) {
    if (error.revoked) {
      saveBundle({ ...bundle, blocked: true })
      clearTimeout(recoverTimer)
      await runtime.stop()
      runtime.setError(error.message)
    }
    if (error.transient) { requireAccount(); source = 'cache'; return publicAccount() }
    throw error
  }
}

async function bootstrap() {
  log('APP_READY', { appVersion: app.getVersion(), electronVersion: process.versions.electron, os: os.release(), arch: process.arch, autoStart: hidden, requestedRendering: 'software' })
  fs.mkdirSync(directory, { recursive: true })
  for (const name of ['config.json', 'config.json.pending']) fs.rmSync(path.join(directory, name), { force: true })
  try {
    if (fs.existsSync(settingsPath)) settings = normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')))
  } catch (error) { log('SETTINGS_READ_FAILED', error); runtime.setError('本机设置损坏，已恢复默认值') }
  runtime.setMode(settings.lastMode)
  try {
    loadBundle()
    if (bundle) {
      await refresh()
      if (settings.autoConnect && !quitting) await connect(settings.lastMode)
    }
  } catch (error) {
    log('BOOT_CONFIGURATION_FAILED', error)
    runtime.setError(error.message)
    if (hidden) showWindow()
  }
  refreshTimer = setInterval(() => {
    if (!bundle || quitting || Date.now() - bundle.fetchedAt < bundle.manifest.profile.update_interval_hours * 3600000) return
    void queue(refresh).catch((error) => { log('AUTO_REFRESH_FAILED', error); runtime.setError(error.message) })
  }, 300000)
  expiryTimer = setInterval(() => {
    if (quitting || runtime.status().state !== 'connected' || runtime.status().mode === 'direct') return
    try { requireAccount() } catch (error) {
      clearTimeout(recoverTimer)
      void queue(async () => { await runtime.stop(); runtime.setError(error.message) })
    }
  }, 60000)
}

function register(channel, handler, serialized = false) {
  ipcMain.handle(channel, async (event, payload) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(entry).href) throw new Error('拒绝非本机界面请求')
    await bootPromise
    if (quitting) throw new Error('客户端正在退出')
    try { return await (serialized ? queue(() => handler(payload)) : handler(payload)) }
    catch (error) { log(`IPC_${channel}`, error); throw new Error(redact(error.message)) }
  })
}

register('subscription:get', () => ({ configured: Boolean(bundle), url: bundle?.url || '' }))
register('manifest:get', publicAccount)
register('manifest:refresh', refresh, true)
register('subscription:set', async (payload) => {
  const url = validateSubscriptionUrl(payload?.url)
  const manifest = await requestManifest(url)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用')
  const encrypted = safeStorage.encryptString(JSON.stringify({ url, manifest, fetchedAt: Date.now(), blocked: false }))
  clearTimeout(recoverTimer)
  await runtime.stop()
  atomicWrite(bundlePath, encrypted)
  bundle = JSON.parse(safeStorage.decryptString(encrypted))
  source = 'remote'
  saveSettings({ ...settings, lastMode: manifest.routing.default_mode })
  runtime.setMode(settings.lastMode)
  runtime.setError('')
  return { ...publicAccount(), subscription: { configured: true, url } }
}, true)
register('subscription:remove', async () => {
  const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['取消', '移除订阅'], defaultId: 0, cancelId: 0, message: '移除这台电脑的订阅并断开连接？' })
  if (choice.response !== 1) return { configured: Boolean(bundle), url: bundle?.url || '' }
  clearTimeout(recoverTimer)
  await runtime.stop()
  fs.rmSync(bundlePath, { force: true })
  bundle = null
  return { configured: false, url: '' }
}, true)
register('settings:get', async () => ({ ...settings, ...await startup.get(true), version: app.getVersion() }))
register('settings:set', async (payload) => {
  const { key, value } = payload || {}
  if (key === 'startup') return { ...settings, ...await startup.set(value), version: app.getVersion() }
  const next = { ...settings }
  if (key === 'appRules') next.appRules = validateRules(value)
  else if (key === 'lastMode') next.lastMode = validateMode(value)
  else if (['autoConnect', 'strictRoute', 'ipv6'].includes(key) && typeof value === 'boolean') next[key] = value
  else throw new Error('设置参数无效')
  const previous = settings
  const active = runtime.status().state === 'connected'
  const affectsRoute = ['appRules', 'strictRoute', 'ipv6', 'lastMode'].includes(key)
  if (active && affectsRoute) {
    try {
      await runtime.start(next.lastMode === 'direct' ? bundle?.manifest : requireAccount(), next, next.lastMode)
      saveSettings(next)
    } catch (error) {
      await runtime.start(previous.lastMode === 'direct' ? bundle?.manifest : requireAccount(), previous, previous.lastMode).catch(() => {})
      throw error
    }
  } else saveSettings(next)
  runtime.setMode(settings.lastMode)
  return { ...settings, ...await startup.get(), version: app.getVersion() }
}, true)
register('proxy:status', () => runtime.traffic())
register('proxy:connect', (payload) => connect(payload?.mode), true)
register('proxy:disconnect', async () => { clearTimeout(recoverTimer); recoveryAttempts = 3; await runtime.stop(); runtime.setError(''); return runtime.status() }, true)
register('proxy:set-mode', async (payload) => {
  const mode = validateMode(payload?.mode)
  if (runtime.status().state === 'connected') return connect(mode)
  saveSettings({ ...settings, lastMode: mode })
  return runtime.setMode(mode)
}, true)
register('diagnostics:run', () => runtime.diagnose(requireAccount(), source), true)
register('diagnostics:node', (payload) => {
  if (!['vless', 'tuic'].includes(payload?.id)) throw new Error('无效的测试线路')
  return runtime.testNode(payload.id)
}, true)
register('support:export', async () => {
  const result = await dialog.showSaveDialog(window, { title: '导出诊断报告', defaultPath: `V2TT-report-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (result.canceled || !result.filePath) return { saved: false }
  const report = { version: app.getVersion(), os: os.release(), arch: process.arch, time: new Date().toISOString(), status: runtime.status(),
    diagnostics: runtime.report(), startupLog: fs.existsSync(path.join(directory, 'startup.log')) ? fs.readFileSync(path.join(directory, 'startup.log'), 'utf8').slice(-30000) : '' }
  atomicWrite(result.filePath, JSON.stringify(report, null, 2))
  return { saved: true }
})

function createWindow() {
  window = new BrowserWindow({ width: 1280, height: 840, minWidth: 1024, minHeight: 720, show: false, autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'build', 'icon.png'), backgroundColor: '#f7f8fa',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.on('preload-error', (_event, _file, error) => log('PRELOAD_FAILED', error))
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') log('RENDERER_ERROR', String(details.message).slice(0, 1500))
  })
  window.webContents.on('did-finish-load', () => {
    log('UI_DOCUMENT_LOADED')
    clearTimeout(renderCheck)
    renderCheck = setTimeout(() => {
      if (quitting || window?.isDestroyed()) return
      const contents = window.webContents
      void contents.executeJavaScript(`(() => {
        const root = document.getElementById('root');
        return { children: root?.childElementCount || 0, fallback: Boolean(document.querySelector('[data-startup-screen]')), bridge: Boolean(window.v2tt) };
      })()`).then((result) => {
        if (!quitting) log(result.children && !result.fallback ? 'UI_RENDERED' : 'UI_RENDER_PENDING', result)
      }).catch((error) => { if (!quitting) log('UI_RENDER_CHECK_FAILED', error) })
    }, 3000)
  })
  window.webContents.on('did-fail-load', (_event, code, description) => log('RENDERER_LOAD_FAILED', { code, description }))
  window.webContents.on('render-process-gone', (_event, details) => {
    log('RENDERER_PROCESS_GONE', details)
    if (!quitting) void dialog.showMessageBox({ type: 'error', buttons: ['重新打开', '退出'], message: '界面异常退出', detail: '代理状态已记录，可重新打开界面或退出客户端。' }).then(({ response }) => response === 0 ? window.reload() : app.quit())
  })
  window.once('ready-to-show', () => { if (!hidden) showWindow() })
  window.on('close', (event) => { if (!quitting) { event.preventDefault(); window.hide() } })
  window.on('minimize', (event) => { event.preventDefault(); window.hide() })
  window.on('query-session-end', () => { quitting = true; void runtime.stop() })
  window.loadFile(entry).catch((error) => {
    if (quitting) return
    log('WINDOW_LOAD_FAILED', error)
    dialog.showErrorBox('V2TT Client 启动失败', '界面资源缺失，请重新安装。')
  })
  tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')).resize({ width: 20, height: 20 }))
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  updateTray()
}

if (single) {
  app.on('second-instance', (_event, args) => { if (!args.includes('--autostart')) showWindow() })
  app.whenReady().then(() => {
    createWindow()
    bootPromise = queue(bootstrap).catch((error) => { log('BOOT_FAILED', error); runtime.setError(error.message); showWindow() })
    powerMonitor.on('resume', () => {
      if (runtime.status().state !== 'connected' || runtime.status().mode === 'direct') return
      void queue(() => connect(settings.lastMode)).catch((error) => runtime.setError(error.message))
    })
  }).catch((error) => { log('APP_READY_FAILED', error); dialog.showErrorBox('V2TT Client 启动失败', redact(error.message)); app.exit(1) })
} else app.quit()
app.on('activate', showWindow)
app.on('window-all-closed', () => {})
app.on('child-process-gone', (_event, details) => log('CHILD_PROCESS_GONE', details))
app.on('before-quit', (event) => {
  if (quitReady || !single) return
  event.preventDefault()
  if (quitting) return
  quitting = true
  clearTimeout(recoverTimer)
  clearInterval(refreshTimer)
  clearInterval(expiryTimer)
  clearTimeout(renderCheck)
  void queue(() => runtime.stop()).catch((error) => log('QUIT_CLEANUP_FAILED', error)).finally(() => { quitReady = true; tray?.destroy(); app.quit() })
})
process.on('uncaughtException', (error) => {
  log('UNCAUGHT_EXCEPTION', error)
  if (!logErrorShown) { logErrorShown = true; dialog.showErrorBox('V2TT Client 发生异常', `${redact(error.message)}\n请提供本机 runtime/startup.log 以便排查。`) }
  app.quit()
})
process.on('unhandledRejection', (error) => { log('UNHANDLED_REJECTION', error); runtime.setError('操作发生异常，请重试或导出诊断报告') })

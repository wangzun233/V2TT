const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { buildSingBoxConfig } = require('./generated/config.cjs')
const { freePort, probe } = require('./network.cjs')
const { validateMode, assertActive, atomicWrite, redact } = require('./state.cjs')
const run = promisify(execFile)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function createRuntime({ app, directory, log, onChange, onUnexpectedExit }) {
  const binary = app.isPackaged ? path.join(process.resourcesPath, 'bin', 'sing-box.exe') : path.join(app.getAppPath(), 'resources', 'bin', 'sing-box.exe')
  const rules = app.isPackaged ? path.join(process.resourcesPath, 'rules') : path.join(app.getAppPath(), 'resources', 'rules')
  const configPath = path.join(directory, 'config.json')
  let child = null
  const stopping = new WeakSet()
  let controller = null
  let sample = null
  let failureCount = 0
  let sampleRequest = null
  let report = []
  let status = { state: 'disconnected', mode: 'smart', downloadBytes: 0, uploadBytes: 0, downloadRate: 0, uploadRate: 0, error: '' }
  const update = (next) => { status = { ...status, ...next }; onChange?.(status); return { ...status } }
  const controllerFetch = (endpoint, timeout = 1000) => fetch(`http://127.0.0.1:${controller.port}${endpoint}`, {
    headers: { Authorization: `Bearer ${controller.secret}` }, signal: AbortSignal.timeout(timeout),
  })

  async function stop() {
    const current = child
    if (current?.pid && current.exitCode === null) {
      stopping.add(current)
      await run(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(current.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => {})
      const deadline = Date.now() + 1000
      while (current.exitCode === null && Date.now() < deadline) await delay(50)
      if (current.exitCode === null) {
        stopping.delete(current)
        update({ error: '旧代理内核尚未退出，请稍后重试' })
        throw new Error('旧代理内核尚未退出，请稍后重试')
      }
      await delay(500)
    }
    child = null
    controller = null
    sample = null
    fs.rmSync(configPath, { force: true })
    return update({ state: 'disconnected', downloadRate: 0, uploadRate: 0 })
  }

  async function start(manifest, settings, mode) {
    validateMode(mode)
    if (mode !== 'direct') assertActive(manifest)
    await stop()
    report = []
    if (mode === 'direct') return update({ state: 'connected', mode, error: '', downloadBytes: 0, uploadBytes: 0 })
    update({ state: 'connecting', mode, error: '' })
    try {
      if (!fs.existsSync(binary)) throw new Error('代理内核文件缺失，请重新安装并检查安全软件的隔离记录')
      for (const name of ['geoip-cn', 'geosite-cn']) if (!fs.existsSync(path.join(rules, `${name}.srs`))) throw new Error('国内分流规则缺失，请重新安装')
      const ports = new Set()
      while (ports.size < 3) ports.add(await freePort())
      const [port, dailyPort, gamePort] = [...ports]
      controller = { port, dailyPort, gamePort, secret: crypto.randomBytes(24).toString('hex'), password: crypto.randomBytes(24).toString('hex') }
      const config = buildSingBoxConfig(manifest, { ...settings, mode, ruleSetDirectory: rules })
      config.experimental.clash_api = { external_controller: `127.0.0.1:${port}`, secret: controller.secret }
      for (const [role, listenPort, outbound] of [['daily', dailyPort, 'daily-vless'], ['game', gamePort, 'game-tuic']]) {
        config.inbounds.push({ type: 'mixed', tag: `probe-${role}`, listen: '127.0.0.1', listen_port: listenPort, users: [{ username: 'probe', password: controller.password }] })
        config.route.rules.unshift({ inbound: [`probe-${role}`], outbound })
      }
      atomicWrite(configPath, JSON.stringify(config, null, 2))
      await run(binary, ['check', '-c', configPath], { windowsHide: true, timeout: 15000, maxBuffer: 128 * 1024 })
      const startedAt = Date.now() - 1000
      const core = spawn(binary, ['run', '-c', configPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      child = core
      let recentError = ''
      core.stdout.on('data', (chunk) => log('CORE', chunk.toString('utf8')))
      core.stderr.on('data', (chunk) => { recentError = chunk.toString('utf8').slice(-1500); log('CORE', recentError) })
      core.once('error', (error) => { recentError = error.message; log('CORE_SPAWN_ERROR', error.message) })
      core.once('exit', (code) => {
        log('CORE_EXIT', { code })
        if (child !== core) return
        child = null
        controller = null
        fs.rmSync(configPath, { force: true })
        if (stopping.has(core)) return
        update({ state: 'disconnected', error: `代理内核意外退出（${code}）`, downloadRate: 0, uploadRate: 0 })
        onUnexpectedExit?.()
      })
      core.once('spawn', () => {
        // A separate watcher releases TUN if Electron is terminated unexpectedly.
        const watch = spawn(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron') : __dirname, 'watchdog.ps1'),
          '-OwnerId', String(process.pid), '-CoreId', String(core.pid), '-CoreStarted', String(startedAt), '-CorePath', binary,
        ], { windowsHide: true, stdio: 'ignore' })
        watch.on('error', (error) => log('WATCHDOG_ERROR', error.message))
        watch.unref()
      })
      const deadline = Date.now() + 12000
      let ready = false
      while (Date.now() < deadline && child === core && core.exitCode === null) {
        try { if ((await controllerFetch('/version', 600)).ok) { ready = true; break } } catch { /* Controller starts after TUN. */ }
        await delay(200)
      }
      if (!ready || child !== core) throw new Error(`代理启动失败：${redact(recentError) || '本机 TUN 或端口初始化失败'}`)
      fs.rmSync(configPath, { force: true })
      failureCount = 0
      sample = null
      return update({ state: 'connected', error: '', downloadBytes: 0, uploadBytes: 0, downloadRate: 0, uploadRate: 0 })
    } catch (error) {
      await stop().catch((stopError) => log('STOP_ERROR', stopError.message))
      const message = redact(error.stderr || error.message).slice(0, 1500)
      update({ state: child ? status.state : 'disconnected', error: message })
      throw new Error(message)
    }
  }

  async function collectTraffic() {
    if (!controller || !child || status.state !== 'connected') return { ...status }
    const current = child
    try {
      const response = await controllerFetch('/connections')
      if (!response.ok) throw new Error(`控制器 HTTP ${response.status}`)
      const data = await response.json()
      if (child !== current) return { ...status }
      const downloadBytes = Math.max(0, Number(data.downloadTotal) || 0)
      const uploadBytes = Math.max(0, Number(data.uploadTotal) || 0)
      const now = performance.now()
      const elapsed = sample ? (now - sample.time) / 1000 : 0
      const rates = elapsed > 0 ? { downloadRate: Math.max(0, (downloadBytes - sample.down) / elapsed), uploadRate: Math.max(0, (uploadBytes - sample.up) / elapsed) } : { downloadRate: 0, uploadRate: 0 }
      sample = { time: now, down: downloadBytes, up: uploadBytes }
      failureCount = 0
      return update({ downloadBytes, uploadBytes, ...rates, error: '' })
    } catch {
      if (child !== current) return { ...status }
      failureCount += 1
      return update({ downloadRate: 0, uploadRate: 0, error: failureCount >= 3 ? '无法读取内核状态，请断开后重新连接' : status.error })
    }
  }

  async function testNode(id) {
    if (!controller || !child || status.state !== 'connected') return { id, name: id === 'vless' ? '日常线路' : '游戏线路', status: 'idle', detail: '请先连接代理线路' }
    const endpoint = id === 'vless' ? controller.dailyPort : controller.gamePort
    try {
      const result = await probe('https://www.gstatic.com/generate_204', endpoint, controller.password)
      return { id, name: id === 'vless' ? '日常线路' : '游戏线路', status: result.httpStatus === 204 ? 'success' : 'warning',
        detail: `${id === 'vless' ? 'VLESS' : 'TUIC'} 实际出口 HTTP ${result.httpStatus}`, ...result }
    } catch (error) { return { id, name: id === 'vless' ? '日常线路' : '游戏线路', status: 'error', detail: redact(error.message) } }
  }

  return {
    start, stop, testNode,
    status: () => ({ ...status }),
    setMode: (mode) => update({ mode }),
    setError: (error) => update({ error }),
    report: () => report,
    async traffic() {
      if (!sampleRequest) sampleRequest = collectTraffic().finally(() => { sampleRequest = null })
      return sampleRequest
    },
    async diagnose(manifest, source) {
      const results = [{ id: 'manifest', name: '订阅与账号', status: 'success', detail: source === 'remote' ? '订阅验证有效' : '当前使用本机加密缓存' }]
      try { assertActive(manifest) } catch (error) { results[0] = { ...results[0], status: 'error', detail: error.message } }
      results.push(...await Promise.all(['vless', 'tuic'].map(testNode)))
      for (const [id, name, url] of [['chatgpt', 'ChatGPT 网页', 'https://chatgpt.com/'], ['codex', 'OpenAI API 连通性', 'https://api.openai.com/v1/models']]) {
        if (!controller || !child) { results.push({ id, name, status: 'idle', detail: '请先连接代理线路' }); continue }
        try {
          const result = await probe(url, controller.dailyPort, controller.password)
          const reachable = result.httpStatus < 400 || (id === 'codex' && result.httpStatus === 401)
          results.push({ id, name, status: reachable ? 'success' : 'warning', ...result,
            detail: id === 'codex' && result.httpStatus === 401 ? 'API TLS 可达，未登录测试不代表 Codex 会话可用' : `VLESS 出口 HTTP ${result.httpStatus}${result.httpStatus === 403 ? '，目标站拒绝访问' : ''}` })
        } catch (error) { results.push({ id, name, status: 'error', detail: redact(error.message) }) }
      }
      report = results
      return results
    },
  }
}

module.exports = { createRuntime }

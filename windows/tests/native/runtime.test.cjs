const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { DEFAULT_SETTINGS } = require('../../electron/state.cjs')
const { manifest } = require('./fixture.cjs')

// Exercise the real bundled core without creating TUN or changing host routes.
const generator = require('../../electron/generated/config.cjs')
const originalBuild = generator.buildSingBoxConfig
generator.buildSingBoxConfig = (...args) => {
  const config = originalBuild(...args)
  config.inbounds = []
  return config
}
let core
const watchers = []
const originalSpawn = childProcess.spawn
childProcess.spawn = (...args) => {
  const process = originalSpawn(...args)
  if (args[0].endsWith('sing-box.exe')) core = process
  else watchers.push(process)
  return process
}
const { createRuntime } = require('../../electron/runtime.cjs')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('watchdog cleans up its designated child after owner death without killing another process', async () => {
  const started = Date.now() - 1000
  const owner = originalSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
  const target = originalSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
  const unrelated = originalSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' })
  const watcher = originalSpawn(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('electron/watchdog.ps1'),
    '-OwnerId', String(owner.pid), '-CoreId', String(target.pid), '-CoreStarted', String(started), '-CorePath', process.execPath,
  ], { windowsHide: true, stdio: 'ignore' })
  try {
    await wait(1500)
    assert.equal(watcher.exitCode, null)
    owner.kill()
    for (let i = 0; i < 100 && target.exitCode === null; i++) await wait(50)
    assert.notEqual(target.exitCode, null)
    assert.equal(unrelated.exitCode, null)
  } finally {
    for (const child of [owner, target, unrelated, watcher]) if (child.exitCode === null) child.kill()
    await wait(100)
  }
})

test('real core uses authenticated random ports, deletes plaintext, and stops only its owned process', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'v2tt-runtime-test-'))
  let unexpected = 0
  const runtime = createRuntime({ app: { isPackaged: false, getAppPath: () => path.resolve('.') }, directory,
    log: () => {}, onUnexpectedExit: () => { unexpected += 1 } })
  try {
    const starting = runtime.start(manifest, DEFAULT_SETTINGS, 'smart')
    let config
    for (let i = 0; i < 200 && !config; i++) {
      try { config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')) } catch { await wait(10) }
    }
    const status = await starting
    assert.equal(status.state, 'connected')
    assert.equal(fs.existsSync(path.join(directory, 'config.json')), false)
    assert.ok(config)
    assert.ok(!config.inbounds.some((inbound) => inbound.type === 'tun'))
    const controller = config.experimental.clash_api
    assert.notEqual(controller.secret, 'v2tt-client-local')
    const api = `http://${controller.external_controller}/version`
    assert.equal((await fetch(api)).status, 401)
    assert.equal((await fetch(api, { headers: { Authorization: `Bearer ${controller.secret}` } })).status, 200)
    assert.equal((await runtime.traffic()).downloadBytes, 0)
    const firstCore = core
    await runtime.stop()
    assert.notEqual(firstCore.exitCode, null)
    assert.equal(runtime.status().state, 'disconnected')
    assert.equal(unexpected, 0)
    await runtime.start(manifest, DEFAULT_SETTINGS, 'fast')
    core.kill()
    for (let i = 0; i < 100 && !unexpected; i++) await wait(30)
    assert.equal(unexpected, 1)
    assert.equal(runtime.status().state, 'disconnected')
    assert.equal(fs.existsSync(path.join(directory, 'config.json')), false)
  } finally {
    await runtime.stop()
    for (const watcher of watchers) {
      for (let i = 0; i < 50 && watcher.exitCode === null; i++) await wait(50)
      if (watcher.exitCode === null) watcher.kill()
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

const https = require('node:https')
const crypto = require('node:crypto')
const { HttpsProxyAgent } = require('https-proxy-agent')
const CAP = 128 * 1024 * 1024
function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return { median: ordered.length ? (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2 : null,
    jitter: values.length > 1 ? values.slice(1).reduce((s, v, i) => s + Math.abs(v - values[i]), 0) / (values.length - 1) : null }
}
function createMeasurement() {
  let state = { phase: 'idle', running: false, bytes: 0 }
  let abort = null
  const tasks = new Set()
  function cancel() { abort?.abort(); for (const req of tasks) req.destroy() }
  async function start(options) {
    if (state.running) throw new Error('已有测速正在运行')
    state = { phase: 'latency', running: true, bytes: 0, id: options.id, kind: options.kind }
    abort = new AbortController()
    const signal = abort.signal
    const proxy = new URL(`http://127.0.0.1:${options.port}`)
    proxy.username = 'probe'
    proxy.password = options.password
    const agent = new HttpsProxyAgent(proxy, { keepAlive: true, maxSockets: 4 })
    let phaseSignal = signal
    function request(action, payload, onData) {
      return new Promise((resolve, reject) => {
        const req = https.request({ hostname: options.hostname, port: 443, servername: options.servername, agent,
          path: `/_v2tt/measure/v1/${action}?nonce=${crypto.randomBytes(8).toString('hex')}`,
          method: payload ? 'POST' : 'GET', signal: phaseSignal,
          headers: { Host: options.servername, Authorization: `Bearer ${options.token}`, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', ...(payload ? { 'Content-Length': payload.length, 'Content-Type': 'application/octet-stream' } : {}) },
        }, (res) => {
          if (res.statusCode !== (action === 'ping' ? 204 : 200) || res.headers['x-v2tt-measure'] !== '1' || res.headers['content-encoding'] || (action === 'download' && Number(res.headers['content-length']) !== 16 * 1024 * 1024)) {
            req.destroy(new Error(`测速端点不可用（HTTP ${res.statusCode}）`)); return
          }
          let received = 0; const chunks = []
          res.on('data', (chunk) => {
            received += chunk.length
            if (action === 'download' && received > 16 * 1024 * 1024) { req.destroy(new Error('测速响应超出限制')); return }
            if (onData) onData(chunk.length)
            else if (received <= 4096) chunks.push(chunk)
            else req.destroy(new Error('测速响应无效'))
          })
          res.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          res.once('error', reject)
        })
        tasks.add(req)
        const timeout = setTimeout(() => req.destroy(new Error('测速连接超时')), 12000)
        req.once('close', () => { tasks.delete(req); clearTimeout(timeout) })
        req.once('error', reject)
        req.setTimeout(10000, () => req.destroy(new Error('测速连接超时')))
        req.end(payload)
      })
    }
    try {
      const samples = []; let failures = 0
      for (let i = 0; i < 5; i++) {
        if (signal.aborted) throw new Error('已停止')
        const start = performance.now()
        try { await request('ping'); samples.push(Math.round(performance.now() - start)) } catch (error) { if (signal.aborted) throw error; failures++ }
        state = { ...state, latency: { ...summarize(samples), failures, attempts: i + 1 } }
      }
      if (!samples.length) throw new Error('无法访问服务器测速端点，请确认已部署并连接节点')
      if (options.kind === 'speed') {
        for (const phase of ['download', 'upload']) {
          const phaseAbort = new AbortController()
          phaseSignal = AbortSignal.any([signal, phaseAbort.signal])
          const started = performance.now(); let bytes = 0; let reserved = 0; let priorBytes = 0; let priorTime = started; let peak = null
          const tick = () => {
            const now = performance.now(); const rate = (bytes - priorBytes) * 8 / ((now - priorTime) / 1000) / 1e6
            if (now - priorTime >= 900) peak = Math.max(peak || 0, rate)
            state = { ...state, phase, [phase]: { mbps: bytes * 8 / Math.max(.001, (now - started) / 1000) / 1e6, peakMbps: peak, bytes }, bytes: bytes + (phase === 'upload' ? (state.download?.bytes || 0) : 0) }
            priorBytes = bytes; priorTime = now
          }
          state = { ...state, phase }
          const deadline = setTimeout(() => phaseAbort.abort(), 10000)
          const ticker = setInterval(tick, 1000)
          try {
            const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
              let size = 256 * 1024
              while (!phaseSignal.aborted && reserved < CAP) {
                const count = Math.min(phase === 'download' ? 16 * 1024 * 1024 : size, CAP - reserved)
                reserved += count
                const begun = performance.now()
                try {
                  if (phase === 'download') await request('download', null, (n) => { bytes += n })
                  else {
                    const reply = JSON.parse(await request('upload', crypto.randomBytes(count)))
                    if (reply.received !== count) throw new Error('服务器上传确认无效')
                    bytes += count
                    size = Math.min(8 * 1024 * 1024, Math.max(64 * 1024, Math.round(count * 1000 / Math.max(1, performance.now() - begun))))
                  }
                } catch (error) { if (!phaseSignal.aborted) { phaseAbort.abort(); throw error } }
              }
            }))
            const failed = results.find((result) => result.status === 'rejected')
            if (failed) throw failed.reason
          } finally { clearTimeout(deadline); clearInterval(ticker); phaseAbort.abort(); tick() }
          if (signal.aborted) throw new Error('已停止')
          if (!bytes) throw new Error('没有收到有效测速数据')
        }
      }
      state = { ...state, phase: 'complete', running: false }
    } catch (error) { state = { ...state, running: false, phase: signal.aborted ? 'cancelled' : 'error', error: signal.aborted ? '已停止' : error.message } }
    finally { cancel(); agent.destroy(); abort = null }
    return state
  }
  return { start, cancel, status: () => structuredClone(state) }
}
module.exports = { createMeasurement, summarize }

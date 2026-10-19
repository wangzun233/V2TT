const dns = require('node:dns').promises
const { probe } = require('./network.cjs')

async function checkDns(signal) {
  // This UDP request must traverse TUN and its DNS hijack, not the OS cache.
  const resolver = new dns.Resolver({ timeout: 4000, tries: 1 })
  resolver.setServers(['1.1.1.1'])
  const cancel = () => resolver.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    return (await resolver.resolve4('example.com')).length > 0
  } finally { signal.removeEventListener('abort', cancel) }
}

async function sampleHealth({ control, port, password, signal, dnsProbe = checkDns, httpProbe = probe }) {
  const reachable = async (operation) => {
    try { return Boolean(await operation()) } catch { return false }
  }
  const [controller, dnsOk, primary] = await Promise.all([
    reachable(control),
    reachable(() => dnsProbe(signal)),
    reachable(() => httpProbe('https://www.gstatic.com/generate_204', undefined, undefined, signal)),
  ])
  signal.throwIfAborted()
  // An HTTP rejection still proves TLS/transport reachability; it is not an outage.
  const [web, explicit] = primary && controller && dnsOk ? [true, null] : await Promise.all([
    primary ? Promise.resolve(true) : reachable(() => httpProbe('https://www.cloudflare.com/cdn-cgi/trace', undefined, undefined, signal)),
    reachable(() => httpProbe('https://1.1.1.1/cdn-cgi/trace', port, password, signal)),
  ])
  const healthy = controller && dnsOk && web
  const proxy = healthy ? null : explicit
  signal.throwIfAborted()
  return { healthy, controller, dns: dnsOk, web, proxy }
}

function createHealthMonitor({ sample, onSample, onFailure, interval = 30000, retryInterval = 5000, threshold = 3, now = Date.now, maxSampleGap = 90000 }) {
  let stopped = false
  let timer
  let failures = 0
  let notified = false
  let busy = false
  let lastSample = null
  const abort = new AbortController()
  async function tick() {
    if (stopped || busy) return
    clearTimeout(timer)
    busy = true
    try {
      const result = await sample(abort.signal)
      if (stopped) return
      const time = now()
      // Sleep/resume or a stalled probe must not carry stale failures into recovery.
      if (lastSample !== null && (time < lastSample || time - lastSample > maxSampleGap)) {
        failures = 0
        notified = false
      }
      lastSample = time
      failures = result.healthy ? 0 : failures + 1
      if (result.healthy) notified = false
      onSample({ ...result, failures })
      if (failures >= threshold && !notified) {
        notified = true
        onFailure(result)
      }
    } catch {
      // A probe implementation failure is not evidence of network failure.
    } finally {
      busy = false
      if (!stopped) { timer = setTimeout(tick, failures > 0 && !notified ? retryInterval : interval); timer.unref?.() }
    }
  }
  timer = setTimeout(tick, interval)
  timer.unref?.()
  return { tick, stop() { stopped = true; clearTimeout(timer); abort.abort() } }
}

function allowsHealthRecovery(mode) { return mode !== 'game' }

function createRecoveryBudget({ now = Date.now, limit = 2, healthyWindow = 600000, maxSampleGap = 90000 } = {}) {
  let attempts = 0, healthySince = null, lastSample = null
  return {
    reset() { attempts = 0; healthySince = null; lastSample = null },
    used: () => attempts,
    exhausted: () => attempts >= limit,
    consume() { if (attempts >= limit) return false; attempts++; healthySince = null; return true },
    observe(healthy) {
      const time = now()
      if (!healthy) healthySince = null
      else if (healthySince === null || lastSample === null || time - lastSample > maxSampleGap || time < lastSample) healthySince = time
      lastSample = time
      if (healthy && attempts > 0 && time - healthySince >= healthyWindow) {
        attempts = 0
        return true
      }
      return false
    },
  }
}

module.exports = { createHealthMonitor, sampleHealth, allowsHealthRecovery, createRecoveryBudget }

const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')

const MODES = ['smart', 'fast', 'global', 'direct']
const DEFAULT_RULES = [
  { id: 'steam', name: 'Steam', executable: 'steam.exe', target: 'game', enabled: true },
  { id: 'codex', name: 'Codex', executable: 'Codex.exe', target: 'daily', enabled: true },
]
const DEFAULT_SETTINGS = { autoConnect: true, strictRoute: true, ipv6: false, lastMode: 'smart', appRules: DEFAULT_RULES }
const MAX_BYTES = 256 * 1024

function text(value, field, limit = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`订阅字段无效：${field}`)
  }
  return value
}

function host(value, field) {
  text(value, field, 253)
  if (!net.isIP(value) && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value)) throw new Error(`服务器地址无效：${field}`)
  return value
}

function validateMode(value) {
  if (!MODES.includes(value)) throw new Error('代理模式无效')
  return value
}

function validateRules(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('应用规则最多允许 100 条')
  const names = new Set()
  const ids = new Set()
  return value.map((rule) => {
    const id = text(rule?.id, '规则 ID', 80)
    const name = text(rule?.name, '应用名称', 100)
    const executable = text(rule?.executable, '执行文件', 240)
    if (/[\\/:*?"<>|]/.test(executable) || !/\.exe$/i.test(executable)) throw new Error('请选择有效的 Windows EXE 文件名')
    if (ids.has(id) || names.has(executable.toLowerCase())) throw new Error('同一应用不能重复添加规则')
    if (!['daily', 'game', 'direct'].includes(rule.target) || typeof rule.enabled !== 'boolean') throw new Error('应用规则参数无效')
    ids.add(id)
    names.add(executable.toLowerCase())
    return { id, name, executable, target: rule.target, enabled: rule.enabled }
  })
}

function normalizeSettings(value) {
  const result = structuredClone(DEFAULT_SETTINGS)
  if (!value || typeof value !== 'object') return result
  for (const key of ['autoConnect', 'strictRoute', 'ipv6']) if (typeof value[key] === 'boolean') result[key] = value[key]
  if (MODES.includes(value.lastMode)) result.lastMode = value.lastMode
  if (value.appRules !== undefined) result.appRules = validateRules(value.appRules)
  return result
}

function validateSubscriptionUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('请输入有效的订阅链接')
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('订阅链接格式不正确') }
  if (url.protocol !== 'https:') throw new Error('订阅链接必须使用 HTTPS')
  if (url.username || url.password) throw new Error('订阅链接不能包含网址登录凭据')
  url.hash = ''
  return url.href
}

function validateManifest(value) {
  if (value?.schema_version !== 1 || !Array.isArray(value.nodes) || value.nodes.length !== 2) {
    throw new Error('请使用 V2TT Client 专属订阅；需要一条 VLESS 和一条 TUIC 线路')
  }
  const profile = value.profile
  text(profile?.id, '账号 ID', 80)
  text(profile?.name, '账号名称', 100)
  if (profile.expires_at !== null && (typeof profile.expires_at !== 'string' || !Number.isFinite(Date.parse(profile.expires_at)))) throw new Error('账号到期时间无效')
  const nodes = value.nodes.map((node) => {
    const base = {
      id: text(node?.id, '节点 ID', 80), name: text(node?.name, '节点名称', 100),
      server: host(node?.server, 'server'), server_port: node.server_port,
      uuid: text(node?.uuid, 'UUID', 36),
    }
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(base.uuid)) throw new Error('节点 UUID 无效')
    if (!Number.isInteger(base.server_port) || base.server_port < 1 || base.server_port > 65535) throw new Error('节点端口无效')
    if (node.tls?.enabled !== true) throw new Error('节点必须启用 TLS')
    const tls = { enabled: true, server_name: host(node.tls.server_name, 'TLS server_name') }
    if (node.type === 'vless' && node.role === 'daily') {
      if (node.transport?.type !== 'ws') throw new Error('日常线路必须使用 WebSocket')
      const wsPath = text(node.transport.path, 'WebSocket path', 2048)
      if (!wsPath.startsWith('/')) throw new Error('WebSocket 路径必须以 / 开头')
      return { ...base, type: 'vless', role: 'daily', tls, transport: { type: 'ws', path: wsPath, host: host(node.transport.host, 'WebSocket host') } }
    }
    if (node.type === 'tuic' && node.role === 'game') {
      if (!['bbr', 'cubic', 'new_reno'].includes(node.congestion_control) || !['native', 'quic'].includes(node.udp_relay_mode)) throw new Error('TUIC 参数无效')
      if (!Array.isArray(node.tls.alpn) || node.tls.alpn.length > 8) throw new Error('TUIC ALPN 无效')
      return { ...base, type: 'tuic', role: 'game', password: text(node.password, 'TUIC 密码', 256),
        congestion_control: node.congestion_control, udp_relay_mode: node.udp_relay_mode,
        tls: { ...tls, alpn: node.tls.alpn.map((a) => text(a, 'ALPN', 30)) } }
    }
    throw new Error('不支持的节点协议或角色')
  })
  const routing = value.routing
  if (new Set(nodes.map((n) => n.id)).size !== 2 || !nodes.some((n) => n.type === 'vless' && n.id === routing?.daily_node) || !nodes.some((n) => n.type === 'tuic' && n.id === routing?.game_node)) throw new Error('订阅中的线路引用无效')
  return {
    schema_version: 1, generated_at: typeof value.generated_at === 'string' ? value.generated_at : '',
    profile: { id: profile.id, name: profile.name, expires_at: profile.expires_at, update_interval_hours: Math.min(24, Math.max(1, Number(profile.update_interval_hours) || 24)) },
    routing: { default_mode: validateMode(routing.default_mode), daily_node: routing.daily_node, game_node: routing.game_node }, nodes,
  }
}

function assertActive(manifest, now = Date.now()) {
  if (manifest.profile.expires_at && Date.parse(manifest.profile.expires_at) <= now) throw new Error('账号已到期，请联系管理员续期后更新订阅')
}

function redact(value) {
  return String(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, '[UUID]')
    .replace(/((?:password|secret|token|authorization)\s*[=:]\s*)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
}

function publicManifest(manifest) {
  const result = structuredClone(manifest)
  for (const node of result.nodes) {
    node.uuid = '[REDACTED]'
    if (node.password) node.password = '[REDACTED]'
    if (node.transport) node.transport.path = '/[REDACTED]'
  }
  return result
}

function atomicWrite(target, data) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const pending = `${target}.pending`
  try {
    fs.writeFileSync(pending, data, { mode: 0o600 })
    fs.renameSync(pending, target)
  } finally { fs.rmSync(pending, { force: true }) }
}

async function readBounded(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('订阅内容过大') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('订阅返回空内容')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('订阅内容过大')
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function createQueue() {
  let tail = Promise.resolve()
  return (action) => {
    const operation = tail.then(action)
    tail = operation.catch(() => {})
    return operation
  }
}

module.exports = { DEFAULT_SETTINGS, MAX_BYTES, validateMode, validateRules, normalizeSettings, validateSubscriptionUrl,
  validateManifest, assertActive, redact, publicManifest, atomicWrite, readBounded, createQueue }

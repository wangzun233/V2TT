const sensitiveKey = /^(?:password|passwd|secret|token|accessToken|refreshToken|apiKey|authorization|proxyAuthorization|cookie|setCookie|uuid|subscriptionUrl|privateKey)$/i
const field = '(?:password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|private[_-]?key)'
const assignment = new RegExp(`(\\b${field}["']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^\\s,;}]+)`, 'gi')

function sanitizeText(value, depth) {
  let text = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  if (depth < 12 && /^[\s]*[\[{]/.test(text)) {
    try { return JSON.stringify(sanitize(JSON.parse(text), depth + 1)) } catch { /* Partial log records use the text filters below. */ }
  }
  if (depth < 12 && text.includes('\n')) return text.split('\n').map(line => sanitizeText(line, depth + 1)).join('\n')
  return text
    .replace(/\b(?:https?|vless|vmess|trojan|tuic|hysteria2?|hy2|ssr?|socks5?):\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/\b(?:https?|vless|vmess|trojan|tuic|hysteria2?|hy2|ssr?)%3a%2f%2f[^\s"'<>]+/gi, '[URL]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, '[REDACTED]')
    .replace(assignment, '$1[REDACTED]')
    .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, '[UUID]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\b[A-Z]:[\\/][^\r\n"<>|]+/gi, '[PATH]')
    .replace(/\\\\[^\s\\]+\\[^\r\n"<>|]+/g, '[PATH]')
    .replace(/\/(?:home|Users|root)\/[^\s"'<>]+/g, '[PATH]')
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 12) return '[TRUNCATED]'
  if (typeof value === 'string') return sanitizeText(value, depth)
  if (value instanceof Error) return sanitizeText(value.message, depth)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  const result = Array.isArray(value)
    ? value.map(item => sanitize(item, depth + 1, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, sensitiveKey.test(key.replace(/[_-]/g, '')) ? '[REDACTED]' : sanitize(item, depth + 1, seen),
    ]))
  seen.delete(value)
  return result
}

function redact(value) {
  const safe = sanitize(value)
  return typeof safe === 'string' ? safe : JSON.stringify(safe) ?? String(safe)
}

module.exports = { redact, sanitize }

const FEED = 'https://raw.githubusercontent.com/wangzun233/V2TT/main/updates/stable.json'
const PREFIX = 'https://github.com/wangzun233/V2TT/releases/tag/'
function version(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.test(value)) throw new Error('更新版本格式无效')
  return value.split('.').map(Number)
}
function newer(next, current) {
  const a = version(next), b = version(current)
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] }
  return false
}
function parseUpdate(text, current) {
  const feed = JSON.parse(text)
  if (feed.schema !== 1) throw new Error('更新信息格式不受支持')
  const item = feed.windows
  version(item?.version)
  if (typeof item.releaseUrl !== 'string' || !item.releaseUrl.startsWith(PREFIX) ||
      !/^[A-Za-z0-9._-]+$/.test(item.releaseUrl.slice(PREFIX.length))) throw new Error('更新链接不属于 V2TT 官方仓库')
  if (!newer(item.version, current)) return null
  return { version: item.version, releaseUrl: item.releaseUrl }
}
async function checkUpdate(fetcher, current) {
  const response = await fetcher(FEED, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`更新服务暂不可用（HTTP ${response.status}）`) }
  const reader = response.body.getReader()
  const chunks = []; let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16384) throw new Error('更新信息过大')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return parseUpdate(Buffer.concat(chunks).toString('utf8'), current)
}
module.exports = { FEED, newer, parseUpdate, checkUpdate }

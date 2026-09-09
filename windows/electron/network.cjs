const https = require('node:https')
const net = require('node:net')
const { HttpsProxyAgent } = require('https-proxy-agent')

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function probe(url, port, password) {
  const agent = new HttpsProxyAgent(`http://probe:${password}@127.0.0.1:${port}`)
  return new Promise((resolve, reject) => {
    const started = performance.now()
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      request.destroy()
      agent.destroy()
      if (error) reject(error)
      else resolve(result)
    }
    const request = https.get(url, { agent, headers: { 'User-Agent': 'V2TT-Client-Diagnostics', 'Accept': '*/*' } }, (response) => {
      const status = response.statusCode
      response.destroy()
      finish(null, { httpStatus: status, latency: Math.round(performance.now() - started) })
    })
    const timer = setTimeout(() => finish(new Error('连接超时（10 秒）')), 10000)
    request.once('error', (error) => finish(error))
  })
}

module.exports = { freePort, probe }

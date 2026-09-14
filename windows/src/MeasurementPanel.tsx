import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Gauge, Play, Square } from 'lucide-react'

export interface MeasurementStatus {
  phase: string
  running: boolean
  bytes: number
  id?: 'direct' | 'vless' | 'tuic'
  error?: string
  latency?: { median: number | null; jitter: number | null; failures: number; attempts: number }
  download?: { mbps: number; peakMbps: number | null; bytes: number }
  upload?: { mbps: number; peakMbps: number | null; bytes: number }
}
const phases: Record<string, string> = { idle: '未测试', latency: '测量延迟', download: '下载中', upload: '上传中', complete: '完成', cancelled: '已停止', error: '测试失败' }
const display = (value: number | null | undefined, unit: string) => value == null ? '--' : `${value.toFixed(1)} ${unit}`

export function MeasurementPanel() {
  const [route, setRoute] = useState<'direct' | 'vless' | 'tuic'>('vless')
  const [result, setResult] = useState<MeasurementStatus>({ phase: 'idle', running: false, bytes: 0 })
  const [confirm, setConfirm] = useState(false)
  const localFailure = useRef(false)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { const value = await window.v2tt?.measurementStatus(); if (!disposed && !localFailure.current && value && value.phase !== 'idle') setResult(value) } catch { /* A start error remains visible. */ }
      if (!disposed) timer = setTimeout(poll, 500)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer); void window.v2tt?.cancelMeasurement() }
  }, [])
  async function start(kind: 'latency' | 'speed') {
    setConfirm(false)
    localFailure.current = false
    setResult({ phase: 'latency', running: true, bytes: 0 })
    try {
      if (!window.v2tt) throw new Error('请在桌面客户端连接节点后测试')
      setResult(await window.v2tt.startMeasurement({ id: route, kind }))
    } catch (error) { localFailure.current = true; setResult({ phase: 'error', running: false, bytes: 0, error: error instanceof Error ? error.message : '测试失败' }) }
  }
  return <section className="measurement-section" aria-label="服务器测速">
    <div className="panel-heading"><h2>服务器测速</h2><span role="status">{phases[result.phase] || result.phase}</span></div>
    <div className="measurement-controls">
      <label>测试线路 <select aria-label="测试线路" value={route} disabled={result.running} onChange={(event) => setRoute(event.target.value as typeof route)}><option value="direct">直连服务器</option><option value="vless">VLESS</option><option value="tuic">TUIC</option></select></label>
      <button className="secondary-button" disabled={result.running} onClick={() => void start('latency')}><Gauge />测延迟</button>
      <button className="primary-button" disabled={result.running} onClick={() => setConfirm(true)}><Play />测速度</button>
      {result.running && <button className="secondary-button" onClick={() => void window.v2tt?.cancelMeasurement()}><Square />停止</button>}
    </div>
    {confirm && <div className="measurement-confirm" role="alert"><p>本次下载和上传各最多 128 MiB，计入服务器流量，可能影响正在进行的游戏或通话。</p><button className="primary-button" onClick={() => void start('speed')}><Play />开始测速</button><button className="secondary-button" onClick={() => setConfirm(false)}>取消</button></div>}
    <dl className="measurement-results">
      <div><dt>HTTPS 延迟中位数</dt><dd>{display(result.latency?.median, 'ms')}</dd></div>
      <div><dt>延迟波动</dt><dd>{display(result.latency?.jitter, 'ms')}</dd></div>
      <div><dt><ArrowDown />下载平均 / 峰值</dt><dd>{display(result.download?.mbps, 'Mbps')} / {display(result.download?.peakMbps, 'Mbps')}</dd></div>
      <div><dt><ArrowUp />上传平均 / 峰值</dt><dd>{display(result.upload?.mbps, 'Mbps')} / {display(result.upload?.peakMbps, 'Mbps')}</dd></div>
    </dl>
    <small>{result.id ? `结果线路：${result.id === 'direct' ? '直连' : result.id.toUpperCase()} · ` : ''}已确认传输 {(result.bytes / 1048576).toFixed(2)} MiB{result.latency ? ` · 请求失败 ${result.latency.failures}/${result.latency.attempts}` : ''}</small>
    {result.error && <p role="alert" className="subscription-error">{result.error}</p>}
  </section>
}

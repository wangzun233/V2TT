import {
  Activity, AppWindow, ArrowDown, ArrowUp, Check, ChevronRight, CircleAlert,
  CircleHelp, Cloud, Eye, EyeOff, FileDown, Gauge, Globe2, Laptop, Link2, Play,
  Plus, Power, RadioTower, RefreshCw, Route, Server, Settings, ShieldCheck,
  SlidersHorizontal, Trash2, Zap,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import './App.css'
import { fallbackManifest } from './data/fallbackManifest'
import { buildSingBoxConfig } from './lib/singBoxConfig'
import { loadManifest } from './services/controlPlane'
import { desktopBridge } from './services/desktopBridge'
import type { ClientSettings, DesktopStatus, SubscriptionStatus } from './services/desktopBridge'
import type { AppRule, ConnectionState, DeviceManifest, DiagnosticItem, RouteMode, RouteTarget } from './types'

type ViewId = 'connection' | 'rules' | 'lines' | 'diagnostics' | 'settings'
type BooleanSettingKey = 'startup' | 'autoConnect' | 'strictRoute' | 'ipv6'

const appVersion = '0.2.1'

const navItems = [
  { id: 'connection' as const, label: '连接', icon: RadioTower },
  { id: 'rules' as const, label: '应用规则', icon: AppWindow },
  { id: 'lines' as const, label: '线路', icon: Route },
  { id: 'diagnostics' as const, label: '诊断', icon: Activity },
  { id: 'settings' as const, label: '设置', icon: Settings },
]

const initialRules: AppRule[] = [
  { id: 'steam', name: 'Steam', executable: 'steam.exe', target: 'game', enabled: true },
  { id: 'codex', name: 'Codex', executable: 'Codex.exe', target: 'daily', enabled: true },
]

const initialDiagnostics: DiagnosticItem[] = [
  { id: 'manifest', name: '订阅与账号', detail: '等待检查设备清单', status: 'idle' },
  { id: 'vless', name: '日常线路', detail: 'VLESS / WebSocket / CDN', status: 'idle' },
  { id: 'tuic', name: '游戏线路', detail: 'TUIC / UDP 443', status: 'idle' },
  { id: 'chatgpt', name: 'ChatGPT 网页', detail: '独立检查目标站可用性', status: 'idle' },
  { id: 'codex', name: 'OpenAI API 连通性', detail: '未登录 API 连通性测试', status: 'idle' },
]

const modeLabels: Record<RouteMode, string> = { smart: '智能', fast: '极速', global: '全局', direct: '直连' }
const targetLabels: Record<RouteTarget, string> = { daily: '日常线路', game: '游戏线路', direct: '直连' }
function chartPath(values: number[], width: number, height: number, max: number) {
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - (value / Math.max(max, 1)) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatRate(bytesPerSecond: number) {
  const bitsPerSecond = bytesPerSecond * 8
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
  return `${(bitsPerSecond / 1_000).toFixed(0)} Kbps`
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" className={`toggle ${checked ? 'is-on' : ''}`} onClick={onChange} disabled={disabled} aria-pressed={checked} aria-label={label}><span /></button>
}

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span /><span /></div>
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  return error.message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
    .replace(/^Error:\s*/, '') || fallback
}

function expiryLabel(expiresAt: string | null) {
  if (!expiresAt) return '无到期时间'
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return `到期 ${expiresAt}`
  return `到期 ${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)}`
}

function SubscriptionInput({ value, onChange, disabled, label = '订阅链接' }: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  label?: string
}) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()
  return (
    <div className="subscription-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="subscription-input">
        <Link2 />
        <input
          id={inputId}
          type={visible ? 'url' : 'password'}
          value={value}
          disabled={disabled}
          placeholder="https://.../api/v1/device/..."
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? '隐藏订阅链接' : '显示订阅链接'} title={visible ? '隐藏订阅链接' : '显示订阅链接'}>
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </div>
  )
}

function SubscriptionSetup({ initialUrl, busy, error, onSubmit }: {
  initialUrl: string
  busy: boolean
  error: string
  onSubmit: (url: string) => void
}) {
  const [url, setUrl] = useState(initialUrl)
  return (
    <div className="subscription-shell">
      <header className="subscription-brand"><BrandMark /><span>V2TT <b>Client</b></span></header>
      <main className="subscription-setup">
        <span className="eyebrow">设备配置</span>
        <h1>{initialUrl ? '重新验证订阅' : '导入你的订阅'}</h1>
        <p>每台设备使用自己的订阅链接。验证成功后，线路和账号信息会加密保存在这台电脑。</p>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(url) }}>
          <SubscriptionInput value={url} onChange={setUrl} disabled={busy} />
          {error && <div className="subscription-error" role="alert"><CircleAlert />{error}</div>}
          <button type="submit" className="primary-button subscription-submit" disabled={busy || !url.trim()}>
            {busy ? <RefreshCw className="spin" /> : <ShieldCheck />}
            {busy ? '正在验证' : '验证并导入'}
          </button>
        </form>
        <div className="subscription-safety"><ShieldCheck /><span><strong>本机加密保存</strong><small>链接不会显示在界面日志中，切换订阅会先断开旧连接。</small></span></div>
      </main>
      <footer>V2TT Client · v{appVersion}</footer>
    </div>
  )
}

function ConnectionView({ state, mode, manifest, manifestSource, diagnostics, traffic, downloadHistory, uploadHistory, connectionError, onToggleConnection, onModeChange, onRunDiagnostics, onOpenRules }: {
  state: ConnectionState
  mode: RouteMode
  manifest: DeviceManifest
  manifestSource: 'remote' | 'cache'
  diagnostics: DiagnosticItem[]
  traffic: Pick<DesktopStatus, 'downloadBytes' | 'uploadBytes' | 'downloadRate' | 'uploadRate'>
  downloadHistory: number[]
  uploadHistory: number[]
  connectionError: string
  onToggleConnection: () => void
  onModeChange: (mode: RouteMode) => void
  onRunDiagnostics: () => void
  onOpenRules: () => void
}) {
  const connected = state === 'connected'
  const daily = manifest.nodes.find((node) => node.role === 'daily')
  const game = manifest.nodes.find((node) => node.role === 'game')
  const health = diagnostics.filter((item) => item.status !== 'idle').slice(0, 4)
  const chartMax = Math.max(...downloadHistory, ...uploadHistory, 125_000)
  const axisMaxMbps = Math.max(1, Math.ceil((chartMax * 8) / 1_000_000))
  const defaultHealth: DiagnosticItem[] = [
    { id: 'manifest', name: '订阅', detail: manifest.profile.name, status: 'success' },
    { id: 'vless', name: '日常线路', detail: daily?.type.toUpperCase() ?? '-', status: 'idle' },
    { id: 'tuic', name: '游戏线路', detail: game?.type.toUpperCase() ?? '-', status: 'idle' },
    { id: 'codex', name: 'Codex', detail: '尚未单独测试', status: 'idle' },
  ]
  return (
    <div className="view connection-view">
      <header className="page-header connection-header">
        <div>
          <div className="status-title"><span className={`status-dot ${state}`} /><h1>{state === 'connected' ? '已连接' : state === 'connecting' ? '正在连接' : '未连接'}</h1></div>
          <p>{mode === 'smart' ? '国内直连，国外使用兼容线路' : mode === 'fast' ? 'OpenAI 使用 VLESS，其他国外流量使用 TUIC' : mode === 'global' ? '所有流量使用日常线路' : '所有流量绕过代理'}</p>
        </div>
        <button type="button" className={`power-button ${connected ? 'is-connected' : ''}`} onClick={onToggleConnection} disabled={state === 'connecting'} aria-label={connected ? '断开连接' : '开始连接'} title={connected ? '断开连接' : '开始连接'}>
          {state === 'connecting' ? <RefreshCw className="spin" /> : <Power />}
        </button>
      </header>

      <div className="mode-control" aria-label="代理模式">
        {(Object.keys(modeLabels) as RouteMode[]).map((item) => <button type="button" key={item} className={mode === item ? 'active' : ''} disabled={state === 'connecting'} onClick={() => onModeChange(item)}>{modeLabels[item]}</button>)}
      </div>
      {connectionError && <div className="connection-error" role="alert"><CircleAlert />{connectionError}</div>}

      <section className={`route-band ${connected ? "" : "inactive"}`} aria-label="当前网络路径">
        <div className="route-flow">
          <div className="route-node"><Laptop /><span>本机</span></div><div className="route-link"><span><Check /></span></div>
          <div className="route-node"><ShieldCheck /><span>{mode === 'direct' ? '直连' : mode === 'smart' ? '智能分流' : mode === 'fast' ? '极速分流' : 'VLESS'}</span></div><div className="route-link"><span><Check /></span></div>
          <div className="route-node"><Server /><span>{mode === 'direct' ? '本地网络' : mode === 'fast' ? game?.name : daily?.name}</span></div><div className="route-link"><span><Check /></span></div>
          <div className="route-node"><Globe2 /><span>Internet</span></div>
        </div>
        <div className="network-metrics"><div><span>内核</span><strong>{mode === 'direct' ? '已停用' : connected ? '运行中' : '未运行'}</strong></div><div><span>出口</span><strong>{mode === 'direct' ? '本机' : mode === 'global' ? 'VLESS' : mode === 'fast' ? 'TUIC' : '自动'}</strong></div><div><span>模式</span><strong>{modeLabels[mode]}</strong></div></div>
      </section>

      <div className="connection-grid">
        <section className="panel traffic-panel">
          <div className="panel-heading"><div><h2>当前流量</h2><p>本次连接 · 最近 20 秒</p></div><div className="legend"><span className="download">下载</span><span className="upload">上传</span></div></div>
          <div className="chart-wrap"><div className="chart-axis"><span>{axisMaxMbps}</span><span>{Math.round(axisMaxMbps * 0.67)}</span><span>{Math.round(axisMaxMbps * 0.33)}</span><span>0</span></div><svg viewBox="0 0 560 170" preserveAspectRatio="none" role="img" aria-label="实时下载和上传流量曲线"><g className="grid-lines"><line x1="0" y1="10" x2="560" y2="10" /><line x1="0" y1="60" x2="560" y2="60" /><line x1="0" y1="110" x2="560" y2="110" /><line x1="0" y1="160" x2="560" y2="160" /></g><path className="download-line" d={chartPath(downloadHistory, 560, 160, chartMax)} /><path className="upload-line" d={chartPath(uploadHistory, 560, 160, chartMax)} /></svg></div>
          <div className="traffic-totals"><div><ArrowDown /><span>下载 · {formatRate(traffic.downloadRate)}<strong data-testid="download-total">{formatBytes(traffic.downloadBytes)}</strong></span></div><div><ArrowUp /><span>上传 · {formatRate(traffic.uploadRate)}<strong data-testid="upload-total">{formatBytes(traffic.uploadBytes)}</strong></span></div></div>
        </section>

        <section className="panel health-panel">
          <div className="panel-heading"><div><h2>健康检查</h2><p>{manifestSource === 'remote' ? '配置已同步' : '使用本地恢复配置'}</p></div><span className={`sync-state ${manifestSource}`}>{manifestSource === 'remote' ? '已更新' : '缓存'}</span></div>
          <div className="health-list">{(health.length ? health : defaultHealth).map((item) => <div className="health-row" key={item.id}><span className={`health-icon ${item.status}`}>{item.status === 'warning' || item.status === 'error' ? <CircleAlert /> : item.status === 'running' ? <RefreshCw className="spin" /> : item.status === 'idle' ? <CircleHelp /> : <Check />}</span><span><strong>{item.name}</strong><small>{item.detail}</small></span><b className={item.status}>{item.status === 'error' ? '失败' : item.status === 'warning' ? '受限' : item.status === 'running' ? '检测中' : item.status === 'idle' ? '待检查' : '正常'}</b></div>)}</div>
          <button type="button" className="secondary-button" onClick={onRunDiagnostics}><Activity />运行诊断</button>
        </section>
      </div>

      <section className="quick-apps"><div><h2>游戏应用</h2><p>命中的应用优先使用 TUIC UDP 线路</p></div><button type="button" className="add-app-button" onClick={onOpenRules}><Plus /><span>添加游戏</span></button></section>
    </div>
  )
}

function RulesView({ rules, setRules }: { rules: AppRule[]; setRules: React.Dispatch<React.SetStateAction<AppRule[]>> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const addRule = (file: File) => setRules((current) => [...current, { id: `${Date.now()}`, name: file.name.replace(/\.exe$/i, ''), executable: file.name, target: 'game', enabled: true }])
  return (
    <div className="view">
      <header className="page-header compact"><div><h1>应用规则</h1><p>只为需要的程序指定线路，其他流量保持智能分流</p></div><button type="button" className="primary-button" onClick={() => inputRef.current?.click()}><Plus />添加应用</button></header>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".exe" onChange={(event) => event.target.files?.[0] && addRule(event.target.files[0])} />
      <section className="section-block"><div className="table-header"><span>应用</span><span>执行文件</span><span>出口</span><span>启用</span><span /></div><div className="rule-list">
        {rules.map((rule) => <div className="rule-row" key={rule.id}><div className="app-identity"><span className="app-icon"><AppWindow /></span><strong>{rule.name}</strong></div><code>{rule.executable}</code><select value={rule.target} onChange={(event) => setRules((items) => items.map((item) => item.id === rule.id ? { ...item, target: event.target.value as RouteTarget } : item))} aria-label={`${rule.name} 的出口`}>{(Object.keys(targetLabels) as RouteTarget[]).map((target) => <option key={target} value={target}>{targetLabels[target]}</option>)}</select><Toggle checked={rule.enabled} label={`启用 ${rule.name}`} onChange={() => setRules((items) => items.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} /><button type="button" className="icon-button danger" title="删除规则" aria-label={`删除 ${rule.name}`} onClick={() => setRules((items) => items.filter((item) => item.id !== rule.id))}><Trash2 /></button></div>)}
      </div></section>
      <section className="info-strip"><ShieldCheck /><span><strong>规则优先级</strong> 应用规则优先于智能分流；退出应用后不会影响其他程序。</span></section>
    </div>
  )
}

function LinesView({ manifest, syncing, onRefresh }: { manifest: DeviceManifest; syncing: boolean; onRefresh: () => void }) {
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, DiagnosticItem>>({})
  const testNode = async (id: 'vless' | 'tuic') => {
    if (testing) return
    setTesting(id)
    try {
      const result = await desktopBridge.testNode(id)
      setResults((current) => ({ ...current, [id]: result }))
    } catch (error) {
      setResults((current) => ({ ...current, [id]: { id, name: id, status: 'error', detail: readableError(error, '测试失败') } }))
    } finally { setTesting(null) }
  }
  return (
    <div className="view">
      <header className="page-header compact"><div><h1>线路</h1><p>日常 VLESS · 游戏 TUIC</p></div><button type="button" className="secondary-button" onClick={onRefresh} disabled={syncing}><RefreshCw className={syncing ? 'spin' : ''} />{syncing ? '正在更新' : '更新配置'}</button></header>
      <section className="node-list">{manifest.nodes.map((node) => {
        const result = results[node.type]
        return <article className="node-row" key={node.id}>
          <div className={'node-symbol ' + node.role}>{node.role === 'daily' ? <Cloud /> : <Zap />}</div>
          <div className="node-name"><span className="eyebrow">{node.role === 'daily' ? '日常线路' : '游戏线路'}</span><h2>{node.name}</h2><p>{node.server}:{node.server_port}</p></div>
          <div className="protocol-cell"><span>协议</span><strong>{node.type === 'vless' ? 'VLESS + WS + TLS' : 'TUIC + QUIC'}</strong></div>
          <div className="protocol-cell"><span>测试结果</span><strong title={result?.detail}>{result?.detail ?? '尚未测试'}</strong></div>
          <div className="latency-cell"><strong>{result?.latency !== undefined ? result.latency + ' ms' : '--'}</strong><small>HTTP 往返</small></div>
          <button type="button" className="icon-button" disabled={testing !== null} title="测试线路" aria-label={'测试 ' + node.name} onClick={() => void testNode(node.type)}>{testing === node.type ? <RefreshCw className="spin" /> : <Play />}</button>
        </article>
      })}</section>
    </div>
  )
}

function DiagnosticsView({ diagnostics, running, onRun, onExport }: { diagnostics: DiagnosticItem[]; running: boolean; onRun: () => void; onExport: () => void }) {
  const tested = diagnostics.some((item) => !['idle', 'running'].includes(item.status))
  const failures = diagnostics.filter((item) => item.status === 'error').length
  const warnings = diagnostics.filter((item) => item.status === 'warning').length
  return (
    <div className="view">
      <header className="page-header compact"><div><h1>诊断中心</h1><p>订阅、线路与目标站</p></div><button type="button" className="primary-button" onClick={onRun} disabled={running}>{running ? <RefreshCw className="spin" /> : <Play />}{running ? '正在检查' : '开始诊断'}</button></header>
      <section className="diagnostic-layout">
        <div className="diagnostic-list">{diagnostics.map((item, index) => <div className="diagnostic-row" key={item.id}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><span className={'diagnostic-state ' + item.status}>{item.status === 'running' ? <RefreshCw className="spin" /> : item.status === 'warning' || item.status === 'error' ? <CircleAlert /> : item.status === 'idle' ? <CircleHelp /> : <Check />}</span><div><strong>{item.name}</strong><p>{item.detail}</p></div><span className={'result-label ' + item.status}>{item.status === 'idle' ? '未测试' : item.status === 'running' ? '检查中' : item.status === 'warning' ? '受限' : item.status === 'error' ? '失败' : '通过'}</span></div>)}</div>
        <aside className="diagnostic-summary"><Gauge /><span className="eyebrow">本次结果</span><h2>{running ? '正在检测' : !tested ? '尚未测试' : failures ? failures + ' 项失败' : warnings ? warnings + ' 项受限' : '检测已通过'}</h2><p>{tested ? 'HTTP 状态与线路错误已记录。API 未登录连通性测试不能验证 Codex 账号或会话。' : '暂无诊断结果'}</p><button type="button" className="text-button" disabled={running} onClick={onExport}>导出诊断报告 <FileDown /></button></aside>
      </section>
    </div>
  )
}

function SettingsView({ settings, settingsBusy, settingsError, configPreview, subscription, profileName, busy, error, saved, onSettingChange, onSaveSubscription, onRemoveSubscription }: {
  settings: ClientSettings
  settingsBusy: BooleanSettingKey | null
  settingsError: string
  configPreview: string
  subscription: SubscriptionStatus
  profileName: string
  busy: boolean
  error: string
  saved: boolean
  onRemoveSubscription: () => void
  onSettingChange: (key: BooleanSettingKey, value: boolean) => void
  onSaveSubscription: (url: string) => void
}) {
  const items: Array<[BooleanSettingKey, string, string]> = [
    ['startup', '开机自动启动', '登录 Windows 后自动启动，保持托盘运行'],
    ['autoConnect', '自动连接', '启动后自动恢复上一次使用的模式和线路'],
    ['strictRoute', '严格路由', '避免 DNS 和系统服务绕过虚拟网卡'],
    ['ipv6', '允许 IPv6', '默认关闭，减少无可用 IPv6 时的等待'],
  ]
  const [draftUrl, setDraftUrl] = useState(subscription.url)
  return <div className="view"><header className="page-header compact"><div><h1>设置</h1><p>管理订阅、网络接管和本机行为</p></div></header><section className="subscription-manager"><div className="subscription-manager-heading"><div><span className="eyebrow">当前账号</span><h2>{profileName}</h2><p>更换链接前会先验证新订阅，成功后才替换当前配置。</p></div><span className="subscription-state"><Check />已配置</span></div><form onSubmit={(event) => { event.preventDefault(); onSaveSubscription(draftUrl) }}><SubscriptionInput value={draftUrl} onChange={setDraftUrl} disabled={busy} label="专属订阅链接" /><button type="submit" className="secondary-button" disabled={busy || !draftUrl.trim() || draftUrl.trim() === subscription.url}>{busy ? <RefreshCw className="spin" /> : <RefreshCw />}{busy ? '正在验证' : '更换订阅'}</button></form>{error && <div className="subscription-error" role="alert"><CircleAlert />{error}</div>}{saved && <div className="subscription-success"><Check />订阅已更新，旧连接和缓存已替换。</div>}<button type="button" className="text-button danger" onClick={onRemoveSubscription} disabled={busy}><Trash2 />移除订阅</button></section><div className="settings-layout"><section className="settings-list">{items.map(([key, title, detail]) => <div className="setting-row" key={key}><div><strong>{title}</strong><p>{detail}</p></div><Toggle checked={settings[key]} label={title} disabled={settingsBusy !== null} onChange={() => onSettingChange(key, !settings[key])} /></div>)}{settingsError && <div className="settings-error" role="alert"><CircleAlert />{settingsError}</div>}</section><aside className="config-preview"><div className="panel-heading"><div><h2>配置预览</h2><p>凭据已隐藏</p></div><SlidersHorizontal /></div><pre>{configPreview}</pre></aside></div></div>
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>('connection')
  const [state, setState] = useState<ConnectionState>('disconnected')
  const [mode, setMode] = useState<RouteMode>('smart')
  const [manifest, setManifest] = useState<DeviceManifest>(fallbackManifest)
  const [manifestSource, setManifestSource] = useState<'remote' | 'cache'>('cache')
  const [manifestReady, setManifestReady] = useState(!window.v2tt)
  const [booting, setBooting] = useState(Boolean(window.v2tt))
  const [subscription, setSubscription] = useState<SubscriptionStatus>({ configured: !window.v2tt, url: '' })
  const [subscriptionBusy, setSubscriptionBusy] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionSaved, setSubscriptionSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [rules, setRules] = useState<AppRule[]>(initialRules)
  const [rulesBusy, setRulesBusy] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>(initialDiagnostics)
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false)
  const [settings, setSettings] = useState<ClientSettings>({ startup: false, autoConnect: true, strictRoute: true, ipv6: false, lastMode: 'smart', appRules: initialRules })
  const [settingsBusy, setSettingsBusy] = useState<BooleanSettingKey | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [traffic, setTraffic] = useState({ downloadBytes: 0, uploadBytes: 0, downloadRate: 0, uploadRate: 0 })
  const [downloadHistory, setDownloadHistory] = useState<number[]>(Array(20).fill(0))
  const [uploadHistory, setUploadHistory] = useState<number[]>(Array(20).fill(0))
  const [connectionError, setConnectionError] = useState('')
  const [nativeError, setNativeError] = useState('')
  const [notice, setNotice] = useState('')
  const busyRef = useRef(false)

  const applyStatus = (desktop: DesktopStatus) => {
    setState(desktop.state)
    setMode(desktop.mode)
    setTraffic(desktop)
    setNativeError(desktop.error ?? '')
  }

  useEffect(() => {
    let mounted = true
    let timer = 0
    const poll = async () => {
      try {
        const desktop = await desktopBridge.getStatus()
        if (!mounted) return
        if (!busyRef.current) applyStatus(desktop)
        setDownloadHistory((values) => [...values.slice(1), desktop.downloadRate])
        setUploadHistory((values) => [...values.slice(1), desktop.uploadRate])
      } catch (error) {
        if (mounted) setNativeError(readableError(error, '无法读取本机代理状态'))
      } finally {
        if (mounted) timer = window.setTimeout(() => void poll(), 1000)
      }
    }
    void (async () => {
      try {
        const [saved, desktop, stored] = await Promise.all([desktopBridge.getSubscription(), desktopBridge.getStatus(), desktopBridge.getSettings()])
        if (!mounted) return
        setSubscription(saved)
        setSettings(stored)
        setRules(stored.appRules)
        setSettingsError(stored.startupError ?? '')
        applyStatus(desktop)
        if (saved.configured) {
          const loaded = await loadManifest()
          if (!mounted) return
          setManifest(loaded.manifest)
          setManifestSource(loaded.source)
          setManifestReady(true)
        } else {
          setManifestReady(false)
          setSubscriptionError(desktop.error ?? '')
        }
      } catch (error) {
        if (mounted) {
          setManifestReady(false)
          setSubscriptionError(readableError(error, '本机配置读取失败，请重新导入'))
        }
      } finally {
        if (mounted) { setBooting(false); void poll() }
      }
    })()
    return () => { mounted = false; window.clearTimeout(timer) }
  }, [])

  const configPreview = useMemo(() => JSON.stringify(buildSingBoxConfig(manifest, { mode, appRules: rules, strictRoute: settings.strictRoute, ipv6: settings.ipv6 }), null, 2), [manifest, mode, rules, settings.strictRoute, settings.ipv6])

  const saveSubscription = async (url: string) => {
    if (subscriptionBusy) return
    setSubscriptionBusy(true)
    setSubscriptionError('')
    setSubscriptionSaved(false)
    try {
      const result = await desktopBridge.setSubscription(url.trim())
      setSubscription(result.subscription)
      setManifest(result.manifest)
      setManifestSource(result.source)
      setManifestReady(true)
      setDiagnostics(initialDiagnostics)
      applyStatus(await desktopBridge.getStatus())
      setSubscriptionSaved(true)
      setConnectionError('')
    } catch (error) { setSubscriptionError(readableError(error, '订阅验证失败')) }
    finally { setSubscriptionBusy(false) }
  }

  const refreshManifest = async () => {
    if (syncing) return
    setSyncing(true)
    setConnectionError('')
    try {
      const loaded = await loadManifest(true)
      setManifest(loaded.manifest)
      setManifestSource(loaded.source)
      setDiagnostics(initialDiagnostics)
      setNotice(loaded.source === 'cache' ? '远程暂不可用，已保留有效的本机缓存' : '订阅已更新')
    } catch (error) { setConnectionError(readableError(error, '订阅更新失败')) }
    finally { setSyncing(false) }
  }

  const operateConnection = async (action: () => Promise<DesktopStatus>) => {
    if (busyRef.current) return
    busyRef.current = true
    setConnectionError('')
    setState('connecting')
    try {
      applyStatus(await action())
      setDiagnostics(initialDiagnostics)
    } catch (error) {
      applyStatus(await desktopBridge.getStatus().catch(() => ({ state: 'disconnected' as const, mode, ...traffic })))
      setConnectionError(readableError(error, '连接操作失败'))
    } finally { busyRef.current = false }
  }
  const toggleConnection = () => operateConnection(() => state === 'connected' ? desktopBridge.disconnect() : desktopBridge.connect(mode))
  const changeMode = (next: RouteMode) => operateConnection(() => desktopBridge.setMode(next))
  const updateSetting = async (key: BooleanSettingKey, value: boolean) => {
    if (settingsBusy || busyRef.current) return
    setSettingsBusy(key)
    setSettingsError('')
    busyRef.current = true
    try {
      const updated = await desktopBridge.setSetting(key, value)
      setSettings(updated)
      setSettingsError(updated.startupError ?? '')
      applyStatus(await desktopBridge.getStatus())
    } catch (error) { setSettingsError(readableError(error, '设置保存失败')) }
    finally { setSettingsBusy(null); busyRef.current = false }
  }
  const updateRules: React.Dispatch<React.SetStateAction<AppRule[]>> = (action) => {
    if (rulesBusy || busyRef.current) return
    const next = typeof action === 'function' ? action(rules) : action
    setRulesBusy(true)
    setConnectionError('')
    busyRef.current = true
    void desktopBridge.setSetting('appRules', next).then((updated) => {
      setSettings(updated)
      setRules(updated.appRules)
      setDiagnostics(initialDiagnostics)
    }).catch((error) => setConnectionError(readableError(error, '规则保存失败')))
      .finally(() => { setRulesBusy(false); busyRef.current = false })
  }
  const runDiagnostics = async () => {
    if (diagnosticsRunning) return
    setDiagnosticsRunning(true)
    setConnectionError('')
    setDiagnostics(initialDiagnostics.map((item) => ({ ...item, status: 'running', detail: '正在通过实际线路测试' })))
    try { setDiagnostics(await desktopBridge.runDiagnostics()) }
    catch (error) {
      setDiagnostics(initialDiagnostics)
      setConnectionError(readableError(error, '诊断未完成'))
    } finally { setDiagnosticsRunning(false) }
  }
  const exportReport = async () => {
    try { if ((await desktopBridge.exportReport()).saved) setNotice('诊断报告已导出') }
    catch (error) { setConnectionError(readableError(error, '报告导出失败')) }
  }
  const removeSubscription = async () => {
    try {
      const result = await desktopBridge.removeSubscription()
      setSubscription(result)
      if (!result.configured) { setManifestReady(false); setSubscriptionError(''); setSubscriptionSaved(false) }
    } catch (error) { setSubscriptionError(readableError(error, '移除订阅失败')) }
  }

  if (booting) {
    return <div className="subscription-shell"><header className="subscription-brand"><BrandMark /><span>V2TT <b>Client</b></span></header><main className="subscription-loading"><RefreshCw className="spin" /><h1>正在读取本机配置</h1><p>检查加密订阅与线路缓存</p></main><footer>V2TT Client · v{appVersion}</footer></div>
  }

  if (!manifestReady) {
    return <SubscriptionSetup initialUrl={subscription.url} busy={subscriptionBusy} error={subscriptionError} onSubmit={(url) => void saveSubscription(url)} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar"><div className="brand"><BrandMark /><span>V2TT <b>Client</b></span></div><nav aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => setActiveView(item.id)}><Icon /><span>{item.label}</span></button> })}</nav><div className="sidebar-footer"><button type="button" className="location-button" onClick={() => setActiveView('lines')}><span className="server-mini"><Server /></span><span><strong>{manifest.nodes.find((node) => node.role === 'daily')?.name ?? '日常线路'}</strong><small>{state === 'connected' ? '已连接' : '未连接'}</small></span><ChevronRight /></button><div className="version"><CircleHelp /><span>v{appVersion}</span></div></div></aside>
      <main><div className="topbar"><span className="profile-pill">{manifest.profile.name} <b>{expiryLabel(manifest.profile.expires_at)}</b></span><div className="topbar-actions"><button type="button" className="icon-button" title="同步配置" aria-label="同步配置" onClick={() => void refreshManifest()} disabled={syncing}><RefreshCw className={syncing ? 'spin' : ''} /></button><button type="button" className="icon-button" title="导出诊断报告" aria-label="导出诊断报告" onClick={() => void exportReport()}><FileDown /></button></div></div>
        {notice && <div className="app-notice" role="status">{notice}<button type="button" className="text-button" onClick={() => setNotice('')}>关闭</button></div>}
        {activeView !== 'connection' && (connectionError || nativeError) && <div className="connection-error" role="alert"><CircleAlert />{connectionError || nativeError}</div>}
        {activeView === 'connection' && <ConnectionView state={state} mode={mode} manifest={manifest} manifestSource={manifestSource} diagnostics={diagnostics} traffic={traffic} downloadHistory={downloadHistory} uploadHistory={uploadHistory} connectionError={connectionError || nativeError} onToggleConnection={() => void toggleConnection()} onModeChange={(next) => void changeMode(next)} onRunDiagnostics={() => void runDiagnostics()} onOpenRules={() => setActiveView('rules')} />}
        {activeView === 'rules' && <fieldset className="rules-fieldset" disabled={rulesBusy}><RulesView rules={rules} setRules={updateRules} /></fieldset>}
        {activeView === 'lines' && <LinesView key={manifest.generated_at + manifest.profile.id + state + mode} manifest={manifest} syncing={syncing} onRefresh={() => void refreshManifest()} />}
        {activeView === 'diagnostics' && <DiagnosticsView diagnostics={diagnostics} running={diagnosticsRunning} onRun={() => void runDiagnostics()} onExport={() => void exportReport()} />}
        {activeView === 'settings' && <SettingsView settings={settings} settingsBusy={settingsBusy} settingsError={settingsError || settings.startupError || ''} configPreview={configPreview} subscription={subscription} profileName={manifest.profile.name} busy={subscriptionBusy} error={subscriptionError} saved={subscriptionSaved} onSettingChange={(key, value) => void updateSetting(key, value)} onSaveSubscription={(url) => void saveSubscription(url)} onRemoveSubscription={() => void removeSubscription()} />}
      </main>

    </div>
  )
}

export default App

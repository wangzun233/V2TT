import type { AppRule, ConnectionState, DeviceManifest, DiagnosticItem, RouteMode } from '../types'
import { fallbackManifest } from '../data/fallbackManifest'

export interface SubscriptionStatus {
  configured: boolean
  url: string
}

export interface SubscriptionUpdate {
  manifest: DeviceManifest
  source: 'remote'
  subscription: SubscriptionStatus
}

export interface DesktopStatus {
  state: ConnectionState
  mode: RouteMode
  downloadBytes: number
  uploadBytes: number
  downloadRate: number
  uploadRate: number
  error?: string
}

export interface ClientSettings {
  startup: boolean
  autoConnect: boolean
  strictRoute: boolean
  ipv6: boolean
  lastMode: RouteMode
  appRules: AppRule[]
  startupError?: string
  version?: string
}

export type ClientSettingKey = 'startup' | 'autoConnect' | 'strictRoute' | 'ipv6' | 'lastMode' | 'appRules'

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

class DesktopBridge {
  private settings: ClientSettings = {
    startup: false,
    autoConnect: true,
    strictRoute: true,
    ipv6: false,
    lastMode: 'smart',
    appRules: [
      { id: 'steam', name: 'Steam', executable: 'steam.exe', target: 'game', enabled: true },
      { id: 'codex', name: 'Codex', executable: 'Codex.exe', target: 'daily', enabled: true },
    ],
  }

  private status: DesktopStatus = {
    state: 'disconnected',
    mode: 'smart',
    downloadBytes: 0,
    uploadBytes: 0,
    downloadRate: 0,
    uploadRate: 0,
  }

  async getSubscription(): Promise<SubscriptionStatus> {
    if (window.v2tt) return window.v2tt.getSubscription()
    return { configured: true, url: 'https://subscription.example/api/v1/device/preview' }
  }

  async setSubscription(url: string): Promise<SubscriptionUpdate> {
    if (window.v2tt) return window.v2tt.setSubscription({ url })
    return {
      manifest: fallbackManifest,
      source: 'remote',
      subscription: { configured: true, url },
    }
  }

  async removeSubscription(): Promise<SubscriptionStatus> {
    if (window.v2tt) return window.v2tt.removeSubscription()
    return { configured: false, url: '' }
  }

  async getSettings(): Promise<ClientSettings> {
    if (window.v2tt) return window.v2tt.getSettings()
    return { ...this.settings }
  }

  async setSetting(key: ClientSettingKey, value: ClientSettings[ClientSettingKey]): Promise<ClientSettings> {
    if (window.v2tt) return window.v2tt.setSetting({ key, value })
    this.settings = { ...this.settings, [key]: value }
    return this.getSettings()
  }

  async getStatus(): Promise<DesktopStatus> {
    if (window.v2tt) return window.v2tt.getStatus()
    return { ...this.status }
  }

  async connect(mode: RouteMode): Promise<DesktopStatus> {
    if (window.v2tt) return window.v2tt.connect({ mode })
    throw new Error('浏览器预览不接管网络，请使用 Windows 客户端连接')
  }

  async disconnect(): Promise<DesktopStatus> {
    if (window.v2tt) return window.v2tt.disconnect()
    await wait(350)
    this.status = { ...this.status, state: 'disconnected' }
    return this.getStatus()
  }

  async setMode(mode: RouteMode): Promise<DesktopStatus> {
    if (window.v2tt) return window.v2tt.setMode({ mode })
    this.status = { ...this.status, mode }
    if (this.status.state === 'connected') await wait(260)
    return this.getStatus()
  }

  async runDiagnostics(): Promise<DiagnosticItem[]> {
    if (window.v2tt) return window.v2tt.runDiagnostics()
    throw new Error('浏览器预览无法运行网络诊断')
  }

  async testNode(id: 'vless' | 'tuic'): Promise<DiagnosticItem> {
    if (window.v2tt) return window.v2tt.testNode({ id })
    return { id, name: id, status: 'idle', detail: '请在 Windows 客户端中测试' }
  }

  async exportReport(): Promise<{ saved: boolean }> {
    if (window.v2tt) return window.v2tt.exportReport()
    throw new Error('请在 Windows 客户端导出诊断报告')
  }
}

export const desktopBridge = new DesktopBridge()

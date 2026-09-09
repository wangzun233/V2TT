import type { DeviceManifest, DiagnosticItem, RouteMode } from './types'
import type { ClientSettings, ClientSettingKey, DesktopStatus, SubscriptionStatus, SubscriptionUpdate } from './services/desktopBridge'

declare global {
  interface Window {
    v2tt?: {
      getManifest: () => Promise<{ manifest: DeviceManifest; source: 'remote' | 'cache' }>
      refreshManifest: () => Promise<{ manifest: DeviceManifest; source: 'remote' | 'cache' }>
      getSubscription: () => Promise<SubscriptionStatus>
      setSubscription: (payload: { url: string }) => Promise<SubscriptionUpdate>
      removeSubscription: () => Promise<SubscriptionStatus>
      getSettings: () => Promise<ClientSettings>
      setSetting: (payload: { key: ClientSettingKey; value: ClientSettings[ClientSettingKey] }) => Promise<ClientSettings>
      getStatus: () => Promise<DesktopStatus>
      connect: (payload: { mode: RouteMode }) => Promise<DesktopStatus>
      disconnect: () => Promise<DesktopStatus>
      setMode: (payload: { mode: RouteMode }) => Promise<DesktopStatus>
      runDiagnostics: () => Promise<DiagnosticItem[]>
      testNode: (payload: { id: 'vless' | 'tuic' }) => Promise<DiagnosticItem>
      exportReport: () => Promise<{ saved: boolean }>
    }
  }
}
export {}

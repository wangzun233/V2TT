export type RouteMode = 'smart' | 'fast' | 'game' | 'tcp' | 'global' | 'direct'
export type RouteTarget = 'daily' | 'game' | 'direct'
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'

export interface VlessNode {
  id: string
  name: string
  type: 'vless'
  role: 'daily'
  server: string
  server_port: number
  uuid: string
  tls: { enabled: boolean; server_name: string; fingerprint?: 'chrome' }
  transport: { type: 'ws' | 'httpupgrade'; path: string; host: string; max_early_data?: number; early_data_header_name?: 'Sec-WebSocket-Protocol' }
}

export interface TuicNode {
  id: string
  name: string
  type: 'tuic'
  role: 'game'
  server: string
  server_port: number
  uuid: string
  password: string
  congestion_control: string
  udp_relay_mode: string
  tls: { enabled: boolean; server_name: string; alpn: string[] }
}

export type ProxyNode = VlessNode | TuicNode

export interface TcpNode extends Omit<VlessNode, 'role' | 'transport'> {
  flow?: 'xtls-rprx-vision'
  multiplex?: boolean
  role: 'tcp'
  transport: { type: 'tcp' }
}

export interface DeviceManifest {
  network?: { dns_mode?: 'real' | 'fakeip'; secure_dns?: 'https' | 'tls' }
  tcp_node?: TcpNode
  schema_version: number
  generated_at: string
  profile: {
    id: string
    name: string
    expires_at: string | null
    update_interval_hours: number
  }
  routing: {
    default_mode: RouteMode
    daily_node: string
    game_node: string
  }
  nodes: ProxyNode[]
}

export interface AppRule {
  id: string
  name: string
  executable: string
  target: RouteTarget
  enabled: boolean
}

export interface DiagnosticItem {
  id: string
  name: string
  detail: string
  status: 'idle' | 'running' | 'success' | 'warning' | 'error'
  latency?: number
}

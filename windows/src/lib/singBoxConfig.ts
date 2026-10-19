import type {
  AppRule,
  DeviceManifest,
  RouteMode,
  TuicNode,
  VlessNode,
  TcpNode,
} from '../types'

export interface ConfigOptions {
  mode: RouteMode
  appRules: AppRule[]
  strictRoute: boolean
  ipv6: boolean
  ruleSetDirectory?: string
}

type JsonRecord = Record<string, unknown>

const protectedDailyProcesses = ['Codex.exe', 'ChatGPT.exe', 'com.vortex.helper.exe']
const openAiDomains = ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com']

const processPattern = (name: string) => String.raw`(?i)(^|[\\/])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`

export function applicationOutbound(executable: string, options: ConfigOptions): string {
  if (options.mode === 'direct') return 'direct'
  if (options.mode === 'global') return 'daily-vless'
  const diablo = executable.toLowerCase() === 'diablo iv.exe'
  const rule = options.appRules.find(r => r.enabled && r.executable.toLowerCase() === executable.toLowerCase())
  if (options.mode === 'tcp') return rule?.target === 'direct' ? 'direct' : 'tcp-vless'
  if (rule) return rule.target === 'direct' ? 'direct' : rule.target === 'daily' ? 'daily-vless' : options.mode === 'game' && diablo ? 'diablo-tuic' : 'game-tuic'
  if (options.mode === 'game' && diablo) return 'diablo-tuic'
  if (options.mode === 'fast' && !protectedDailyProcesses.some(p => p.toLowerCase() === executable.toLowerCase())) return 'game-tuic'
  return 'daily-vless'
}

function findNode<T extends VlessNode | TuicNode>(
  manifest: DeviceManifest,
  id: string,
  type: T['type'],
): T {
  const node = manifest.nodes.find((candidate) => candidate.id === id)
  if (!node || node.type !== type) {
    throw new Error(`Manifest is missing ${type} node: ${id}`)
  }
  return node as T
}

function vlessOutbound(node: VlessNode | TcpNode): JsonRecord {
  return {
    type: 'vless',
    tag: node.role === 'tcp' ? 'tcp-vless' : 'daily-vless',
    server: node.server,
    server_port: node.server_port,
    uuid: node.uuid,
    tls: {
      enabled: node.tls.enabled,
      server_name: node.tls.server_name,
      ...(node.tls.fingerprint ? { utls: { enabled: true, fingerprint: node.tls.fingerprint } } : {}),
    },
    ...(node.role === 'tcp' && node.flow ? { flow: node.flow } : {}),
    ...(node.role === 'tcp' && node.multiplex && !node.flow ? { multiplex: {
      enabled: true, protocol: 'h2mux', max_connections: 4, min_streams: 4, padding: true,
    } } : {}),
    ...(node.transport.type === 'ws' ? { transport: {
      type: 'ws',
      path: node.transport.path,
      headers: { Host: node.transport.host },
      ...(node.transport.max_early_data ? {
        max_early_data: node.transport.max_early_data,
        early_data_header_name: node.transport.early_data_header_name,
      } : {}),
    } } : {}),
    ...(node.transport.type === 'httpupgrade' ? { transport: {
      type: 'httpupgrade', path: node.transport.path, host: node.transport.host,
    } } : {}),
  }
}

function tuicOutbound(node: TuicNode): JsonRecord {
  return {
    type: 'tuic',
    tag: 'game-tuic',
    server: node.server,
    server_port: node.server_port,
    uuid: node.uuid,
    password: node.password,
    congestion_control: node.congestion_control,
    udp_relay_mode: node.udp_relay_mode,
    tls: {
      enabled: node.tls.enabled,
      server_name: node.tls.server_name,
      alpn: node.tls.alpn,
    },
  }
}

export function buildSingBoxConfig(
  manifest: DeviceManifest,
  options: ConfigOptions,
): JsonRecord {
  const daily = findNode<VlessNode>(
    manifest,
    manifest.routing.daily_node,
    'vless',
  )
  const game = findNode<TuicNode>(
    manifest,
    manifest.routing.game_node,
    'tuic',
  )
  const activeRules = options.appRules.filter((rule) => rule.enabled)
  if (options.mode === 'tcp' && !manifest.tcp_node) throw new Error('订阅缺少 TCP 线路，请更新订阅')
  const processes = (target: AppRule['target']) =>
    activeRules
      .filter((rule) => rule.target === target)
      .map((rule) => rule.executable)
  const ruleSetPath = (name: string) => options.ruleSetDirectory
    ? `${options.ruleSetDirectory.replace(/\\/g, '/')}/${name}.srs`
    : `__V2TT_RULES__/${name}.srs`

  const modeFinal = options.mode === 'direct'
    ? 'direct'
    : options.mode === 'fast'
      ? 'game-tuic'
      : options.mode === 'tcp' ? 'tcp-vless' : 'daily-vless'
  const modeRules: JsonRecord[] = []
  const gameMode = options.mode === 'game'
  // DNS may be performed by a system service, so process rules cannot reliably
  // exempt games from FakeIP. Keep real DNS whenever game rules are active.
  const useFakeIp = manifest.network?.dns_mode === 'fakeip' && !gameMode && options.mode !== 'direct'
    && !activeRules.some(rule => rule.target === 'game')
  const secureDns = manifest.network?.secure_dns ?? 'tls'
  const split = options.mode === 'smart' || options.mode === 'fast' || gameMode || options.mode === 'tcp'
  const earlyRules: JsonRecord[] = gameMode ? [
    { port: 53, action: 'hijack-dns' },
    { ip_cidr: ['172.19.0.0/30', 'fdfe:dcba:9876::/126'], action: 'reject', method: 'drop' },
    { process_path_regex: [processPattern('Diablo IV.exe')], outbound: applicationOutbound('Diablo IV.exe', options) },
  ] : []

  if (split) {
    const processRoutes: Array<[AppRule['target'], string]> = [
      ['game', 'game-tuic'],
      ['daily', 'daily-vless'],
      ['direct', 'direct'],
    ]
    for (const [target, outbound] of processRoutes) {
      const processNames = processes(target)
      if (processNames.length) {
        modeRules.push({ process_path_regex: processNames.map(processPattern), outbound: options.mode === 'tcp' && target !== 'direct' ? 'tcp-vless' : outbound })
      }
    }
    // Explicit application choices take precedence over compatibility defaults.
    if (options.mode === 'fast') {
      modeRules.push(
        { domain_suffix: openAiDomains, outbound: 'daily-vless' },
        { process_path_regex: protectedDailyProcesses.map(processPattern), outbound: 'daily-vless' },
      )
    }
    modeRules.push(
      { rule_set: ['geosite-cn', 'geoip-cn'], outbound: 'direct' },
      { ip_is_private: true, outbound: 'direct' },
      { domain_suffix: ['.cn'], outbound: 'direct' },
    )
    if (options.mode === 'smart' || gameMode || options.mode === 'tcp') {
      // Browsers fall back to TCP when QUIC is dropped. This avoids tunnelling
      // web UDP/443 over the WebSocket daily route; game rules above keep TUIC.
      modeRules.splice(modeRules.length - 2, 0, { network: 'udp', port: 443, action: 'reject', method: 'drop' })
    }
  } else if (options.mode === 'global') {
    modeRules.push({ network: 'udp', port: 443, action: 'reject', method: 'drop' })
  }

  return {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [
        {
          type: secureDns,
          tag: 'secure-dns',
          server: '1.1.1.1',
          server_port: secureDns === 'https' ? 443 : 853,
          detour: gameMode ? 'game-tuic' : modeFinal,
        },
        { type: 'local', tag: 'local-dns' },
        ...(useFakeIp ? [{ type: 'fakeip', tag: 'fakeip-dns', inet4_range: '198.18.0.0/15', inet6_range: 'fc00::/18' }] : []),
      ],
      rules: [
        { domain_suffix: ['lan', 'local', 'localhost'], server: 'local-dns' },
        ...(split ? [{ rule_set: 'geosite-cn', server: 'local-dns' }, { domain_suffix: ['cn'], server: 'local-dns' }] : []),
        ...(useFakeIp ? [{ query_type: ['A', 'AAAA'], server: 'fakeip-dns', rewrite_ttl: 1 }] : []),
      ],
      final: options.mode === 'direct' ? 'local-dns' : 'secure-dns',
      strategy: options.ipv6 ? 'prefer_ipv4' : 'ipv4_only',
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'V2TT',
        address: options.ipv6 ? ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'] : ['172.19.0.1/30'],
        auto_route: true,
        strict_route: options.strictRoute,
        stack: 'mixed',
        ...(gameMode ? { mtu: 1400 } : {}),
      },
    ],
    outbounds: [
      vlessOutbound(daily),
      ...(manifest.tcp_node ? [vlessOutbound(manifest.tcp_node)] : []),
      tuicOutbound(game),
      ...(gameMode ? [{ ...tuicOutbound(game), tag: 'diablo-tuic', udp_relay_mode: 'native' }] : []),
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: 'local-dns',
      rule_set: split
        ? [
            { type: 'local', tag: 'geosite-cn', format: 'binary', path: ruleSetPath('geosite-cn') },
            { type: 'local', tag: 'geoip-cn', format: 'binary', path: ruleSetPath('geoip-cn') },
          ]
        : [],
      rules: [
        ...earlyRules,
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        // Never send non-DNS traffic back into our own virtual subnet.
        { ip_cidr: ['172.19.0.0/30', 'fdfe:dcba:9876::/126'], action: 'reject', method: 'drop' },
        ...modeRules,
      ],
      final: modeFinal,
    },
    experimental: {
      clash_api: {
        external_controller: '127.0.0.1:19090',
        secret: 'v2tt-client-local',
      },
    },
  }
}

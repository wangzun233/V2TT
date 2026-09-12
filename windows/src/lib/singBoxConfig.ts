import type {
  AppRule,
  DeviceManifest,
  RouteMode,
  TuicNode,
  VlessNode,
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

function vlessOutbound(node: VlessNode): JsonRecord {
  return {
    type: 'vless',
    tag: 'daily-vless',
    server: node.server,
    server_port: node.server_port,
    uuid: node.uuid,
    tls: {
      enabled: node.tls.enabled,
      server_name: node.tls.server_name,
    },
    transport: {
      type: 'ws',
      path: node.transport.path,
      headers: { Host: node.transport.host },
    },
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
      : 'daily-vless'
  const modeRules: JsonRecord[] = []

  if (options.mode === 'smart' || options.mode === 'fast') {
    if (options.mode === 'fast') {
      modeRules.push(
        { domain_suffix: openAiDomains, outbound: 'daily-vless' },
        { process_name: protectedDailyProcesses, outbound: 'daily-vless' },
      )
    }
    const processRoutes: Array<[AppRule['target'], string]> = [
      ['game', 'game-tuic'],
      ['daily', 'daily-vless'],
      ['direct', 'direct'],
    ]
    for (const [target, outbound] of processRoutes) {
      const processNames = processes(target)
      if (processNames.length) {
        modeRules.push({ process_name: processNames, outbound })
      }
    }
    modeRules.push(
      { rule_set: ['geosite-cn', 'geoip-cn'], outbound: 'direct' },
      { ip_is_private: true, outbound: 'direct' },
      { domain_suffix: ['.cn'], outbound: 'direct' },
    )
    if (options.mode === 'smart') {
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
          type: 'tls',
          tag: 'secure-dns',
          server: '1.1.1.1',
          server_port: 853,
          detour: 'daily-vless',
        },
        { type: 'local', tag: 'local-dns' },
      ],
      rules: options.mode === 'smart' || options.mode === 'fast'
        ? [{ rule_set: 'geosite-cn', server: 'local-dns' }]
        : [],
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
      },
    ],
    outbounds: [
      vlessOutbound(daily),
      tuicOutbound(game),
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: 'local-dns',
      rule_set: options.mode === 'smart' || options.mode === 'fast'
        ? [
            { type: 'local', tag: 'geosite-cn', format: 'binary', path: ruleSetPath('geosite-cn') },
            { type: 'local', tag: 'geoip-cn', format: 'binary', path: ruleSetPath('geoip-cn') },
          ]
        : [],
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
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

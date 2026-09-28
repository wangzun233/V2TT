import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fallbackManifest } from '../data/fallbackManifest'
import type { AppRule } from '../types'
import { applicationOutbound, buildSingBoxConfig } from './singBoxConfig'

const gameRule: AppRule = {
  id: 'game',
  name: 'Game',
  executable: 'game.exe',
  target: 'game',
  enabled: true,
}

describe('buildSingBoxConfig', () => {
  it('isolates Diablo traffic before sniff without capturing the launcher or changing domestic rules', () => {
    const config = buildSingBoxConfig(fallbackManifest, { mode: 'game', appRules: [], strictRoute: true, ipv6: false })
    const { rules, final } = config.route as { rules: Array<Record<string, unknown>>; final: string }
    const diablo = rules.findIndex(r => r.outbound === 'diablo-tuic')
    expect(diablo).toBeLessThan(rules.findIndex(r => r.action === 'sniff'))
    expect(rules[0]).toEqual({ port: 53, action: 'hijack-dns' })
    expect(rules[diablo].network).toBeUndefined()
    expect(final).toBe('daily-vless')
    expect(JSON.stringify(rules)).not.toContain('Battle.net')
    expect(rules).toContainEqual({ rule_set: ['geosite-cn', 'geoip-cn'], outbound: 'direct' })
    const outbounds = config.outbounds as Array<Record<string, unknown>>
    expect(outbounds.find(o => o.tag === 'diablo-tuic')).toMatchObject({ type: 'tuic', udp_relay_mode: 'native' })
    expect(outbounds.find(o => o.tag === 'game-tuic')).toBeDefined()
    expect((config.dns as { servers: Array<Record<string, unknown>> }).servers[0].detour).toBe('game-tuic')
    expect((config.inbounds as Array<Record<string, unknown>>)[0].mtu).toBe(1400)
  })

  it.each(['direct', 'daily', 'game'] as const)('respects explicit Diablo %s choice before the game preset', (target) => {
    const options = { mode: 'game' as const, strictRoute: true, ipv6: false,
      appRules: [{ id: 'diablo', name: 'Diablo', executable: 'diablo iv.EXE', target, enabled: true }] }
    const outbound = applicationOutbound('Diablo IV.exe', options)
    expect(outbound).toBe(target === 'direct' ? 'direct' : target === 'daily' ? 'daily-vless' : 'diablo-tuic')
    const config = buildSingBoxConfig(fallbackManifest, options)
    expect((config.route as { rules: Array<Record<string, unknown>> }).rules[2].outbound).toBe(outbound)
  })

  it('diagnostics follow process overrides but global mode keeps its declared semantics', () => {
    const options = { mode: 'fast' as const, strictRoute: true, ipv6: false,
      appRules: [{ id: 'codex', name: 'Codex', executable: 'codex.exe', target: 'game' as const, enabled: true }] }
    expect(applicationOutbound('Codex.exe', options)).toBe('game-tuic')
    expect(applicationOutbound('ChatGPT.exe', options)).toBe('daily-vless')
    expect(applicationOutbound('Codex.exe', { ...options, mode: 'global' })).toBe('daily-vless')
    expect(applicationOutbound('Codex.exe', { ...options, mode: 'direct' })).toBe('direct')
  })
  it('blocks virtual-subnet recirculation after DNS hijack and before application routes', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'fast', appRules: [gameRule], strictRoute: true, ipv6: true,
    })
    const { rules } = config.route as { rules: Array<Record<string, unknown>> }
    const dns = rules.findIndex(rule => rule.action === 'hijack-dns')
    const guard = rules.findIndex(rule => Array.isArray(rule.ip_cidr))
    const application = rules.findIndex(rule => Array.isArray(rule.process_path_regex))
    expect(guard).toBeGreaterThan(dns)
    expect(guard).toBeLessThan(application)
    expect(rules[guard]).toEqual({ ip_cidr: ['172.19.0.0/30', 'fdfe:dcba:9876::/126'], action: 'reject', method: 'drop' })
  })
  it('uses reject actions instead of removed special outbounds', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'global', appRules: [], strictRoute: true, ipv6: false,
    })
    expect(config.outbounds).not.toContainEqual({ type: 'block', tag: 'block' })
    expect((config.route as { rules: unknown[] }).rules).toContainEqual({
      network: 'udp', port: 443, action: 'reject', method: 'drop',
    })
  })

  it('routes configured game applications to TUIC in smart mode', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'smart',
      appRules: [gameRule],
      strictRoute: true,
      ipv6: false,
    })
    const route = config.route as { rules: Array<Record<string, unknown>> }
    expect(route.rules).toContainEqual({
      process_path_regex: [String.raw`(?i)(^|[\\/])game\.exe$`],
      outbound: 'game-tuic',
    })
    expect(route.rules).toContainEqual({
      rule_set: ['geosite-cn', 'geoip-cn'],
      outbound: 'direct',
    })
    expect(config.experimental).toEqual({
      clash_api: {
        external_controller: '127.0.0.1:19090',
        secret: 'v2tt-client-local',
      },
    })
  })

  it('uses direct as final outbound in direct mode', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'direct',
      appRules: [],
      strictRoute: true,
      ipv6: false,
    })
    expect((config.route as { final: string }).final).toBe('direct')
  })

  it('keeps OpenAI on VLESS and sends other foreign traffic to TUIC in fast mode', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'fast',
      appRules: [gameRule],
      strictRoute: true,
      ipv6: false,
    })
    const route = config.route as { final: string; rules: Array<Record<string, unknown>> }
    expect(route.final).toBe('game-tuic')
    expect(route.rules).toContainEqual({
      domain_suffix: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com'],
      outbound: 'daily-vless',
    })
    expect(route.rules).toContainEqual({
      process_path_regex: [String.raw`(?i)(^|[\\/])Codex\.exe$`, String.raw`(?i)(^|[\\/])ChatGPT\.exe$`, String.raw`(?i)(^|[\\/])com\.vortex\.helper\.exe$`],
      outbound: 'daily-vless',
    })
    expect(route.rules).not.toContainEqual({ network: 'udp', port: 443, action: 'reject', method: 'drop' })
  })

  it.each(['game', 'direct'] as const)('lets an explicit %s application rule override OpenAI defaults', (target) => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'fast', strictRoute: true, ipv6: false,
      appRules: [{ id: 'codex', name: 'Codex', executable: 'Codex.exe', target, enabled: true }],
    })
    const { rules } = config.route as { rules: Array<Record<string, unknown>> }
    const application = rules.findIndex(rule => Array.isArray(rule.process_path_regex) && rule.process_path_regex.length === 1 && rule.process_path_regex[0] === String.raw`(?i)(^|[\\/])Codex\.exe$`)
    const compatibility = rules.findIndex(rule => Array.isArray(rule.domain_suffix) && rule.domain_suffix.includes('openai.com'))
    expect(application).toBeGreaterThanOrEqual(0)
    expect(application).toBeLessThan(compatibility)
    expect(rules[application].outbound).toBe(target === 'game' ? 'game-tuic' : 'direct')
  })

  it.each(['smart', 'fast', 'global', 'direct'] as const)('keeps DNS consistent with %s mode without changing domestic DNS', (mode) => {
    const config = buildSingBoxConfig(fallbackManifest, { mode, appRules: [], strictRoute: true, ipv6: false })
    const dns = config.dns as { servers: Array<Record<string, unknown>>; rules: unknown[]; final: string }
    expect(dns.servers[0].detour).toBe(mode === 'fast' ? 'game-tuic' : mode === 'direct' ? 'direct' : 'daily-vless')
    if (mode === 'fast' || mode === 'smart') expect(dns.rules).toContainEqual({ rule_set: 'geosite-cn', server: 'local-dns' })
    if (mode === 'direct') expect(dns.final).toBe('local-dns')
  })

  it('disabled application overrides leave compatibility defaults intact', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'fast', strictRoute: true, ipv6: false,
      appRules: [{ id: 'codex', name: 'Codex', executable: 'Codex.exe', target: 'game', enabled: false }],
    })
    const { rules } = config.route as { rules: Array<Record<string, unknown>> }
    expect(rules).not.toContainEqual({ process_path_regex: [String.raw`(?i)(^|[\\/])Codex\.exe$`], outbound: 'game-tuic' })
    expect(rules).toContainEqual({ process_path_regex: [String.raw`(?i)(^|[\\/])Codex\.exe$`, String.raw`(?i)(^|[\\/])ChatGPT\.exe$`, String.raw`(?i)(^|[\\/])com\.vortex\.helper\.exe$`], outbound: 'daily-vless' })
  })

  it('escapes process names and matches Windows casing without matching a different executable', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'fast', strictRoute: true, ipv6: false,
      appRules: [{ ...gameRule, executable: 'Code(x)+.exe' }],
    })
    const { rules } = config.route as { rules: Array<Record<string, unknown>> }
    const expression = (rules.find(rule => rule.outbound === 'game-tuic')!.process_path_regex as string[])[0]
    expect(expression.startsWith('(?i)')).toBe(true)
    const regex = new RegExp(expression.slice(4), 'i')
    expect(regex.test('code(X)+.EXE')).toBe(true)
    expect(regex.test('C:\\Apps\\code(X)+.EXE')).toBe(true)
    expect(regex.test('Codex.exe')).toBe(false)
    expect(regex.test('Code(x)+.exe.bak')).toBe(false)
  })

  it('fails clearly when a required node is missing', () => {
    const broken = { ...fallbackManifest, nodes: [] }
    expect(() =>
      buildSingBoxConfig(broken, {
        mode: 'smart',
        appRules: [],
        strictRoute: true,
        ipv6: false,
      }),
    ).toThrow('Manifest is missing vless node')
  })

  it('passes the bundled sing-box schema check', () => {
    const manifest = structuredClone(fallbackManifest)
    const vless = manifest.nodes.find((node) => node.type === 'vless')
    const tuic = manifest.nodes.find((node) => node.type === 'tuic')
    if (!vless || !tuic) throw new Error('Test manifest is incomplete')
    vless.uuid = '11111111-1111-4111-8111-111111111111'
    vless.transport.path = '/ws/test'
    tuic.uuid = '22222222-2222-4222-8222-222222222222'
    tuic.password = 'test-password'
    const target = join(process.cwd(), '.sing-box-schema-test.json')
    try {
      for (const mode of ['smart', 'fast'] as const) {
        writeFileSync(target, JSON.stringify(buildSingBoxConfig(manifest, {
          mode,
          appRules: [gameRule],
          strictRoute: true,
          ipv6: false,
          ruleSetDirectory: join(process.cwd(), 'resources', 'rules'),
        })))
        const result = spawnSync(join(process.cwd(), 'resources', 'bin', 'sing-box.exe'), ['check', '-c', target], { encoding: 'utf8' })
        expect(result.stderr || result.stdout).toBe('')
        expect(result.status).toBe(0)
      }
    } finally {
      rmSync(target, { force: true })
    }
  })
})

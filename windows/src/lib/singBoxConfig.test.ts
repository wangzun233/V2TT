import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fallbackManifest } from '../data/fallbackManifest'
import type { AppRule } from '../types'
import { buildSingBoxConfig } from './singBoxConfig'

const gameRule: AppRule = {
  id: 'game',
  name: 'Game',
  executable: 'game.exe',
  target: 'game',
  enabled: true,
}

describe('buildSingBoxConfig', () => {
  it('routes configured game applications to TUIC in smart mode', () => {
    const config = buildSingBoxConfig(fallbackManifest, {
      mode: 'smart',
      appRules: [gameRule],
      strictRoute: true,
      ipv6: false,
    })
    const route = config.route as { rules: Array<Record<string, unknown>> }
    expect(route.rules).toContainEqual({
      process_name: ['game.exe'],
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
      process_name: ['Codex.exe', 'ChatGPT.exe', 'com.vortex.helper.exe'],
      outbound: 'daily-vless',
    })
    expect(route.rules).not.toContainEqual({ network: 'udp', port: 443, action: 'reject', method: 'drop' })
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

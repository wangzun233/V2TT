import type { DeviceManifest } from '../types'

export const fallbackManifest: DeviceManifest = {
  schema_version: 1,
  generated_at: '2026-08-25T00:00:00+08:00',
  profile: {
    id: 'DEMO',
    name: 'DEMO',
    expires_at: null,
    update_interval_hours: 24,
  },
  routing: {
    default_mode: 'smart',
    daily_node: 'demo-vless-cdn',
    game_node: 'demo-tuic',
  },
  nodes: [
    {
      id: 'demo-vless-cdn',
      name: 'DEMO VLESS CDN',
      type: 'vless',
      role: 'daily',
      server: 'daily.example.com',
      server_port: 443,
      uuid: '',
      tls: { enabled: true, server_name: 'daily.example.com' },
      transport: {
        type: 'ws',
        path: '/unavailable',
        host: 'daily.example.com',
      },
    },
    {
      id: 'demo-tuic',
      name: 'DEMO TUIC',
      type: 'tuic',
      role: 'game',
      server: 'game.example.com',
      server_port: 443,
      uuid: '',
      password: '',
      congestion_control: 'bbr',
      udp_relay_mode: 'native',
      tls: {
        enabled: true,
        server_name: 'game.example.com',
        alpn: ['h3'],
      },
    },
  ],
}

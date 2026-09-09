const manifest = {
  schema_version: 1, generated_at: new Date().toISOString(),
  profile: { id: 'TEST', name: 'TEST', expires_at: null, update_interval_hours: 24 },
  routing: { default_mode: 'smart', daily_node: 'daily', game_node: 'game' },
  nodes: [
    { id: 'daily', name: 'TEST Daily', type: 'vless', role: 'daily', server: 'example.com', server_port: 443, uuid: '00000000-0000-4000-8000-000000000001', tls: { enabled: true, server_name: 'example.com' }, transport: { type: 'ws', host: 'example.com', path: '/private-test-path' } },
    { id: 'game', name: 'TEST Game', type: 'tuic', role: 'game', server: 'example.com', server_port: 443, uuid: '00000000-0000-4000-8000-000000000002', password: 'test-only-password', tls: { enabled: true, server_name: 'example.com', alpn: ['h3'] }, congestion_control: 'bbr', udp_relay_mode: 'native' },
  ],
}
module.exports.manifest = manifest


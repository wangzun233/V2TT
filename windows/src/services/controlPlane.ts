import { fallbackManifest } from '../data/fallbackManifest'
import type { DeviceManifest } from '../types'

export interface ManifestResult {
  manifest: DeviceManifest
  source: 'remote' | 'cache'
}

export async function loadManifest(refresh = false): Promise<ManifestResult> {
  if (window.v2tt) {
    return refresh ? window.v2tt.refreshManifest() : window.v2tt.getManifest()
  }
  return { manifest: fallbackManifest, source: 'remote' }
}

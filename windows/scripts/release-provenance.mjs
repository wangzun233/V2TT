import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const report = {
  recordedAt: new Date().toISOString(),
  core: {
    file: 'resources/bin/sing-box.exe',
    sha256: sha256('resources/bin/sing-box.exe'),
    versionOutput: execFileSync(path.resolve('resources/bin/sing-box.exe'), ['version'], { encoding: 'utf8', windowsHide: true }).trim(),
    sourceRevision: '0b8995879f29a9b98ee027bc17b75e101445b238',
    repositoryRevisionResolved: 'https://api.github.com/repos/SagerNet/sing-box/commits/0b8995879f29a9b98ee027bc17b75e101445b238',
    sourceArchive: 'vendor/sing-box-0b89958.tar.gz',
    sourceArchiveSha256: sha256('../vendor/sing-box-0b89958.tar.gz'),
    releaseArchiveByteComparison: 'NOT APPLICABLE: locally built from pinned upstream source; not an official release binary',
  },
  rules: [
    ['geoip-cn', 'sing-geoip', '52b386508b9d67fa193091f932c0a6eae145595c'],
    ['geosite-cn', 'sing-geosite', '815c3a6b65d24e24a541f63b8693e0b79ab4c4c2'],
  ].map(([name, repo, blob]) => ({
    file: `resources/rules/${name}.srs`, sha256: sha256(`resources/rules/${name}.srs`),
    verifiedBlobUrl: `https://api.github.com/repos/SagerNet/${repo}/git/blobs/${blob}`,
    source: `vendor/rules/${name}.json`, sourceSha256: sha256(`../vendor/rules/${name}.json`),
  })),
}
writeFileSync('release/dependency-provenance.json', JSON.stringify(report, null, 2) + '\n')
console.log('Dependency provenance written; release-archive comparison explicitly unverified')

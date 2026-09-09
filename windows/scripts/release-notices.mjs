import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run through npm run release:notices')
const packages = execFileSync(process.execPath, [npmCli, 'ls', '--omit=dev', '--all', '--parseable'], { encoding: 'utf8' }).trim().split(/\r?\n/)
const index = []
for (const folder of new Set(packages)) {
  if (folder === root) continue
  if (!path.resolve(folder).startsWith(path.join(root, 'node_modules') + path.sep)) throw new Error('Unexpected package path')
  const pkg = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'))
  const target = path.join(root, 'LICENSES', 'npm', pkg.name.replaceAll('/', '__'))
  const files = readdirSync(folder).filter((name) => /^(LICEN[SC]E|COPYING|NOTICE)(\.|$)/i.test(name))
  if (!files.length) throw new Error(`No license text found: ${pkg.name}`)
  mkdirSync(target, { recursive: true })
  for (const name of files) copyFileSync(path.join(folder, name), path.join(target, name))
  index.push({ name: pkg.name, version: pkg.version, license: pkg.license, files })
}
if (!existsSync('LICENSES/sing-box.txt')) throw new Error('Missing sing-box license')
writeFileSync('LICENSES/npm/index.json', JSON.stringify(index, null, 2) + '\n')
console.log(`Collected license texts for ${index.length} runtime packages`)

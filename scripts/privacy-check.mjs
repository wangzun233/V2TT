import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Never print matched values: diagnostics identify only the path and category.
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ['provider-token', /(?:ghp_|github_pat_|cfut_)[A-Za-z0-9_]{20,}/],
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
  ['credential-in-url', /https?:\/\/[^\s/"'<>:]+:[^\s/"'<>]+@/],
  ['personal-windows-path', /[A-Z]:[\\/]Users[\\/](?!Public(?:[\\/]|$)|Default(?:[\\/]|$))[^\\/\s]+[\\/]/i],
]
const forbidden = /(^|\/)(?:\.env(?:\..*)?|local\.properties|account\.bin|subscription\.bin|manifest\.bin|preferences\.json|service-account-credentials\.json)$|\.(?:pem|key|p12|pfx|jks|keystore|log)$/i
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))]
if (!paths.length) throw new Error('No tracked files to review')
let failures = 0
for (const path of paths) {
  if (forbidden.test(path)) { console.error(`${path}: forbidden-file`); failures++ }
  const bytes = readFileSync(path)
  const encodings = [bytes.toString('utf8'), bytes.toString('utf16le')]
  for (const [category, pattern] of rules) {
    const review = category === 'credential-in-url' ? encodings.map((text) => text
      .replace(/https:\/\/user:(?:pass|secret)@example\.com\/(?:sub|account)/g, '[synthetic invalid URL test]')
      .replace(/http:\/\/probe:\$\{password\}@127\.0\.0\.1:\$\{port\}/g, '[runtime generated loopback credential]')) : encodings
    if (review.some((text) => pattern.test(text))) { console.error(`${path}: ${category}`); failures++ }
  }
}
console.log(JSON.stringify({ checkedFiles: paths.length, findings: failures, scope: 'tracked and non-ignored new files; archives and user-specific denylist require separate review' }))
process.exitCode = failures ? 1 : 0

import { build } from 'rolldown'

await build({ input: 'src/lib/singBoxConfig.ts', platform: 'node', output: { file: 'electron/generated/config.cjs', format: 'cjs' } })

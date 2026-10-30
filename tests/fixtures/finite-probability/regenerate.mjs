// Export an exact finite-model theorem without manufacturing observation records.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const executable = process.env.EAL_CORE_EXECUTABLE
if (!executable || !isAbsolute(executable)) throw new Error('Set an absolute EAL_CORE_EXECUTABLE path.')
const directory = fileURLToPath(new URL('.', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'aspic-finite-model-'))
const core = (...args) => execFileSync(executable, ['--workspace', work, ...args], { encoding: 'utf8' })

try {
  copyFileSync(join(directory, 'case.eal'), join(work, 'case.eal'))
  writeFileSync(join(work, 'records.json'), '{}\n')
  const compiled = core('compile-aspic', 'case.eal', '--claim', 'consequence',
    '--now', '2026-10-30T12:00:00Z', '--context', '{}', '--records', 'records.json')
  writeFileSync(join(work, 'compiled.json'), compiled)
  const exported = core('export-aspic', 'compiled.json')
  const view = JSON.parse(exported)
  const proof = view.arguments.find(argument => argument.origin.name === 'proof')
  const computation = proof?.origin.computation
  if (view.authored_claim_status !== 'supported' || view.unavailable_evidence.length
    || computation?.method !== 'finite_probability/1' || computation.status !== 'supported'
    || computation.details.posterior_exact.numerator !== '152'
    || computation.details.posterior_exact.denominator !== '201'
    || view.arguments.some(argument => argument.origin.observation)) {
    throw new Error('Native export did not retain the exact finite-model result without observations.')
  }
  writeFileSync(join(directory, 'view.json'), exported)
  console.log(`Regenerated ${view.arguments.length} arguments with the exact posterior 152/201 and no observations.`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

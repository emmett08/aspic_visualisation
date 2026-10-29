// Rebuild a synthetic EAL/4 snapshot through the native compiler and checked exporter.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const executable = process.env.EAL_CORE_EXECUTABLE
if (!executable || !isAbsolute(executable)) throw new Error('Set an absolute EAL_CORE_EXECUTABLE path.')
const directory = fileURLToPath(new URL('.', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'aspic-eal4-fixture-'))
const now = '2026-10-24T12:00:00Z'
const context = { site: 'bench' }
// These fixture identities use only ASCII keys, strings, booleans and integers.
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const core = (...args) => execFileSync(executable, ['--workspace', work, ...args], { encoding: 'utf8' })
const put = (name, value) => writeFileSync(join(work, name), JSON.stringify(value, null, 2) + '\n')

try {
  copyFileSync(join(directory, 'case.eal'), join(work, 'case.eal'))
  const program = JSON.parse(core('compile', 'case.eal'))
  const records = Object.fromEntries([['observed', { passed: true }], ['unresolved', {}]].map(([name, value]) => {
    const evidence = program.evidence[name]
    const tool = program.tools[evidence.tool]
    const acquisition = { tool: tool.name, tool_version: tool.version, input: evidence.input, context }
    const request = { evidence_id: name, environment: evidence.environment, ...acquisition }
    return [name, {
      schema: 'EAL/observation-record/1', evidence_id: name, source_digest: program.source_digest,
      tool: tool.name, tool_version: tool.version, tool_binding_digest: '0'.repeat(64),
      evidence_kind: evidence.kind, environment: evidence.environment,
      environment_fingerprint: digest({ environment: evidence.environment, context }),
      input_digest: digest(evidence.input), input: evidence.input, context,
      acquisition_request: acquisition, acquisition_request_digest: digest(acquisition), request_digest: digest(request),
      collected_at: now, run_id: `synthetic-eal4-${name}`, status: 'ok', data_digest: digest(value), value,
    }]
  }))
  put('records.json', records)
  const compiled = JSON.parse(core('compile-aspic', 'case.eal', '--claim', 'working', '--now', now,
    '--context', JSON.stringify(context), '--records', 'records.json'))
  put('compiled.json', compiled)
  const exported = core('export-aspic', 'compiled.json')
  const view = JSON.parse(exported)
  for (const cause of ['predicate_unresolved', 'dependency_unavailable']) {
    if (!view.unavailable_evidence.some(item => item.availability_issues.includes(cause))) {
      throw new Error(`Expected the native export to preserve ${cause}.`)
    }
  }
  writeFileSync(join(directory, 'view.json'), exported)
  console.log(`Regenerated ${view.arguments.length} arguments and ${view.unavailable_evidence.length} unavailable evidence records.`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

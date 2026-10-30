// Run synthetic source values through native grounding, compilation and checked export.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const executable = process.env.EAL_CORE_EXECUTABLE
if (!executable || !isAbsolute(executable)) throw new Error('Set an absolute EAL_CORE_EXECUTABLE path.')
const directory = fileURLToPath(new URL('.', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'aspic-grounding-fixture-'))
const now = '2026-10-24T12:00:00Z'
const start = '2026-10-24T11:00:00Z'
const end = '2026-10-24T13:00:00Z'
const context = { site: 'bench' }
// Fixture values use ASCII keys, strings, booleans and small exact integers.
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const core = (...args) => execFileSync(executable, ['--workspace', work, ...args], { encoding: 'utf8' })
const put = (name, value) => writeFileSync(join(work, name), JSON.stringify(value, null, 2) + '\n')

try {
  copyFileSync(join(directory, 'case.eal'), join(work, 'case.eal'))
  const program = JSON.parse(core('compile', 'case.eal'))
  const records = Object.fromEntries(['checked', 'wrong_unit', 'undefined_symbol'].map(caseName => {
    const name = `${caseName}_input`
    const evidence = program.evidence[name]
    const tool = program.tools[evidence.tool]
    const observationValue = {
      voltage: 9, calibrated: true, device: 'supply-S', unit: caseName === 'wrong_unit' ? 'mV' : 'V',
      scope: { config: 'bench-C' }, valid_from: start, valid_until: end,
    }
    const value = {
      schema: 'EAL/typed-input/1', method: 'grounded/1', subject: 'synthetic grounding fixture',
      quantity: 'proposition', unit: '1', scope: 'synthetic bench record', valid_from: start, valid_until: end,
      payload: {
        ...program.claims[`${caseName}_claim`].proposition.query,
        assessed_at: now, observations: {
          reading_S: { status: 'available', value: observationValue, observed_at: now, source_digest: digest(observationValue) },
        },
      },
    }
    const acquisition = { tool: tool.name, tool_version: tool.version, input: evidence.input, context }
    const request = { evidence_id: name, environment: evidence.environment, ...acquisition }
    return [name, {
      schema: 'EAL/observation-record/1', evidence_id: name, source_digest: program.source_digest,
      tool: tool.name, tool_version: tool.version, tool_binding_digest: '0'.repeat(64),
      evidence_kind: evidence.kind, environment: evidence.environment,
      environment_fingerprint: digest({ environment: evidence.environment, context }),
      input_digest: digest(evidence.input), input: evidence.input, context,
      acquisition_request: acquisition, acquisition_request_digest: digest(acquisition), request_digest: digest(request),
      collected_at: now, run_id: `synthetic-grounding-${name}`, status: 'ok', data_digest: digest(value), value,
    }]
  }))
  put('records.json', records)
  let assessed
  try {
    assessed = JSON.parse(core('evaluate', 'case.eal', '--now', now, '--context', JSON.stringify(context), '--records', 'records.json'))
  } catch (error) {
    if (typeof error.stdout !== 'string') throw error
    assessed = JSON.parse(error.stdout)
  }
  if (assessed.valid !== true || assessed.complete !== true) {
    const methods = Object.fromEntries(Object.entries(assessed.arguments ?? {}).map(([name, value]) => [name, {
      status: value.reasoning_result?.status, reasons: value.reasoning_result?.reasons,
      verification: value.reasoning_result?.details?.verification?.status,
    }]))
    throw new Error(`Expected completed checks, including an explicit unknown result: ${JSON.stringify(methods)}`)
  }
  const compiled = JSON.parse(core('compile-aspic', 'case.eal', '--claim', 'checked_claim', '--now', now,
    '--context', JSON.stringify(context), '--records', 'records.json'))
  put('compiled.json', compiled)
  const exported = core('export-aspic', 'compiled.json')
  const view = JSON.parse(exported)
  const statuses = Object.fromEntries((view.verification_reports ?? []).map(entry => [entry.argument_name, entry.report?.status]))
  if (statuses.checked_route !== 'pass' || statuses.wrong_unit_route !== 'fail' || statuses.undefined_symbol_route !== 'unknown') {
    throw new Error(`Expected distinct native pass/fail/unknown reports, got ${JSON.stringify(statuses)}`)
  }
  if (view.arguments.some(argument => ['wrong_unit_route', 'undefined_symbol_route'].includes(argument.origin.name))) {
    throw new Error('Failed or unresolved grounding unexpectedly constructed an argument.')
  }
  writeFileSync(join(directory, 'view.json'), exported)
  console.log(`Regenerated ${view.arguments.length} graph arguments and all ${view.verification_reports.length} native verification reports.`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

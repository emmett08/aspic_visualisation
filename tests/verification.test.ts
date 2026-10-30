import { describe, expect, it } from 'vitest'
import { parseAspicView, validateAspicView } from '../src/domain/aspic'
import { sampleView } from '../src/domain/sample'
import type { RecordedVerification } from '../src/domain/verification'
import { exactVerificationQuantities } from '../src/domain/verification'
import nativeVerification from './fixtures/grounded-verification/view.json'

function recordedVerification(): RecordedVerification & { report: NonNullable<RecordedVerification['report']> } {
  return {
    argument_name: 'unconstructed_route', source: 'native_method', method_status: 'supported', reasons: [],
    report: {
      schema: 'eal.verification-report/1', target_id: 'power_requirement', mode: 'empirical', status: 'unknown',
      obligations: [
        { id: 'source_binding', role: 'grounding', status: 'pass', reasons: ['Reading bound to supply S.'], details: { observation_id: 'reading_S', pointer: '/voltage', expected_unit: 'V' } },
        { id: 'calibration', role: 'applicability', status: 'unknown', reasons: ['Calibration record is unavailable.'], details: { observation_id: 'reading_S' } },
      ],
      atoms: [{ symbol: 'voltage_low', observation_id: 'reading_S', status: 'pass', truth: true, reasons: [], details: { measurement: { numerator: '9007199254740993', denominator: '1000000000000000' } } }],
      formulas: [{ id: 'premise_0', status: 'pass', truth: true, reasons: [], details: { formula: 'voltage_low' } }],
    },
  }
}

function fixture(entry: RecordedVerification = recordedVerification()) {
  return { ...structuredClone(sampleView), verification_reports: [entry] }
}

describe('recorded verification reports', () => {
  it('imports the actual native pass, failed-unit and undefined-symbol reports', () => {
    const view = parseAspicView(JSON.stringify(nativeVerification))
    const records = Object.fromEntries(view.verification_reports!.map(entry => [entry.argument_name, entry]))
    expect(records.checked_route!.report!.status).toBe('pass')
    expect(records.wrong_unit_route!.report!.status).toBe('fail')
    expect(records.undefined_symbol_route!.report!.status).toBe('unknown')
    expect(view.verification_reports!.every(entry => entry.source === 'native_method' && entry.method_status === 'supported')).toBe(true)
    expect(records.wrong_unit_route!.report!.obligations.find(obligation => obligation.id.endsWith(':unit'))).toMatchObject({ status: 'fail', details: { expected: 'V', actual: 'mV' } })
    expect(records.undefined_symbol_route!.report!.atoms[0]).toMatchObject({ symbol: 'low_voltage', observation_id: null, status: 'unknown', truth: null })
    expect(view.arguments.some(argument => ['wrong_unit_route', 'undefined_symbol_route'].includes(argument.origin.name))).toBe(false)
    expect(view.query_status).toBe('accepted')
  })

  it('retains reports for an unconstructed source route without changing graph acceptance', () => {
    const input = fixture()
    const view = parseAspicView(JSON.stringify(input))
    expect(view).toEqual(input)
    expect(view.arguments.some(argument => argument.origin.name === 'unconstructed_route')).toBe(false)
    expect(view.arguments).toEqual(sampleView.arguments)
    expect(view.formal_status).toBe(sampleView.formal_status)
    expect(view.verification_reports![0]!.report!.atoms[0]!.details.measurement).toEqual({ numerator: '9007199254740993', denominator: '1000000000000000' })
  })

  it('keeps pass, fail, unknown and not-required obligations distinct', () => {
    for (const status of ['pass', 'fail', 'unknown', 'not_required'] as const) {
      const entry = recordedVerification()
      entry.report.obligations[0]!.status = status
      expect(validateAspicView(fixture(entry)).verification_reports![0]!.report!.obligations[0]!.status).toBe(status)
    }
    for (const mode of ['mathematical', 'empirical', 'defeasible'] as const) {
      const entry = recordedVerification()
      entry.report.mode = mode
      expect(validateAspicView(fixture(entry)).verification_reports![0]!.report!.mode).toBe(mode)
    }
  })

  it('retains an undefined symbol without inventing a source or false truth value', () => {
    const entry = recordedVerification()
    entry.report.atoms[0] = { symbol: 'undefined', observation_id: null, status: 'unknown', truth: null, reasons: ['Symbol has no binding.'], details: {} }
    expect(validateAspicView(fixture(entry)).verification_reports![0]!.report!.atoms[0]).toEqual(entry.report.atoms[0])
  })

  it('retains skipped and incomplete execution without creating obligation results', () => {
    for (const method_status of ['not_run', 'incomplete'] as const) {
      const entry: RecordedVerification = { argument_name: 'missing_source', source: 'native_method', method_status, reasons: ['Source unavailable.'], report: null }
      expect(validateAspicView(fixture(entry)).verification_reports).toEqual([entry])
    }
  })

  it('distinguishes native method reports from attached EngArg assurance records', () => {
    const entry = recordedVerification()
    entry.source = 'engarg_assurance'
    expect(validateAspicView(fixture(entry)).verification_reports![0]!.source).toBe('engarg_assurance')
    Object.assign(entry, { source: 'authenticated' })
    expect(() => validateAspicView(fixture(entry))).toThrow('allowed values')
  })

  it('requires the closed versioned report contract without inventing verification on old snapshots', () => {
    expect(validateAspicView(sampleView).verification_reports).toBeUndefined()
    for (const patch of [{ status: 'verified' }, { status: 'not_required' }, { mode: 'truth' }, { schema: 'eal.verification-report/2' }, { authenticated: true }]) {
      const entry = recordedVerification()
      Object.assign(entry.report, patch)
      expect(() => validateAspicView(fixture(entry))).toThrow()
    }
    const invalid = fixture() as unknown as { verification_reports: { report: Record<string, unknown> }[] }
    delete invalid.verification_reports[0]!.report!.atoms
    expect(() => validateAspicView(invalid)).toThrow('atoms')
  })

  it('bounds all report detail payloads and rejects non-JSON values', () => {
    const entry = recordedVerification()
    entry.report.obligations[0]!.details = { nested: { nested: { value: true } } }
    const input = fixture(entry)
    input.execution_limits.json_depth = 4
    expect(() => validateAspicView(input)).toThrow('JSON budget')
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, () => true]) {
      const invalid = recordedVerification()
      invalid.report.atoms[0]!.details = { value } as never
      expect(() => validateAspicView(fixture(invalid))).toThrow('verification reports')
    }
  })

  it('retains hostile source text as text without interpreting or rewriting it', () => {
    const entry = recordedVerification()
    const hostile = '<img src=x onerror="window.injected=true">'
    entry.report.obligations[1]!.reasons = [hostile]
    entry.report.atoms[0]!.details = { source: hostile }
    expect(validateAspicView(fixture(entry)).verification_reports![0]!.report!.atoms[0]!.details.source).toBe(hostile)
  })

  it('preserves large exact quantities and rejects rounded integer imports', () => {
    const details = { fields: { 'sensor/value': { schema: 'eal.exact-number/1', numerator: '9007199254740993', denominator: '1', unit: '1' } } }
    expect(exactVerificationQuantities(details)).toEqual([{ path: '/fields/sensor~1value', value: '9007199254740993/1', unit: '1' }])
    const entry = recordedVerification()
    entry.report.atoms[0]!.details = details
    expect(parseAspicView(JSON.stringify(fixture(entry))).verification_reports![0]!.report!.atoms[0]!.details).toEqual(details)
    entry.report.atoms[0]!.details = { value: 9007199254740992 }
    const raw = JSON.stringify(fixture(entry)).replace('9007199254740992', '9007199254740993')
    expect(() => parseAspicView(raw)).toThrow('exact-number string components')
  })
})

import { describe, expect, it } from 'vitest'
import { parseAspicView, validateAspicView } from '../src/domain/aspic'
import { sampleView } from '../src/domain/sample'
import { exactComputationQuantities } from '../src/domain/computation'
import type { ComputationResult } from '../src/domain/computation'
import finiteProbability from './fixtures/finite-probability/view.json'

function fixture(computation: ComputationResult) {
  const view = structuredClone(sampleView)
  view.arguments.find(argument => argument.origin.kind === 'argument')!.origin.computation = computation
  return view
}

function result(): ComputationResult {
  return {
    method: 'finite_probability/1', status: 'supported',
    reasons: ['The declared finite model was enumerated.'],
    details: { posterior: { numerator: '152', denominator: '201' }, defined: true },
  }
}

describe('supplied native computation metadata', () => {
  it('imports the actual exact finite-model theorem export without fabricated observations', () => {
    const view = parseAspicView(JSON.stringify(finiteProbability))
    expect(view.arguments).toHaveLength(2)
    expect(view.authored_claim_status).toBe('supported')
    expect(view.arguments.every(argument => argument.origin.observation === undefined)).toBe(true)
    expect(view.unavailable_evidence).toEqual([])
    const proof = view.arguments.find(argument => argument.origin.name === 'proof')!
    expect(proof.origin.computation!.method).toBe('finite_probability/1')
    expect(proof.origin.computation!.details.posterior_exact).toMatchObject({ numerator: '152', denominator: '201' })
    expect(exactComputationQuantities(proof.origin.computation!)).toContainEqual({ name: 'posterior_exact', value: '152/201', unit: '1' })
  })

  it('keeps exact-number strings intact and leaves malformed declarations in raw details', () => {
    const computation = { ...result(), details: {
      exact: { schema: 'eal.exact-number/1', numerator: '9007199254740993', denominator: '2', unit: '1' },
      invalid: { schema: 'eal.exact-number/1', numerator: '12', denominator: '0', unit: '1' },
    } }
    expect(exactComputationQuantities(computation)).toEqual([{ name: 'exact', value: '9007199254740993/2', unit: '1' }])
  })

  it('preserves old snapshots without adding an implied computation result', () => {
    const view = parseAspicView(JSON.stringify(sampleView))
    expect(view.arguments.every(argument => argument.origin.computation === undefined)).toBe(true)
  })

  it('retains method details without changing graph labels or claim acceptance', () => {
    const input = fixture(result())
    const view = parseAspicView(JSON.stringify(input))
    expect(view).toEqual(input)
    expect(view.formal_status).toBe(sampleView.formal_status)
    expect(view.claim_status).toBe(sampleView.claim_status)
    expect(view.arguments.map(argument => argument.label)).toEqual(sampleView.arguments.map(argument => argument.label))
    for (const status of ['supported', 'unsupported', 'not_run', 'incomplete'] as const) {
      expect(validateAspicView(fixture({ ...result(), status })).arguments.find(argument => argument.origin.computation)!.origin.computation!.status).toBe(status)
    }
  })

  it('rejects invented statuses, omitted details and extra outer claims', () => {
    for (const status of ['complete', 'invalid', 'true', 'verified']) {
      expect(() => validateAspicView(fixture({ ...result(), status } as unknown as ComputationResult))).toThrow('allowed values')
    }
    const omitted = result() as unknown as Record<string, unknown>
    delete omitted.details
    expect(() => validateAspicView(fixture(omitted as unknown as ComputationResult))).toThrow('details')
    expect(() => validateAspicView(fixture({ ...result(), authenticated: true } as unknown as ComputationResult))).toThrow('additional properties')
    expect(() => validateAspicView(fixture({ ...result(), details: [] } as unknown as ComputationResult))).toThrow('object')
  })

  it('bounds identifiers and reasons while retaining source text as inert values', () => {
    expect(() => validateAspicView(fixture({ ...result(), method: 'm'.repeat(100_001) }))).toThrow('100000')
    expect(() => validateAspicView(fixture({ ...result(), reasons: Array.from({ length: 100_001 }, () => 'reason') }))).toThrow('100000')
    expect(() => validateAspicView(fixture({ ...result(), reasons: ['x'.repeat(100_001)] }))).toThrow('100000')
    const hostile = '<img src=x onerror="window.injected=true">'
    const view = validateAspicView(fixture({ ...result(), details: { source: hostile }, reasons: [hostile] }))
    expect(view.arguments.find(argument => argument.origin.computation)!.origin.computation!.details.source).toBe(hostile)
  })

  it('applies captured JSON depth and node budgets to method-specific details', () => {
    const depth = fixture({ ...result(), details: { first: { second: { value: true } } } })
    depth.execution_limits.json_depth = 2
    expect(() => validateAspicView(depth)).toThrow('JSON budget')
    const nodes = fixture({ ...result(), details: { cells: [null, null, null] } })
    nodes.execution_limits.json_nodes = 4
    expect(() => validateAspicView(nodes)).toThrow('JSON budget')
    const bounded = fixture({ ...result(), details: { value: true } })
    bounded.execution_limits.json_depth = 2
    bounded.execution_limits.json_nodes = 4
    expect(validateAspicView(bounded)).toEqual(bounded)
  })

  it('requires finite JSON values in the open method-specific payload', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, () => true]) {
      const invalid = fixture({ ...result(), details: { value } } as unknown as ComputationResult)
      expect(() => validateAspicView(invalid)).toThrow('computation details')
    }
  })
})

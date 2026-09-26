import { describe, expect, it } from 'vitest'
import { engineeringDemo, parseTheoryFields, type TheoryFields } from '../src/domain/theory'

const parse = (changes: Partial<TheoryFields> = {}) => parseTheoryFields({ ...engineeringDemo, ...changes })

describe('explicit theory input notation', () => {
  it('encodes the engineering demo without implicit contraries or preferences', () => {
    const theory = parse()
    expect(theory.premises).toEqual([
      { atom: 'voltage_ok', kind: 'axiom' },
      { atom: 'test_pass', kind: 'ordinary', rank: 500 },
      { atom: 'vibration', kind: 'ordinary', rank: 500 },
      { atom: 'inspection_ok', kind: 'ordinary', rank: 700 },
    ])
    expect(theory.rules).toEqual([
      { id: 's1', kind: 'strict', antecedents: ['voltage_ok'], consequent: 'power_ok' },
      { id: 'd1', kind: 'defeasible', antecedents: ['test_pass', 'power_ok'], consequent: 'pump_ready', name: 'applicable_d1', rank: 500 },
      { id: 'd2', kind: 'defeasible', antecedents: ['vibration'], consequent: 'unreliable_test', name: 'applicable_d2', rank: 500 },
      { id: 'd3', kind: 'defeasible', antecedents: ['inspection_ok'], consequent: 'pump_ready', name: 'applicable_d3', rank: 700 },
    ])
    expect(theory.contraries).toEqual([{ attacker: 'unreliable_test', target: 'applicable_d1' }])
    expect(theory.goal).toBe('pump_ready')
  })

  it('accepts whitespace, Windows newlines, rank bounds and explicitly directed negation atoms', () => {
    const theory = parse({ axioms: ' \r\n voltage_ok \r\n', premises: 'p @ 0\r\n ~p @ 1000', contraries: 'p -> ~p\n~p -> p' })
    expect(theory.premises.slice(1)).toEqual([{ atom: 'p', kind: 'ordinary', rank: 0 }, { atom: '~p', kind: 'ordinary', rank: 1000 }])
    expect(theory.contraries).toHaveLength(2)
  })

  it.each(['-1', '1001', '1.5', 'NaN', '', '5 @ 4'])('rejects invalid rank %j with input location', rank => {
    expect(() => parse({ premises: `p @ ${rank}` })).toThrow(/Ordinary premises, line 1/)
    expect(() => parse({ defeasibleRules: `r: p => q @ ${rank}` })).toThrow(/Defeasible rules, line 1/)
  })

  it('rejects duplicate premises across kinds and duplicate rules across kinds', () => {
    expect(() => parse({ premises: 'voltage_ok' })).toThrow('duplicate premise voltage_ok')
    expect(() => parse({ defeasibleRules: 's1: p => q' })).toThrow('duplicate rule ID s1')
    expect(() => parse({ contraries: 'p -> q\np -> q' })).toThrow('duplicate contrary pair')
  })

  it('does not silently swap strict and defeasible arrows or accept ranks on strict declarations', () => {
    expect(() => parse({ strictRules: 's1: p => q' })).toThrow('Strict rules, line 1')
    expect(() => parse({ defeasibleRules: 'd1: p -> q' })).toThrow('Defeasible rules, line 1')
    expect(() => parse({ strictRules: 's1: p -> q @ 500' })).toThrow('Strict rules, line 1')
    expect(() => parse({ axioms: 'p @ 500' })).toThrow('Axioms, line 1')
  })

  it('rejects malformed and repeated antecedents, self contraries and missing goals', () => {
    expect(() => parse({ strictRules: 's1: -> q' })).toThrow('Strict rules, line 1')
    expect(() => parse({ strictRules: 's1: p, p -> q' })).toThrow('repeat an antecedent')
    expect(() => parse({ contraries: 'p <-> q' })).toThrow('Contraries, line 1')
    expect(() => parse({ contraries: 'p -> p' })).toThrow('distinct atoms')
    expect(() => parse({ goal: '' })).toThrow('Goal')
  })

  it('bounds total premises, rules and rule antecedents', () => {
    expect(() => parse({ axioms: '', premises: '' })).toThrow('between 1 and 64')
    expect(() => parse({ axioms: '', premises: Array.from({ length: 65 }, (_, i) => `p${i}`).join('\n') })).toThrow('between 1 and 64')
    expect(() => parse({ strictRules: Array.from({ length: 65 }, (_, i) => `s${i}: p -> q`).join('\n'), defeasibleRules: '' })).toThrow('at most 64 rules')
    expect(() => parse({ strictRules: 's1: a, b, c, d, e, f, g, h, i -> q' })).toThrow('at most 8 antecedents')
  })

  it('reserves enough identifier length for generated applicability names', () => {
    expect(parse({ defeasibleRules: `${'r'.repeat(53)}: p => q` }).rules.at(-1)).toHaveProperty('name', `applicable_${'r'.repeat(53)}`)
    expect(() => parse({ defeasibleRules: `${'r'.repeat(54)}: p => q` })).toThrow('at most 53 characters')
  })

  it('bounds the input before parsing', () => {
    expect(() => parse({ premises: ' '.repeat(65_537) })).toThrow('64 KiB')
  })
})

import { describe, expect, it } from 'vitest'
import { engineeringDemo, parseTheoryFields, type TheoryFields } from '../src/domain/theory'
import keywordTheory from './fixtures/aspic-keywords-theory.json'

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
    expect(() => parse({ axioms: '', premises: '' })).toThrow('between 1 and 4096')
    expect(() => parse({ axioms: '', premises: Array.from({ length: 4097 }, (_, i) => `p${i}`).join('\n') })).toThrow('between 1 and 4096')
    expect(() => parse({ strictRules: Array.from({ length: 4097 }, (_, i) => `s${i}: p -> q`).join('\n'), defeasibleRules: '' })).toThrow('at most 4096 rules')
    expect(() => parse({ strictRules: `s1: ${Array.from({length:129},(_,i)=>`p${i}`).join(', ')} -> q` })).toThrow('at most 128 antecedents')
  })

  it('reserves enough identifier length for generated applicability names', () => {
    expect(parse({ defeasibleRules: `${'r'.repeat(53)}: p => q` }).rules.at(-1)).toHaveProperty('name', `applicable_${'r'.repeat(53)}`)
    expect(() => parse({ defeasibleRules: `${'r'.repeat(54)}: p => q` })).toThrow('at most 53 characters')
  })

  it('preserves explicit applicability names and their undercut targets', () => {
    const theory = parse({
      defeasibleRules: 'd1 [use_primary]: test_pass, power_ok => pump_ready @ 700',
      contraries: '~use_primary -> use_primary',
    })
    expect(theory.rules.at(-1)).toEqual({
      id: 'd1', kind: 'defeasible', antecedents: ['test_pass', 'power_ok'],
      consequent: 'pump_ready', name: 'use_primary', rank: 700,
    })
    expect(theory.contraries).toEqual([{ attacker: '~use_primary', target: 'use_primary' }])
    expect(parse({ defeasibleRules: `${'r'.repeat(64)} [use_long]: p => q` }).rules.at(-1)).toHaveProperty('name', 'use_long')
  })

  it('reconstructs the complete keyword example without renaming its undercut applicability atoms', () => {
    const fields: TheoryFields = {
      axioms: keywordTheory.premises.filter(p => p.kind === 'axiom').map(p => p.atom).join('\n'),
      premises: keywordTheory.premises.filter(p => p.kind === 'ordinary').map(p => `${p.atom} @ ${p.rank}`).join('\n'),
      strictRules: keywordTheory.rules.filter(r => r.kind === 'strict').map(r => `${r.id}: ${r.antecedents.join(', ')} -> ${r.consequent}`).join('\n'),
      defeasibleRules: keywordTheory.rules.filter(r => r.kind === 'defeasible').map(r => `${r.id} [${r.name}]: ${r.antecedents.join(', ')} => ${r.consequent} @ ${r.rank}`).join('\n'),
      contraries: keywordTheory.contraries.map(c => `${c.attacker} -> ${c.target}`).join('\n'),
      goal: keywordTheory.goal,
      semantics: 'preferred', queryMode: 'sceptical', preference: 'last_link_partial',
      priorities: keywordTheory.priorities.map(p => `${p.kind} ${p.higher} > ${p.lower}`).join('\n'),
    }
    const theory = parseTheoryFields(fields)
    expect(theory).toEqual({ ...keywordTheory, rules: [...keywordTheory.rules].sort((a, b) => Number(a.kind === 'defeasible') - Number(b.kind === 'defeasible')) })
  })

  it.each(['', '~use_primary', 'use-primary', 'r'.repeat(65)])('rejects invalid explicit applicability name %j', name => {
    expect(() => parse({ defeasibleRules: `d1 [${name}]: p => q` })).toThrow(/Defeasible rules, line 1/)
  })

  it('rejects duplicate applicability names and names on strict rules', () => {
    expect(() => parse({ defeasibleRules: 'd1 [use]: p => q\nd2 [use]: p => r' })).toThrow('duplicate applicability name use')
    expect(() => parse({ defeasibleRules: 'd1: p => q\nd2 [applicable_d1]: p => r' })).toThrow('duplicate applicability name applicable_d1')
    expect(() => parse({ strictRules: 's1 [use]: p -> q' })).toThrow('a strict rule has no defeasible applicability name')
  })

  it('bounds the input before parsing', () => {
    expect(() => parse({ premises: ' '.repeat(65_537) })).toThrow('64 KiB')
  })
})

it('encodes explicit extension queries and typed partial priorities', () => {
  const theory = parseTheoryFields({...engineeringDemo, semantics:'preferred',queryMode:'credulous',preference:'last_link_partial',priorities:'rule d3 > d1'})
  expect(theory.options).toEqual({semantics:'preferred',query_mode:'credulous',preference:'last_link_partial'})
  expect(theory.priorities).toEqual([{kind:'rule',higher:'d3',lower:'d1'}])
  expect(()=>parseTheoryFields({...engineeringDemo,priorities:'rule d3 > d1'})).toThrow('partial')
})

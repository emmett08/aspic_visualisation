import { describe, expect, it } from 'vitest'
import { buildGraph, compareSnapshots, groundedLabels, MAX_FILE_BYTES, MAX_ARGUMENTS, MAX_DEFEATS, parseAspicView, validateAspicView } from '../src/domain/aspic'
import type { AspicArgument, AspicDefeat, AspicView, Label } from '../src/domain/aspic'
import { sampleView } from '../src/domain/sample'
import schema from '../schema/aspic-view.schema.json'
import scopedReview from './fixtures/scoped-review.json'
import keywordCompiled from './fixtures/aspic-keywords-compiled.json'
import keywordFormal from './fixtures/aspic-keywords-formal.json'

const clone = <T>(x: T): T => structuredClone(x)
function node(id: string, conclusion: string, children: string[] = []): AspicArgument {
  return { id, conclusion, top: children.length ? 'defeasible' : 'ordinary', direct_subarguments: children,
    subarguments: [], strength: 500, rank: 500, label: 'in',
    ...(children.length ? { rule_id: `r_${conclusion}`, rule_name: `app_${conclusion}` } : {}),
    origin: { kind: children.length ? 'argument' : 'evidence', name: `source_${conclusion}` }, display_conclusion: conclusion }
}
function view(arguments_: AspicArgument[], defeats: AspicDefeat[] = [], goal = arguments_.at(-1)!.conclusion): AspicView {
  const byId = new Map(arguments_.map(a => [a.id, a]))
  const closure = (a: AspicArgument): string[] => [...new Set(a.direct_subarguments.flatMap(id => [id, ...closure(byId.get(id)!)]))]
  const labels = groundedLabels(arguments_.map(a => a.id), defeats)
  arguments_.forEach(a => { a.subarguments = closure(a); a.label = labels.get(a.id)! })
  const goalLabels = arguments_.filter(a => a.conclusion === goal).map(a => a.label)
  return { ...sampleView, schema: 'aspic-view/3', profile: 'test-profile/1', goal, goal_claim: null,
    formal_status: goalLabels.includes('in') ? 'accepted' : goalLabels.includes('undecided') ? 'undecided' : goalLabels.length ? 'rejected' : 'unconstructed',
    claim_status: null, authored_claim_status: null, source_digest: null, snapshot_digest: null,
    theory_digest: '0'.repeat(64), evaluated_at: null, validation: { formal_result: 'recomputed', provenance: 'supplied' },
    semantics: 'grounded', query_mode: 'sceptical', preference: 'minimum_rank',
    query_status: goalLabels.includes('in') ? 'accepted' : goalLabels.includes('undecided') ? 'undecided' : goalLabels.length ? 'rejected' : 'unconstructed',
    extensions: [arguments_.filter(a => a.label === 'in').map(a => a.id)],
    execution_limits: {...sampleView.execution_limits, formal_arguments: MAX_ARGUMENTS, formal_defeats: MAX_DEFEATS},
    arguments: arguments_, defeats, unavailable_evidence: [] }
}
function diamond(): AspicView {
  return view([node('A0', 'measurement'), node('A1', 'thermal', ['A0']), node('A2', 'power', ['A0']), node('A3', 'goal', ['A1', 'A2'])])
}
function renumber(input: AspicView): AspicView {
  const result = clone(input)
  const names = new Map(result.arguments.map((a, i) => [a.id, `X${128 - i}`]))
  result.arguments.forEach(a => {
    a.id = names.get(a.id)!
    a.direct_subarguments = a.direct_subarguments.map(id => names.get(id)!)
    a.subarguments = a.subarguments.map(id => names.get(id)!)
  })
  result.defeats.forEach(d => { d.attacker = names.get(d.attacker)!; d.target = names.get(d.target)!; d.subargument = names.get(d.subargument)! })
  result.extensions = result.extensions.map(extension => extension.map(id => names.get(id)!))
  result.arguments.reverse()
  return result
}

describe('versioned import boundary', () => {
  it('keeps runtime limits aligned with the checked-in producer schema', () => {
    expect(schema.properties.schema.const).toBe('aspic-view/3')
    expect(schema.properties.arguments).not.toHaveProperty('maxItems')
    expect(MAX_ARGUMENTS).toBeGreaterThan(128)
    expect(schema.properties.defeats).not.toHaveProperty('maxItems')
    expect(schema.additionalProperties).toBe(false)
  })
  it('accepts a real EAL exporter fixture with sources, strict and alternative routes, and a defeat', () => {
    expect(parseAspicView(JSON.stringify(sampleView))).toEqual(sampleView)
    expect(sampleView.arguments).toHaveLength(11)
    expect(sampleView.defeats).toHaveLength(1)
    expect(sampleView.arguments.some(a => a.top === 'strict')).toBe(true)
    expect(sampleView.formal_status).toBe('accepted')
  })
  it('preserves reviewed strictness and rank alongside immediate nested derivations', () => {
    const input = validateAspicView(clone(sampleView))
    const strict = input.arguments.find(a => a.origin.name === 'report_arg')!
    expect(strict.top).toBe('strict')
    expect(strict.origin.formal_review?.kind).toBe('strict')
    expect(strict.origin.formal_review?.review).toBe('synthetic-review/checked-record-implication')
    const parent = input.arguments.find(a => a.origin.name === 'independent_probe')!
    const byId = new Map(input.arguments.map(a => [a.id, a]))
    const child = byId.get(parent.direct_subarguments[0]!)!
    expect(child.origin.name).toBe('probe_arg')
    expect(child.direct_subarguments).toHaveLength(1)
    expect(parent.subarguments).toContain(child.direct_subarguments[0])
    expect(parent.rank).toBe(700)
    expect(parent.origin.formal_review?.kind).toBe('rank')
  })
  it('requires v2 typed availability causes and keeps absence distinct from a failed predicate', () => {
    const input = clone(sampleView)
    input.unavailable_evidence = [
      { name: 'missing', reasons: ['Synthetic absent observation.'], availability_issues: ['missing_observation'], span: null },
      { name: 'negative', reasons: ['Synthetic observed predicate did not hold.'], availability_issues: ['predicate_not_met'], span: null },
    ]
    expect(validateAspicView(input).unavailable_evidence).toEqual(input.unavailable_evidence)
    expect(() => validateAspicView({ ...input, schema: 'aspic-view/1' })).toThrow('constant')
    const invalid = clone(input) as unknown as { unavailable_evidence: Record<string, unknown>[] }
    delete invalid.unavailable_evidence[0]!.availability_issues
    expect(() => validateAspicView(invalid)).toThrow('availability_issues')
    invalid.unavailable_evidence[0]!.availability_issues = ['unknown']
    expect(() => validateAspicView(invalid)).toThrow('allowed values')
    invalid.unavailable_evidence[0]!.availability_issues = ['missing_observation', 'missing_observation']
    expect(() => validateAspicView(invalid)).toThrow('duplicate')
  })
  it('rejects malformed JSON and legacy compiled-result envelopes', () => {
    expect(() => parseAspicView('{')).toThrow('invalid JSON')
    expect(() => validateAspicView({ theory: {}, formal: {} })).toThrow('required')
  })
  it('bounds UTF-8 bytes before parsing, including multibyte text', () => {
    expect(() => parseAspicView(' '.repeat(MAX_FILE_BYTES + 1))).toThrow('4 MiB')
    expect(() => parseAspicView('😀'.repeat(MAX_FILE_BYTES / 4 + 1))).toThrow('4 MiB')
  })
  it('enforces supplied host budgets and independent browser limits', () => {
    const excess = clone(sampleView)
    excess.arguments = Array.from({ length: MAX_ARGUMENTS + 1 }, () => clone(excess.arguments[0]!))
    expect(() => validateAspicView(excess)).toThrow(String(MAX_ARGUMENTS))
    const defeats = clone(sampleView)
    defeats.defeats = Array.from({ length: MAX_DEFEATS + 1 }, () => clone(defeats.defeats[0]!))
    expect(() => validateAspicView(defeats)).toThrow()
  })
  it('rejects unknown schema versions, unknown fields, and duplicate argument IDs', () => {
    expect(() => validateAspicView({ ...sampleView, schema: 'aspic-view/99' })).toThrow('schema')
    expect(() => parseAspicView(JSON.stringify(sampleView).replace('"schema":', '"__proto__":{},"schema":'))).toThrow('additional properties')
    const bad = clone(sampleView); bad.arguments[1]!.id = bad.arguments[0]!.id
    expect(() => validateAspicView(bad)).toThrow('unique')
  })
  it('rejects invalid labels, digest shapes, and provenance claims', () => {
    const bad = clone(sampleView) as unknown as { arguments: { label: string }[] }
    bad.arguments[0]!.label = 'true'
    expect(() => validateAspicView(bad)).toThrow('allowed values')
    expect(() => validateAspicView({ ...sampleView, theory_digest: 'not-a-digest' })).toThrow('pattern')
    expect(() => validateAspicView({ ...sampleView, validation: { formal_result: 'recomputed', provenance: 'authenticated' } })).toThrow('constant')
  })
  it('requires source text to be strings and leaves text inert, without interpreting HTML', () => {
    const bad = clone(sampleView); (bad.arguments[0]!.origin as unknown as { name: object }).name = { html: '<b>x</b>' }
    expect(() => validateAspicView(bad)).toThrow('string')
    const source = clone(sampleView); source.arguments[0]!.authored_statement = '<img src=x onerror=alert(1)>'
    expect(validateAspicView(source).arguments[0]!.authored_statement).toBe('<img src=x onerror=alert(1)>')
  })
  it('bounds source coordinates without authenticating timestamps or reinterpreting annotations', () => {
    const bad = clone(sampleView)
    bad.arguments[0]!.origin.span = { line: 0, end_line: 4, column: 1, end_column: 1 }
    expect(() => validateAspicView(bad)).toThrow('>= 1')
    // These fields remain supplied provenance: the browser validates their shape.
    expect(validateAspicView({ ...sampleView, evaluated_at: 'unverified source timestamp' }).evaluated_at).toBe('unverified source timestamp')
    const invalidReview = clone(sampleView)
    invalidReview.arguments[0]!.origin.formal_review = { kind: 'rank', name: 'r', rank: 1001, other: null, review: 'review/r', span: null, target_kind: 'argument' }
    expect(() => validateAspicView(invalidReview)).toThrow()
  })
})

describe('graph integrity and semantics', () => {
  it('accepts a diamond with one shared premise and checks transitive closure', () => {
    const input = validateAspicView(diamond())
    expect(input.arguments.at(-1)!.subarguments).toEqual(['A1', 'A0', 'A2'])
    const forged = clone(input); forged.arguments.at(-1)!.subarguments.pop()
    expect(() => validateAspicView(forged)).toThrow('transitive subarguments')
  })
  it('rejects missing references, cycles, duplicate construction, and inconsistent strength', () => {
    const unknown = diamond(); unknown.arguments[1]!.direct_subarguments = ['missing']
    expect(() => validateAspicView(unknown)).toThrow('unknown direct')
    const cycle = diamond(); cycle.arguments[1]!.direct_subarguments = ['A3']
    expect(() => validateAspicView(cycle)).toThrow('cyclic direct')
    const duplicate = diamond(); duplicate.arguments.push({ ...clone(duplicate.arguments[1]!), id: 'Z' })
    expect(() => validateAspicView(duplicate)).toThrow('duplicate argument construction')
    const badStrength = diamond(); badStrength.arguments[1]!.strength = 800
    expect(() => validateAspicView(badStrength)).toThrow('strength disagrees')
  })
  it('rejects defeat witnesses outside the target derivation and wrong attack kinds', () => {
    const input = diamond()
    input.defeats = [{ attacker: 'A2', target: 'A1', subargument: 'A2', kind: 'undercut' }]
    expect(() => validateAspicView(input)).toThrow('not a subargument')
    input.defeats = [{ attacker: 'A2', target: 'A1', subargument: 'A0', kind: 'undercut' }]
    expect(() => validateAspicView(input)).toThrow('attack kind')
    input.defeats = [{ attacker: 'Z', target: 'A1', subargument: 'A1', kind: 'undercut' }]
    expect(() => validateAspicView(input)).toThrow('unknown attacker')
  })
  it('preserves distinct defeat witnesses between the same argument pair', () => {
    const args = [...diamond().arguments, node('A4', 'objection')]
    const defeats: AspicDefeat[] = ['A1', 'A2'].flatMap(subargument => [subargument, 'A3'].map(target => ({ attacker: 'A4', target, subargument, kind: 'undercut' })))
    const input = validateAspicView(view(args, defeats, 'goal'))
    const graph = buildGraph(input)
    expect(graph.nodes).toHaveLength(5)
    expect(graph.edges.filter(e => e.data.kind === 'support')).toHaveLength(4)
    const witnesses = graph.edges.filter(e => e.data.kind === 'undercut' && e.data.target === 'argument:A3')
    expect(witnesses.map(e => e.data.subargument)).toEqual(['A1', 'A2'])
    expect(new Set(graph.edges.map(e => e.data.id)).size).toBe(graph.edges.length)
    expect(witnesses.every(e => e.data.source === 'argument:A4' && e.data.target === 'argument:A3')).toBe(true)
    input.defeats.push(clone(input.defeats[0]!))
    expect(() => validateAspicView(input)).toThrow('duplicate defeat witness')
  })
  it('requires every supplied attack family to propagate to its subargument and superarguments', () => {
    const args = [...diamond().arguments, node('A4', 'objection')]
    const incomplete = view(args, [{ attacker: 'A4', target: 'A3', subargument: 'A1', kind: 'undercut' }], 'goal')
    expect(() => validateAspicView(incomplete)).toThrow('missing propagated defeat')
    const missingParent = view(args, [{ attacker: 'A4', target: 'A1', subargument: 'A1', kind: 'undercut' }], 'goal')
    expect(() => validateAspicView(missingParent)).toThrow('missing propagated defeat')
  })
  it('rejects a rule argument with no antecedents', () => {
    const malformed = diamond()
    malformed.arguments[3]!.direct_subarguments = []
    malformed.arguments[3]!.subarguments = []
    expect(() => validateAspicView(malformed)).toThrow('direct derivation disagree')
  })
  it('orients support edges child to parent and marks every goal derivation', () => {
    const graph = buildGraph(validateAspicView(diamond()))
    expect(graph.edges.some(e => e.data.source === 'argument:A0' && e.data.target === 'argument:A1')).toBe(true)
    expect(graph.nodes.filter(n => n.data.goal).map(n => n.data.argumentId)).toEqual(['A3'])
  })
  it('rejects forged labels even when the envelope claims exporter recomputation', () => {
    const bad = clone(sampleView); bad.arguments.find(a => a.label === 'out')!.label = 'in'
    expect(() => validateAspicView(bad)).toThrow('grounded labelling')
    expect(() => validateAspicView({ ...sampleView, formal_status: 'rejected' })).toThrow('constructed goal')
  })
  it('supports grounded undecided cycles and self-attacks', () => {
    const pair = view([node('A0', 'p'), node('A1', 'q')], [
      { attacker: 'A0', target: 'A1', subargument: 'A1', kind: 'undermine' },
      { attacker: 'A1', target: 'A0', subargument: 'A0', kind: 'undermine' },
    ])
    expect(validateAspicView(pair).arguments.map(a => a.label)).toEqual(['undecided', 'undecided'])
    const self = view([node('A0', 'p')], [{ attacker: 'A0', target: 'A0', subargument: 'A0', kind: 'undermine' }])
    expect(validateAspicView(self).formal_status).toBe('undecided')
  })
  it('matches the characteristic-function extension on all 512 three-node defeat graphs', () => {
    const ids = ['A0', 'A1', 'A2']
    for (let mask = 0; mask < 512; mask++) {
      const edges: { attacker: string; target: string }[] = []
      for (let i = 0; i < 9; i++) if (mask & (1 << i)) edges.push({ attacker: ids[Math.floor(i / 3)]!, target: ids[i % 3]! })
      let extension = new Set<string>()
      for (let iteration = 0; iteration < 4; iteration++) {
        const defeated = new Set(edges.filter(e => extension.has(e.attacker)).map(e => e.target))
        const next = new Set(ids.filter(id => edges.filter(e => e.target === id).every(e => defeated.has(e.attacker))))
        if ([...next].every(id => extension.has(id)) && next.size === extension.size) break
        extension = next
      }
      const rejected = new Set(edges.filter(e => extension.has(e.attacker)).map(e => e.target))
      const reference = new Map<string, Label>(ids.map(id => [id, extension.has(id) ? 'in' : rejected.has(id) ? 'out' : 'undecided']))
      expect(groundedLabels(ids, edges), `graph ${mask}`).toEqual(reference)
    }
  })
})

describe('snapshot identity and change classification', () => {
  it('matches renumbered, reordered diamond arguments by derivation and source identity', () => {
    const before = validateAspicView(diamond()), after = validateAspicView(renumber(before))
    const diff = compareSnapshots(before, after)
    expect(diff.added).toEqual([]); expect(diff.removed).toEqual([]); expect(diff.labelChanged).toEqual([])
    expect(diff.unchanged).toHaveLength(4)
    expect(diff.unchanged.every(p => p.previousId !== p.currentId)).toBe(true)
  })
  it('ignores the order of conjunctive antecedents in derivation identity', () => {
    const before = diamond(), after = clone(before)
    after.arguments[3]!.direct_subarguments.reverse()
    const diff = compareSnapshots(before, validateAspicView(after))
    expect(diff.unchanged).toHaveLength(4)
    expect(diff.added).toEqual([]); expect(diff.removed).toEqual([])
    after.arguments.push({ ...clone(after.arguments[3]!), id: 'Z', direct_subarguments: ['A1', 'A2'] })
    expect(() => validateAspicView(after)).toThrow('duplicate argument construction')
  })
  it('classifies an added objection and an existing route label change despite ID renumbering', () => {
    const before = diamond()
    const updated = view([...clone(before.arguments), node('A4', 'objection')], [{ attacker: 'A4', target: 'A3', subargument: 'A3', kind: 'undercut' }], 'goal')
    const after = renumber(validateAspicView(updated))
    const diff = compareSnapshots(before, after)
    expect(diff.added).toEqual(['X124']); expect(diff.removed).toEqual([])
    expect(diff.labelChanged).toEqual([{ previousId: 'A3', currentId: 'X125', previousLabel: 'in', currentLabel: 'out' }])
    expect(diff.unchanged).toHaveLength(3)
    const reversed = compareSnapshots(after, before)
    expect(reversed.removed).toEqual(['X124'])
  })
  it('does not use mutable ranks, provenance, or source positions as derivation identities', () => {
    const before = diamond(), after = clone(before)
    after.arguments.forEach(a => { a.rank = 700; a.strength = 700; a.origin.span = { line: 100, end_line: 101, column: 1, end_column: 1 } })
    after.theory_digest = 'a'.repeat(64)
    const diff = compareSnapshots(before, validateAspicView(after))
    expect(diff.unchanged).toHaveLength(4); expect(diff.added).toEqual([])
    expect(diff.warnings.some(w => w.includes('digests differ'))).toBe(true)
    expect(diff.warnings.some(w => w.includes('ranks, observations or defeat relationships'))).toBe(true)
  })
  it('treats changed source/rule identities as replacement and warns on profile differences', () => {
    const before = diamond(), after = clone(before)
    after.arguments[3]!.origin.name = 'different_authored_route'; after.arguments[3]!.rule_id = 'other_rule'
    after.profile = 'another-profile/1'
    const diff = compareSnapshots(before, after)
    expect(diff.added).toEqual(['A3']); expect(diff.removed).toEqual(['A3'])
    expect(diff.warnings.some(w => w.includes('profiles differ'))).toBe(true)
  })
  it('compares a 127-node layered diamond without expanding recursive signature strings', () => {
    const args = [node('A0', 'base')]
    let previous = ['A0']
    for (let level = 0; level < 63; level++) {
      const pair = [`A${args.length}`, `A${args.length + 1}`]
      for (const [side, id] of pair.entries()) {
        const a = node(id, `layer_${level}_${side}`, previous)
        a.subarguments = [...new Set(previous.flatMap(child => [child, ...args.find(n => n.id === child)!.subarguments]))]
        args.push(a)
      }
      previous = pair
    }
    // Avoid the deliberately simple test fixture's recursive closure walk here.
    const before = { ...view([node('Z', 'placeholder')]), arguments: args, goal: args.at(-1)!.conclusion,
      extensions: [args.map(a => a.id)] }
    validateAspicView(before)
    const after = validateAspicView(renumber(before))
    expect(compareSnapshots(before, after).unchanged).toHaveLength(127)
  })
})


describe('extension queries and typed evidence groups', () => {
  it('imports the all-keywords EAL compilation with every reviewed directive kind', () => {
    const value = validateAspicView(keywordCompiled)
    expect(value.arguments).toHaveLength(15)
    expect(value.defeats).toHaveLength(6)
    expect(new Set(value.formal_directives.map(d => d.kind))).toEqual(new Set(['strict', 'rank', 'contrary', 'prefer']))
    expect(value.arguments.some(a => a.top === 'strict' && a.origin.formal_review?.kind === 'strict')).toBe(true)
    expect(value.preference).toBe('last_link_partial')
    expect(value.query_status).toBe('accepted')
  })
  it('preserves all three defeat kinds, negative atoms and two preferred extensions in the explicit keyword theory', () => {
    const value = validateAspicView(keywordFormal)
    expect(value.arguments).toHaveLength(15)
    expect(value.defeats).toHaveLength(10)
    expect(new Set(value.defeats.map(d => d.kind))).toEqual(new Set(['undermine', 'rebut', 'undercut']))
    expect(value.arguments.find(a => a.rule_id === 'primary_ready')?.rule_name).toBe('use_primary')
    expect(value.arguments.some(a => a.conclusion === '~use_primary')).toBe(true)
    expect(value.extensions).toHaveLength(2)
    expect(value.query_status).toBe('accepted')
    expect(value.arguments.filter(a => a.conclusion.startsWith('estimate_')).map(a => a.label)).toEqual(['undecided', 'undecided'])
    const byId = new Map(value.arguments.map(a => [a.id, a]))
    const undercut = value.defeats.find(d => d.kind === 'undercut' && d.subargument !== d.target)!
    expect(byId.get(undercut.subargument)?.rule_name).toBe('use_primary')
    expect(byId.get(undercut.target)?.rule_id).toBe('report_ready')
  })
  it('imports the actual compound recursive EAL example with reviewed partial priorities', () => {
    const value = validateAspicView(scopedReview)
    expect(value.semantics).toBe('preferred'); expect(value.preference).toBe('last_link_partial')
    expect(value.query_status).toBe('accepted')
    expect(value.arguments.some(a => a.origin.name === 'release.checks.rest.item')).toBe(true)
    expect(value.arguments.some(a => a.origin.name === 'release.assess.child')).toBe(true)
    expect(value.formal_directives.some(d => d.kind === 'prefer')).toBe(true)
  })
  const pair = () => {
    const value = view([node('P', 'p'), node('Q', 'q')], [
      {attacker:'P',target:'Q',subargument:'Q',kind:'undermine'},
      {attacker:'Q',target:'P',subargument:'P',kind:'undermine'},
    ], 'p')
    value.semantics = 'preferred'; value.query_mode = 'credulous'; value.extensions = [['P'],['Q']]
    value.query_status = 'accepted'
    return value
  }
  it('keeps grounded labels distinct from credulous and sceptical preferred queries', () => {
    const value = validateAspicView(pair())
    expect(value.formal_status).toBe('undecided'); expect(value.query_status).toBe('accepted')
    expect(() => validateAspicView({...value,query_mode:'sceptical'})).toThrow('query_status')
    expect(validateAspicView({...value,query_mode:'sceptical',query_status:'undecided'}).query_status).toBe('undecided')
  })
  it('rejects conflicting, undefended or false stable extensions', () => {
    const value = pair()
    expect(() => validateAspicView({...value,extensions:[['P','Q']]})).toThrow('conflict')
    expect(() => validateAspicView({...value,semantics:'stable',extensions:[[]]})).toThrow('stable')
  })
  it('represents absent stable extensions without vacuous acceptance', () => {
    const value = view([node('P','p')],[{attacker:'P',target:'P',subargument:'P',kind:'undermine'}],'p')
    expect(validateAspicView({...value,semantics:'stable',extensions:[],query_status:'no_extension'}).query_status).toBe('no_extension')
    expect(() => validateAspicView({...value,semantics:'stable',extensions:[],query_status:'accepted'})).toThrow('query_status')
  })
  it('allows more than the previous 128 arguments under captured and browser budgets', () => {
    const value = view(Array.from({length:129},(_,i)=>node(`N${i}`,`p${i}`)))
    value.execution_limits.formal_arguments = 200
    expect(validateAspicView(value).arguments).toHaveLength(129)
    expect(() => validateAspicView({...value,execution_limits:{...value.execution_limits,formal_arguments:128}})).toThrow('budget')
  })
})

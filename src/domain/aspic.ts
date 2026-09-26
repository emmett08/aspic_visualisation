import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../schema/aspic-view.schema.json'

/** Read-only browser boundary for the versioned EAL ASPIC+ export.
 * Validation checks the supplied graph. It cannot authenticate provenance or prove
 * that a supplied graph contains every argument/defeat of an underlying theory.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const MAX_ARGUMENTS = 128
export const MAX_DEFEATS = 4096
export type Label = 'in' | 'out' | 'undecided'
export type FormalStatus = 'accepted' | 'rejected' | 'undecided' | 'unconstructed'
export type ClaimStatus = 'supported' | 'contested' | 'unsupported' | 'out_of_scope'
export type DefeatKind = 'undermine' | 'rebut' | 'undercut'
export interface SourceSpan { line: number; column: number; end_line: number; end_column: number }
export interface FormalDirective {
  kind: 'strict' | 'rank' | 'contrary'; name: string; other: string | null;
  rank: number | null; review: string; span: SourceSpan | null;
  target_kind: 'evidence' | 'assumption' | 'argument' | 'objection' | 'claim'
}
export interface Observation {
  run_id: string; data_digest: string; request_digest: string;
  collected_at: string; tool_binding_digest: string
}
export interface ArgumentOrigin {
  kind: 'evidence' | 'argument' | 'assumption' | 'objection' | 'structural basis' | 'formal rule' | 'formal premise';
  name: string; span?: SourceSpan | null; formal_review?: FormalDirective | null;
  observation?: Observation | null; rationale?: string; reasoning?: string; meaning?: string
}
export interface AspicArgument {
  id: string; conclusion: string; top: 'axiom' | 'ordinary' | 'strict' | 'defeasible';
  direct_subarguments: string[]; subarguments: string[]; strength: number; label: Label;
  rule_id?: string; rule_name?: string; rank?: number; origin: ArgumentOrigin;
  display_conclusion: string; authored_statement?: string
}
export interface AspicDefeat {
  attacker: string; target: string; subargument: string; kind: DefeatKind;
  relation_origin?: { objection: string | null; annotation: FormalDirective | null }
}
export interface AspicView {
  schema: 'aspic-view/1'; profile: string; goal: string; goal_claim: string | null;
  formal_status: FormalStatus; claim_status: ClaimStatus | null; authored_claim_status: ClaimStatus | null;
  source_digest: string | null; snapshot_digest: string | null; theory_digest: string;
  evaluated_at: string | null;
  validation: { formal_result: 'recomputed'; provenance: 'supplied' };
  arguments: AspicArgument[]; defeats: AspicDefeat[];
  unavailable_evidence: { name: string; reasons: string[]; span: SourceSpan | null }[]
}

export class ViewValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ViewValidationError' }
}
const fail = (path: string, message: string): never => { throw new ViewValidationError(`${path}: ${message}`) }
const encoder = new TextEncoder()
const validateStructure = new Ajv2020({ allErrors: false, strict: true }).compile<AspicView>(schema)

/** Grounded labelling of an abstract defeat graph; no ASPIC theory construction. */
export function groundedLabels(ids: string[], defeats: Pick<AspicDefeat, 'attacker' | 'target'>[]): Map<string, Label> {
  const attackers = new Map(ids.map(id => [id, new Set<string>()]))
  defeats.forEach(d => attackers.get(d.target)?.add(d.attacker))
  const labels = new Map<string, Label>(ids.map(id => [id, 'undecided']))
  let changed = true
  while (changed) {
    changed = false
    for (const id of ids) {
      if (labels.get(id) !== 'undecided') continue
      const incoming = [...attackers.get(id)!]
      if (incoming.some(a => labels.get(a) === 'in')) { labels.set(id, 'out'); changed = true }
      else if (incoming.every(a => labels.get(a) === 'out')) { labels.set(id, 'in'); changed = true }
    }
  }
  return labels
}

function validateGraph(view: AspicView): void {
  const byId = new Map(view.arguments.map(a => [a.id, a]))
  if (byId.size !== view.arguments.length) fail('arguments', 'argument IDs must be unique')
  for (const a of view.arguments) {
    // These are semantic relationships between fields, beyond JSON shape.
    if (!['axiom', 'ordinary', 'strict', 'defeasible'].includes(a.top)) fail(`argument ${a.id}`, 'unknown top inference kind')
    if (new Set(a.direct_subarguments).size !== a.direct_subarguments.length || new Set(a.subarguments).size !== a.subarguments.length) fail(`argument ${a.id}`, 'duplicate subargument references')
    const rule = a.top === 'strict' || a.top === 'defeasible'
    if (rule !== (a.rule_id !== undefined) || (rule ? !a.direct_subarguments.length : a.direct_subarguments.length)) fail(`argument ${a.id}`, 'rule identity and direct derivation disagree with inference kind')
    if ((a.top === 'defeasible') !== (a.rule_name !== undefined)) fail(`argument ${a.id}`, 'applicability name required exactly for defeasible rules')
    if ((a.top === 'ordinary' || a.top === 'defeasible') !== (a.rank !== undefined)) fail(`argument ${a.id}`, 'rank required exactly for fallible inferences')
  }
  const closures = new Map<string, Set<string>>()
  const visiting = new Set<string>()
  const closure = (id: string): Set<string> => {
    if (visiting.has(id)) fail(`argument ${id}`, 'cyclic direct derivation')
    const cached = closures.get(id)
    if (cached) return cached
    visiting.add(id)
    const descendants = new Set<string>()
    for (const child of byId.get(id)!.direct_subarguments) {
      if (!byId.has(child)) fail(`argument ${id}`, `unknown direct subargument ${child}`)
      descendants.add(child); closure(child).forEach(descendant => descendants.add(descendant))
    }
    visiting.delete(id); closures.set(id, descendants)
    return descendants
  }
  const constructions = new Set<string>()
  for (const a of view.arguments) {
    const expected = closure(a.id)
    if (expected.size !== a.subarguments.length || a.subarguments.some(id => !expected.has(id))) fail(`argument ${a.id}`, 'transitive subarguments disagree with direct derivation')
    const construction = JSON.stringify([a.top, a.rule_id ?? null, a.conclusion, [...a.direct_subarguments].sort()])
    if (constructions.has(construction)) fail(`argument ${a.id}`, 'duplicate argument construction')
    constructions.add(construction)
    const expectedStrength = Math.min(a.rank ?? 1001, ...a.direct_subarguments.map(id => byId.get(id)!.strength))
    if (a.strength !== expectedStrength) fail(`argument ${a.id}`, 'strength disagrees with its rank and direct subarguments')
  }
  const witnesses = new Set<string>()
  view.defeats.forEach((d, i) => {
    if (!byId.has(d.attacker) || !byId.has(d.target)) fail(`defeats[${i}]`, 'unknown attacker or target')
    if (d.subargument !== d.target && !closures.get(d.target)!.has(d.subargument)) fail(`defeats[${i}]`, 'witness is not a subargument of its target')
    const sub = byId.get(d.subargument)!
    if ((d.kind === 'undermine' && sub.top !== 'ordinary') || (d.kind !== 'undermine' && sub.top !== 'defeasible')) fail(`defeats[${i}]`, 'attack kind disagrees with the attacked subargument')
    const key = JSON.stringify([d.attacker, d.target, d.subargument, d.kind])
    if (witnesses.has(key)) fail(`defeats[${i}]`, 'duplicate defeat witness')
    witnesses.add(key)
  })
  // Once a defeat on a subargument is supplied, ASPIC+ propagates it to
  // that subargument and every containing superargument. Missing an entire
  // attack family still cannot be detected without the underlying theory.
  const families = new Map<string, AspicDefeat>()
  for (const d of view.defeats) families.set(JSON.stringify([d.attacker, d.subargument, d.kind]), d)
  for (const d of families.values()) {
    for (const target of view.arguments) {
      if (target.id === d.subargument || closures.get(target.id)!.has(d.subargument)) {
        const witness = JSON.stringify([d.attacker, target.id, d.subargument, d.kind])
        if (!witnesses.has(witness)) fail('defeats', `missing propagated defeat from ${d.attacker} at ${d.subargument} to ${target.id}`)
      }
    }
  }
  const labels = groundedLabels([...byId.keys()], view.defeats)
  for (const a of view.arguments) if (labels.get(a.id) !== a.label) fail(`argument ${a.id}.label`, 'does not match grounded labelling of the supplied defeat graph')
  const goalLabels = view.arguments.filter(a => a.conclusion === view.goal).map(a => a.label)
  const status: FormalStatus = goalLabels.includes('in') ? 'accepted' : goalLabels.includes('undecided') ? 'undecided' : goalLabels.length ? 'rejected' : 'unconstructed'
  if (view.formal_status !== status) fail('formal_status', 'does not match the constructed goal arguments')
}

export function parseAspicView(source: string): AspicView {
  if (encoder.encode(source).byteLength > MAX_FILE_BYTES) fail('file', 'exceeds the 4 MiB import limit')
  let value: unknown
  try { value = JSON.parse(source) } catch { fail('file', 'invalid JSON') }
  return validateAspicView(value)
}

export function validateAspicView(value: unknown): AspicView {
  let encoded: string | undefined
  try { encoded = JSON.stringify(value) } catch { fail('view', 'expected serialisable JSON') }
  if (!encoded || encoder.encode(encoded).byteLength > MAX_FILE_BYTES) fail('view', 'exceeds the 4 MiB import limit or is not JSON')
  if (!validateStructure(value)) {
    const issue = validateStructure.errors?.[0]
    fail(issue?.instancePath || 'view', `${issue?.message ?? 'invalid export'}${issue?.params ? ` (${JSON.stringify(issue.params)})` : ''}`)
  }
  const view = value as AspicView
  validateGraph(view)
  return view
}

export interface GraphNode { data: { id: string; argumentId: string; label: string; status: Label; originKind: string; goal: boolean } }
export interface GraphEdge { data: { id: string; source: string; target: string; kind: 'support' | DefeatKind; defeatIndex?: number; subargument?: string } }
export interface AspicGraph { nodes: GraphNode[]; edges: GraphEdge[] }
export function buildGraph(view: AspicView): AspicGraph {
  const nodes: GraphNode[] = view.arguments.map(a => ({ data: { id: `argument:${a.id}`, argumentId: a.id, label: a.display_conclusion, status: a.label, originKind: a.origin.kind, goal: a.conclusion === view.goal } }))
  const edges: GraphEdge[] = view.arguments.flatMap(a => a.direct_subarguments.map((child, i) => ({ data: { id: `support:${a.id}:${i}`, source: `argument:${child}`, target: `argument:${a.id}`, kind: 'support' as const } })))
  view.defeats.forEach((d, i) => edges.push({ data: { id: `defeat:${i}`, source: `argument:${d.attacker}`, target: `argument:${d.target}`, kind: d.kind, defeatIndex: i, subargument: d.subargument } }))
  return { nodes, edges }
}

export interface SnapshotDiff {
  added: string[]; removed: string[];
  labelChanged: { previousId: string; currentId: string; previousLabel: Label; currentLabel: Label }[];
  unchanged: { previousId: string; currentId: string }[];
  warnings: string[]
}
/** Compare structures using shared interned DAG classes, never transient A# IDs.
 * Every canonical key contains only immediate child classes: O(V+E) keys, with
 * no recursive string expansion on diamonds. Source positions/ranks/labels are
 * deliberately excluded from identity; their edits do not rename a derivation.
 */
export function compareSnapshots(previous: AspicView, current: AspicView): SnapshotDiff {
  const intern = new Map<string, number>()
  const index = (view: AspicView): Map<number, AspicArgument[]> => {
    const byId = new Map(view.arguments.map(a => [a.id, a]))
    const classes = new Map<string, number>()
    const classify = (id: string): number => {
      const cached = classes.get(id)
      if (cached !== undefined) return cached
      const a = byId.get(id)!
      const key = JSON.stringify([a.origin.kind, a.origin.name, a.top, a.rule_id ?? null, a.rule_name ?? null, a.conclusion, a.direct_subarguments.map(classify).sort((a, b) => a - b)])
      let identity = intern.get(key)
      if (identity === undefined) { identity = intern.size; intern.set(key, identity) }
      classes.set(id, identity)
      return identity
    }
    const result = new Map<number, AspicArgument[]>()
    for (const a of view.arguments) { const key = classify(a.id); const group = result.get(key) ?? []; group.push(a); result.set(key, group) }
    return result
  }
  const before = index(previous), after = index(current)
  const diff: SnapshotDiff = { added: [], removed: [], labelChanged: [], unchanged: [], warnings: [] }
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(key) ?? [], right = after.get(key) ?? []
    if (left.length > 1 || right.length > 1) {
      diff.warnings.push('Some derivations have indistinguishable source identities; they are listed as removed/added rather than paired.')
      diff.removed.push(...left.map(a => a.id)); diff.added.push(...right.map(a => a.id)); continue
    }
    const a = left[0], b = right[0]
    if (!a && b) diff.added.push(b.id)
    else if (a && !b) diff.removed.push(a.id)
    else if (a && b) {
      const pair = { previousId: a.id, currentId: b.id }
      if (a.label === b.label) diff.unchanged.push(pair)
      else diff.labelChanged.push({ ...pair, previousLabel: a.label, currentLabel: b.label })
    }
  }
  if (previous.profile !== current.profile) diff.warnings.push('The evaluation profiles differ; label changes may reflect different semantics.')
  if (previous.goal !== current.goal) diff.warnings.push('The selected goal differs between snapshots.')
  if (previous.source_digest !== current.source_digest || previous.theory_digest !== current.theory_digest || previous.snapshot_digest !== current.snapshot_digest) diff.warnings.push('Source, theory or observation snapshot digests differ. This comparison does not enumerate changes to ranks, observations or defeat relationships.')
  diff.warnings.push('Changes cover argument structure and labels only. Matching uses source names and derivation structure; it does not establish the cause of a change or authenticate either snapshot.')
  return diff
}

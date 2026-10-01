/** Text-entry notation for explicit theories, not an EAL source grammar. */
export interface TheoryFields {
  axioms: string
  premises: string
  strictRules: string
  defeasibleRules: string
  contraries: string
  goal: string
  semantics?: 'grounded' | 'preferred' | 'stable'
  queryMode?: 'credulous' | 'sceptical'
  preference?: 'minimum_rank' | 'last_link_rank' | 'last_link_partial'
  priorities?: string
}

export interface ExplicitTheory {
  premises: ({ atom: string; kind: 'axiom' } | { atom: string; kind: 'ordinary'; rank: number })[]
  rules: ({ id: string; kind: 'strict'; antecedents: string[]; consequent: string } |
    { id: string; kind: 'defeasible'; antecedents: string[]; consequent: string; name: string; rank: number })[]
  contraries: { attacker: string; target: string }[]
  options?: { semantics: string; query_mode: string; preference: string }
  priorities?: { kind: 'premise' | 'rule'; higher: string; lower: string }[]
  goal: string
}

export const emptyTheoryFields = (): TheoryFields => ({
  axioms: '', premises: '', strictRules: '', defeasibleRules: '', contraries: '', goal: '', semantics: 'grounded', queryMode: 'sceptical', preference: 'minimum_rank', priorities: '',
})

/** Synthetic pump-readiness example: a challenged test and an independent inspection. */
export const engineeringDemo: Readonly<TheoryFields> = {
  axioms: 'voltage_ok',
  premises: 'test_pass\nvibration\ninspection_ok @ 700',
  strictRules: 's1: voltage_ok -> power_ok',
  defeasibleRules: 'd1: test_pass, power_ok => pump_ready\nd2: vibration => unreliable_test\nd3: inspection_ok => pump_ready @ 700',
  contraries: 'unreliable_test -> applicable_d1',
  goal: 'pump_ready', semantics: 'grounded', queryMode: 'sceptical', preference: 'minimum_rank', priorities: '',
}

const literal = /^~?[A-Za-z][A-Za-z0-9_]{0,63}$/
const identifier = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const MAX_TEXT_BYTES = 64 * 1024
const encoder = new TextEncoder()

export class TheoryInputError extends Error {
  constructor(message: string) { super(message); this.name = 'TheoryInputError' }
}

function invalid(where: string, message: string): never {
  throw new TheoryInputError(`${where}: ${message}`)
}

function atom(value: string, where: string): string {
  const result = value.trim()
  if (!literal.test(result)) invalid(where, 'use a letter followed by letters, digits or underscores (up to 64 characters), optionally prefixed by ~')
  return result
}

function ranked(value: string, where: string): { text: string; rank: number } {
  const parts = value.split('@')
  if (parts.length > 2) invalid(where, 'use at most one @ rank suffix')
  const rankText = parts[1]?.trim()
  if (rankText !== undefined && (!/^\d{1,4}$/.test(rankText) || Number(rankText) > 1000)) {
    invalid(where, 'rank must be an integer from 0 to 1000')
  }
  return { text: parts[0]!.trim(), rank: rankText === undefined ? 500 : Number(rankText) }
}

function lines(text: string, label: string): { text: string; where: string }[] {
  return text.split(/\r?\n/).map((text, index) => ({ text: text.trim(), where: `${label}, line ${index + 1}` }))
    .filter(line => line.text.length > 0)
}

/** Check the input notation and limits; the EAL service checks formal semantics. */
export function parseTheoryFields(fields: TheoryFields): ExplicitTheory {
  if (encoder.encode(Object.values(fields).join('\n')).byteLength > MAX_TEXT_BYTES) {
    invalid('Theory', 'input exceeds 64 KiB')
  }
  const theory: ExplicitTheory = { premises: [], rules: [], contraries: [], goal: atom(fields.goal, 'Goal') }
  const premiseAtoms = new Set<string>()
  for (const kind of ['axiom', 'ordinary'] as const) {
    const input = kind === 'axiom' ? fields.axioms : fields.premises
    for (const line of lines(input, kind === 'axiom' ? 'Axioms' : 'Ordinary premises')) {
      const parsed = kind === 'ordinary' ? ranked(line.text, line.where) : { text: line.text, rank: 500 }
      const premise = atom(parsed.text, line.where)
      if (premiseAtoms.has(premise)) invalid(line.where, `duplicate premise ${premise}`)
      premiseAtoms.add(premise)
      theory.premises.push(kind === 'axiom' ? { atom: premise, kind } : { atom: premise, kind, rank: parsed.rank })
    }
  }
  if (!theory.premises.length || theory.premises.length > 4096) invalid('Premises', 'provide between 1 and 4096 axioms and ordinary premises in total')

  const ruleIds = new Set<string>()
  const ruleNames = new Set<string>()
  for (const kind of ['strict', 'defeasible'] as const) {
    for (const line of lines(kind === 'strict' ? fields.strictRules : fields.defeasibleRules, kind === 'strict' ? 'Strict rules' : 'Defeasible rules')) {
      const parsed = kind === 'defeasible' ? ranked(line.text, line.where) : { text: line.text, rank: 500 }
      const match = /^(\S+)(?:\s+\[([^\]]*)\])?\s*:\s*(.*?)\s*(->|=>)\s*(\S+)\s*$/.exec(parsed.text)
      if (!match || match[4] !== (kind === 'strict' ? '->' : '=>')) {
        invalid(line.where, `use ${kind === 'strict' ? 's1: p, q -> r' : 'd1 [applicability_name]: p, q => r [@ rank]; the bracketed name is optional'}`)
      }
      const id = match[1]!
      if (!identifier.test(id)) invalid(line.where, 'rule ID must be a positive atom of at most 64 characters')
      const explicitName = match[2]?.trim()
      if (kind === 'strict' && explicitName !== undefined) invalid(line.where, 'a strict rule has no defeasible applicability name')
      if (kind === 'defeasible' && explicitName === undefined && id.length > 53) invalid(line.where, 'defeasible rule ID may have at most 53 characters to allow its applicable_ name; supply an explicit name for longer IDs')
      const name = explicitName ?? `applicable_${id}`
      if (kind === 'defeasible') {
        if (!identifier.test(name)) invalid(line.where, 'applicability name must be a positive atom of at most 64 characters')
        if (ruleNames.has(name)) invalid(line.where, `duplicate applicability name ${name}`)
        ruleNames.add(name)
      }
      if (ruleIds.has(id)) invalid(line.where, `duplicate rule ID ${id}`)
      ruleIds.add(id)
      const antecedents = match[3]!.split(',').map(part => atom(part, line.where))
      if (antecedents.length > 128) invalid(line.where, 'a rule may have at most 128 antecedents')
      if (new Set(antecedents).size !== antecedents.length) invalid(line.where, 'a rule cannot repeat an antecedent')
      const consequent = atom(match[5]!, line.where)
      theory.rules.push(kind === 'strict' ? { id, kind, antecedents, consequent } :
        { id, kind, antecedents, consequent, name, rank: parsed.rank })
    }
  }
  if (theory.rules.length > 4096) invalid('Rules', 'provide at most 4096 rules in total')

  const pairs = new Set<string>()
  for (const line of lines(fields.contraries, 'Contraries')) {
    const match = /^(\S+)\s*->\s*(\S+)$/.exec(line.text)
    if (!match) invalid(line.where, 'use attacker -> target; add the reverse pair separately for a symmetric relation')
    const attacker = atom(match[1]!, line.where)
    const target = atom(match[2]!, line.where)
    if (attacker === target) invalid(line.where, 'a contrary pair must contain distinct atoms')
    const key = `${attacker}\0${target}`
    if (pairs.has(key)) invalid(line.where, 'duplicate contrary pair')
    pairs.add(key)
    theory.contraries.push({ attacker, target })
  }
  if (theory.contraries.length > 4096) invalid('Contraries', 'provide at most 4096 directed pairs')
  const atoms = new Set([theory.goal, ...premiseAtoms])
  for (const rule of theory.rules) {
    rule.antecedents.forEach(value => atoms.add(value)); atoms.add(rule.consequent)
    if (rule.kind === 'defeasible') atoms.add(rule.name)
  }
  for (const pair of theory.contraries) { atoms.add(pair.attacker); atoms.add(pair.target) }
  if (atoms.size > 4096) invalid('Theory', 'provide at most 4096 distinct atoms, including rule applicability names')
  const semantics = fields.semantics ?? 'grounded'
  const query_mode = fields.queryMode ?? 'sceptical'
  const preference = fields.preference ?? 'minimum_rank'
  if (!['grounded','preferred','stable'].includes(semantics) || !['credulous','sceptical'].includes(query_mode) || !['minimum_rank','last_link_rank','last_link_partial'].includes(preference)) invalid('Assessment', 'unknown semantics, query mode or preference')
  if (semantics !== 'grounded' || query_mode !== 'sceptical' || preference !== 'minimum_rank') theory.options = { semantics, query_mode, preference }
  const priorities = lines(fields.priorities ?? '', 'Priorities')
  if (priorities.length) {
    if (preference !== 'last_link_partial') invalid('Priorities', 'select partial last-link preference')
    theory.priorities = priorities.map(line => {
      const match = /^(premise|rule)\s+(\S+)\s*>\s*(\S+)$/.exec(line.text)
      if (!match) invalid(line.where, 'use premise p > q or rule d1 > d2')
      return {kind: match[1] as 'premise' | 'rule', higher: atom(match[2]!,line.where), lower:atom(match[3]!,line.where)}
    })
  }
  return theory
}

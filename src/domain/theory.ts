/** Text-entry notation for explicit theories, not an EAL source grammar. */
export interface TheoryFields {
  axioms: string
  premises: string
  strictRules: string
  defeasibleRules: string
  contraries: string
  goal: string
}

export interface ExplicitTheory {
  premises: ({ atom: string; kind: 'axiom' } | { atom: string; kind: 'ordinary'; rank: number })[]
  rules: ({ id: string; kind: 'strict'; antecedents: string[]; consequent: string } |
    { id: string; kind: 'defeasible'; antecedents: string[]; consequent: string; name: string; rank: number })[]
  contraries: { attacker: string; target: string }[]
  goal: string
}

export const emptyTheoryFields = (): TheoryFields => ({
  axioms: '', premises: '', strictRules: '', defeasibleRules: '', contraries: '', goal: '',
})

/** Synthetic pump-readiness example: a challenged test and an independent inspection. */
export const engineeringDemo: Readonly<TheoryFields> = {
  axioms: 'voltage_ok',
  premises: 'test_pass\nvibration\ninspection_ok @ 700',
  strictRules: 's1: voltage_ok -> power_ok',
  defeasibleRules: 'd1: test_pass, power_ok => pump_ready\nd2: vibration => unreliable_test\nd3: inspection_ok => pump_ready @ 700',
  contraries: 'unreliable_test -> applicable_d1',
  goal: 'pump_ready',
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
  if (!theory.premises.length || theory.premises.length > 64) invalid('Premises', 'provide between 1 and 64 axioms and ordinary premises in total')

  const ruleIds = new Set<string>()
  for (const kind of ['strict', 'defeasible'] as const) {
    for (const line of lines(kind === 'strict' ? fields.strictRules : fields.defeasibleRules, kind === 'strict' ? 'Strict rules' : 'Defeasible rules')) {
      const parsed = kind === 'defeasible' ? ranked(line.text, line.where) : { text: line.text, rank: 500 }
      const match = /^(\S+)\s*:\s*(.*?)\s*(->|=>)\s*(\S+)\s*$/.exec(parsed.text)
      if (!match || match[3] !== (kind === 'strict' ? '->' : '=>')) {
        invalid(line.where, `use ${kind === 'strict' ? 's1: p, q -> r' : 'd1: p, q => r [@ rank]'}`)
      }
      const id = match[1]!
      if (!identifier.test(id)) invalid(line.where, 'rule ID must be a positive atom of at most 64 characters')
      if (kind === 'defeasible' && id.length > 53) invalid(line.where, 'defeasible rule ID may have at most 53 characters to allow its applicable_ name')
      if (ruleIds.has(id)) invalid(line.where, `duplicate rule ID ${id}`)
      ruleIds.add(id)
      const antecedents = match[2]!.split(',').map(part => atom(part, line.where))
      if (antecedents.length > 8) invalid(line.where, 'a rule may have at most 8 antecedents')
      if (new Set(antecedents).size !== antecedents.length) invalid(line.where, 'a rule cannot repeat an antecedent')
      const consequent = atom(match[4]!, line.where)
      theory.rules.push(kind === 'strict' ? { id, kind, antecedents, consequent } :
        { id, kind, antecedents, consequent, name: `applicable_${id}`, rank: parsed.rank })
    }
  }
  if (theory.rules.length > 64) invalid('Rules', 'provide at most 64 rules in total')

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
  if (theory.contraries.length > 128) invalid('Contraries', 'provide at most 128 directed pairs')
  const atoms = new Set([theory.goal, ...premiseAtoms])
  for (const rule of theory.rules) {
    rule.antecedents.forEach(value => atoms.add(value)); atoms.add(rule.consequent)
    if (rule.kind === 'defeasible') atoms.add(rule.name)
  }
  for (const pair of theory.contraries) { atoms.add(pair.attacker); atoms.add(pair.target) }
  if (atoms.size > 128) invalid('Theory', 'provide at most 128 distinct atoms, including rule applicability names')
  return theory
}

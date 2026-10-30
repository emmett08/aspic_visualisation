/** Inspect supplied method results without evaluating their scientific meaning. */
export type ComputationStatus = 'supported' | 'unsupported' | 'not_run' | 'incomplete'
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface ComputationResult {
  method: string
  status: ComputationStatus
  reasons: string[]
  details: Record<string, JsonValue>
}

export const computationStatusText: Record<ComputationStatus, string> = {
  supported: 'Supported', unsupported: 'Unsupported', not_run: 'Not run', incomplete: 'Incomplete',
}

/** Display declared exact quantities without converting them to browser numbers. */
export function exactComputationQuantities(computation: ComputationResult): { name: string; value: string; unit: string }[] {
  return Object.entries(computation.details).flatMap(([name, value]) => {
    if (value === null || Array.isArray(value) || typeof value !== 'object'
      || value.schema !== 'eal.exact-number/1' || typeof value.numerator !== 'string'
      || typeof value.denominator !== 'string' || typeof value.unit !== 'string'
      || !/^-?\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return []
    return [{ name, value: `${value.numerator}/${value.denominator}`, unit: value.unit }]
  })
}

/** Open method-specific details still obey the captured and browser JSON budgets. */
export function computationDetailsIssue(
  computations: ComputationResult[],
  limits: { json_depth: number; json_nodes: number },
): string | null {
  const maximumDepth = Math.min(limits.json_depth, 64)
  let remaining = Math.min(limits.json_nodes, 100_000)
  const pending: { value: unknown; depth: number }[] = computations.map(result => ({ value: result.details, depth: 0 }))
  while (pending.length) {
    const { value, depth } = pending.pop()!
    if (depth > maximumDepth || --remaining < 0) return 'computation details exceed the captured or browser JSON budget'
    if (value === null || typeof value === 'boolean' || typeof value === 'string') continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 'computation details must contain finite JSON numbers'
      continue
    }
    if (typeof value !== 'object') return 'computation details must contain JSON values'
    for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 })
  }
  return null
}

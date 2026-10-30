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
    const quantity = exactQuantity(value)
    return quantity ? [{ name, ...quantity }] : []
  })
}

export function exactQuantity(value: JsonValue): { value: string; unit: string } | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object'
    || value.schema !== 'eal.exact-number/1' || typeof value.numerator !== 'string'
    || typeof value.denominator !== 'string' || typeof value.unit !== 'string'
    || !/^-?\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return null
  return { value: `${value.numerator}/${value.denominator}`, unit: value.unit }
}

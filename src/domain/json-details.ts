/** Bound open imported JSON before rendering it as text. */
export function jsonDetailsIssue(
  values: { value: unknown; requireSafeIntegers?: boolean }[],
  limits: { json_depth: number; json_nodes: number },
): string | null {
  const maximumDepth = Math.min(limits.json_depth, 64)
  let remaining = Math.min(limits.json_nodes, 100_000)
  const pending = values.map(value => ({ ...value, depth: 0 }))
  while (pending.length) {
    const { value, depth, requireSafeIntegers } = pending.pop()!
    if (depth > maximumDepth || --remaining < 0) return 'computation details and verification reports exceed the captured or browser JSON budget'
    if (value === null || typeof value === 'boolean' || typeof value === 'string') continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 'computation details and verification reports must contain finite JSON numbers'
      if (requireSafeIntegers && Number.isInteger(value) && !Number.isSafeInteger(value)) return 'verification reports require exact-number string components for integers outside the browser safe range'
      continue
    }
    if (typeof value !== 'object') return 'computation details and verification reports must contain JSON values'
    for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1, requireSafeIntegers })
  }
  return null
}

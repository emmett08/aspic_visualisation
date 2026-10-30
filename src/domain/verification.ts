/** Inspect recorded obligations; evaluation and source authentication remain in EAL. */
import type { ComputationStatus, JsonValue } from './computation'
import { exactQuantity } from './computation'

export type VerificationStatus = 'pass' | 'fail' | 'unknown' | 'not_required'
export type VerificationMode = 'mathematical' | 'empirical' | 'defeasible'
export interface VerificationObligation {
  id: string
  role: 'premise' | 'grounding' | 'applicability' | 'warrant'
  status: VerificationStatus
  reasons: string[]
  details: Record<string, JsonValue>
}
export interface VerificationReport {
  schema: 'eal.verification-report/1'
  target_id: string
  mode: VerificationMode
  status: Exclude<VerificationStatus, 'not_required'>
  obligations: VerificationObligation[]
  atoms: (VerificationEvaluation & { symbol: string; observation_id: string | null })[]
  formulas: (VerificationEvaluation & { id: string })[]
}
export interface VerificationEvaluation {
  status: VerificationStatus
  truth: boolean | null
  reasons: string[]
  details: Record<string, JsonValue>
}
export interface RecordedVerification {
  argument_name: string
  source: 'native_method' | 'engarg_assurance'
  method_status: ComputationStatus
  reasons: string[]
  report: VerificationReport | null
}
export const verificationStatusText: Record<VerificationStatus, string> = {
  pass: 'Pass', fail: 'Fail', unknown: 'Unknown', not_required: 'Not required',
}
export const verificationModeText: Record<VerificationMode, string> = {
  mathematical: 'Mathematical consequence', empirical: 'Empirical claim', defeasible: 'Defeasible claim',
}
export const verificationExecutionText: Record<ComputationStatus, string> = {
  supported: 'Completed', unsupported: 'Failed', not_run: 'Not run', incomplete: 'Incomplete',
}

/** Read exact display projections without converting their numerator or denominator. */
export function exactVerificationQuantities(details: Record<string, JsonValue>): { path: string; value: string; unit: string }[] {
  const quantities: { path: string; value: string; unit: string }[] = []
  const pending: { path: string; value: JsonValue }[] = [{ path: '', value: details }]
  while (pending.length) {
    const { path, value } = pending.pop()!
    const quantity = exactQuantity(value)
    if (quantity) quantities.push({ path: path || '/', ...quantity })
    else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) pending.push({ path: `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, value: child })
    }
  }
  return quantities
}

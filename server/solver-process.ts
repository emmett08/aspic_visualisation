import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_ERROR_BYTES = 8 * 1024
const SOLVER_TIMEOUT_MS = 15_000

export interface SolverConfiguration { executable?: string; limitsFile?: string }
interface CheckedConfiguration { executable: string; limitsFile?: string }

export class SolverFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}

export function checkedConfiguration(configuration: SolverConfiguration): CheckedConfiguration {
  if (!configuration.executable || !isAbsolute(configuration.executable) || configuration.executable.includes('\0'))
    throw new SolverFailure(503, 'unavailable', 'Set ASPIC_SOLVER_EXECUTABLE to the absolute path of the installed eal-aspic-solve binary.')
  if (configuration.limitsFile !== undefined
      && (!isAbsolute(configuration.limitsFile) || configuration.limitsFile.includes('\0')))
    throw new SolverFailure(503, 'unavailable', 'EAL_LIMITS_FILE must be an absolute path to an operator-owned limits file.')
  return { executable: configuration.executable, limitsFile: configuration.limitsFile }
}

export function decodeUtf8(bytes: Uint8Array): string {
  // Keep a BOM visible to JSON.parse instead of silently changing the wire text.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

const badResponse = (message = 'The native solver returned an invalid response.') => new SolverFailure(502, 'invalid_response', message)

function failureResponse(stderr: Buffer, exitCode: number | null): SolverFailure {
  let value: unknown
  try { value = JSON.parse(decodeUtf8(stderr)) }
  catch { throw badResponse() }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'error')) throw badResponse()
  const error = (value as { error: unknown }).error
  if (!error || typeof error !== 'object' || Array.isArray(error)
      || Object.keys(error).length !== 2 || !Object.hasOwn(error, 'code') || !Object.hasOwn(error, 'message')) throw badResponse()
  const { code, message } = error as { code: unknown; message: unknown }
  if (typeof message !== 'string' || !message.trim() || [...message].length > 1800) throw badResponse()
  if (code === 'invalid_request' && exitCode === 2) return new SolverFailure(400, code, message)
  if (code === 'incomplete' && exitCode === 1) return new SolverFailure(422, code, message)
  if (code === 'unavailable' && exitCode === 3) return new SolverFailure(503, code, message)
  throw badResponse('The native solver returned inconsistent error metadata.')
}

/** One explicitly selected executable, bounded streams and no inherited credentials. */
export async function runSolver(configuration: CheckedConfiguration, input: string, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new SolverFailure(499, 'cancelled', 'The solver request was cancelled.')
  const args = configuration.limitsFile ? ['--limits', configuration.limitsFile] : []
  const child = spawn(configuration.executable, args, {
    env: { PATH: '' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  const stdout: Buffer[] = [], stderr: Buffer[] = []
  let stdoutBytes = 0, stderrBytes = 0
  let exceeded = false, timedOut = false, spawnFailed = false
  const kill = () => { child.kill('SIGKILL') }
  const abort = () => kill()
  const timer = setTimeout(() => { timedOut = true; kill() }, SOLVER_TIMEOUT_MS)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.length
    if (stdoutBytes > MAX_RESPONSE_BYTES) { exceeded = true; kill() }
    else stdout.push(chunk)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.length
    if (stderrBytes > MAX_ERROR_BYTES) { exceeded = true; kill() }
    else stderr.push(chunk)
  })
  child.stdin.on('error', () => { /* A worker can reject and exit before reading all input. */ })
  child.once('error', () => { spawnFailed = true })
  try {
    const exitCode = await new Promise<number | null>(resolve => {
      child.once('close', code => resolve(code))
      child.stdin.end(input)
    })
    if (signal.aborted) throw new SolverFailure(499, 'cancelled', 'The solver request was cancelled.')
    if (timedOut) throw new SolverFailure(504, 'incomplete', 'The solver exceeded the 15 second deadline.')
    if (spawnFailed) throw new SolverFailure(503, 'unavailable', 'The configured native solver could not be started. Check ASPIC_SOLVER_EXECUTABLE and its execute permissions.')
    if (exceeded) throw badResponse('The native solver exceeded the response byte limit.')
    if (exitCode !== 0) {
      if (stdoutBytes !== 0) throw badResponse('The native solver wrote a success payload while reporting failure.')
      throw failureResponse(Buffer.concat(stderr), exitCode)
    }
    if (stderrBytes !== 0) throw badResponse('The native solver wrote unexpected error output on success.')
    try { return JSON.parse(decodeUtf8(Buffer.concat(stdout))) }
    catch { throw badResponse() }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

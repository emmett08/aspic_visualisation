import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { validateAspicView } from '../src/domain/aspic.ts'
import {
  checkedConfiguration, decodeUtf8, runSolver, SolverFailure,
  type SolverConfiguration,
} from './solver-process.ts'

const MAX_REQUEST_BYTES = 64 * 1024
const UPLOAD_TIMEOUT_MS = 10_000

export interface SolverPluginOptions extends SolverConfiguration { enabled: boolean }

function readUpload(req: IncomingMessage, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    const cleanup = () => {
      clearTimeout(timer)
      req.off('data', data)
      req.off('end', end)
      req.off('error', error)
      signal.removeEventListener('abort', abort)
    }
    const fail = (failure: SolverFailure) => {
      cleanup()
      req.pause()
      reject(failure)
    }
    const abort = () => fail(new SolverFailure(499, 'cancelled', 'The solver request was cancelled.'))
    const error = () => abort()
    const data = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > MAX_REQUEST_BYTES) {
        fail(new SolverFailure(413, 'invalid_request', 'The theory exceeds the 64 KiB request limit.'))
      } else chunks.push(buffer)
    }
    const end = () => {
      cleanup()
      try { resolve(decodeUtf8(Buffer.concat(chunks))) }
      catch { reject(new SolverFailure(400, 'invalid_request', 'Send a UTF-8 JSON theory.')) }
    }
    const timer = setTimeout(() => fail(new SolverFailure(408, 'invalid_request', 'The theory upload timed out.')), UPLOAD_TIMEOUT_MS)
    req.on('data', data)
    req.once('end', end)
    req.once('error', error)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function admitRequest(text: string): void {
  let value: unknown
  try { value = JSON.parse(text) }
  catch { throw new SolverFailure(400, 'invalid_request', 'Send a valid JSON theory.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'theory')
      || !(value as { theory?: unknown }).theory
      || typeof (value as { theory: unknown }).theory !== 'object'
      || Array.isArray((value as { theory: unknown }).theory)) {
    throw new SolverFailure(400, 'invalid_request', 'Request must contain exactly one theory object.')
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  if (!req.headers.origin) return true
  const scheme = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
  try {
    const expected = new URL(`${scheme}://${req.headers.host}`).origin
    return req.headers.origin === expected
  } catch { return false }
}

/** Optional local development bridge; construction and checked export stay in EAL. */
export function solverPlugin(options: SolverPluginOptions): Plugin {
  let busy = false
  let closed = false
  const active = new Map<AbortController, Promise<void>>()
  const close = async () => {
    closed = true
    const pending = [...active]
    pending.forEach(([controller]) => controller.abort())
    await Promise.all(pending.map(([, settled]) => settled))
  }
  return {
    name: 'eal-native-solver-bridge',
    apply: 'serve',
    closeBundle: close,
    configureServer(server) {
      server.httpServer?.once('close', () => { void close() })
      server.middlewares.use('/api/solve', async (req: IncomingMessage, res: ServerResponse) => {
        // An aborted upload can emit ECONNRESET after its abort callback has
        // removed the read listeners. Retain an error sink for this stream's life.
        req.on('error', () => {})
        const reply = (status: number, error: string, code: string) => {
          if (res.destroyed || res.writableEnded) return
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
          // Stop a rejected, unfinished upload after its error response is written.
          if (!req.complete) res.once('finish', () => req.destroy())
          res.end(JSON.stringify({ error, code }))
        }
        if (!options.enabled) return reply(503, 'The optional EAL solver is not enabled.', 'unavailable')
        if (closed) return reply(503, 'The solver bridge is closing.', 'unavailable')
        if (req.method !== 'POST') return reply(405, 'Use POST with a JSON theory.', 'invalid_request')
        if (!sameOrigin(req)) return reply(403, 'Cross-origin requests are not accepted.', 'invalid_request')
        if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
          return reply(415, 'Content-Type must be application/json.', 'invalid_request')
        if (busy) return reply(429, 'A theory is already being evaluated. Try again shortly.', 'busy')
        busy = true
        const controller = new AbortController()
        let settled!: () => void
        active.set(controller, new Promise<void>(resolve => { settled = resolve }))
        const abort = () => controller.abort()
        const responseClosed = () => { if (!res.writableEnded) abort() }
        req.once('aborted', abort)
        res.once('close', responseClosed)
        try {
          const configuration = checkedConfiguration(options)
          const text = await readUpload(req, controller.signal)
          admitRequest(text)
          // Preserve numeric lexemes and duplicate fields for native strict JSON admission.
          const value = await runSolver(configuration, text, controller.signal)
          let view
          try { view = validateAspicView(value) }
          catch { throw new SolverFailure(502, 'invalid_response', 'The solver returned a view that failed graph validation.') }
          if (!res.destroyed && !res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
            res.end(JSON.stringify(view))
          }
        } catch (error) {
          const failure = error instanceof SolverFailure ? error
            : new SolverFailure(503, 'unavailable', 'The configured native solver is unavailable.')
          reply(failure.status, failure.message, failure.code)
        } finally {
          req.off('aborted', abort)
          res.off('close', responseClosed)
          active.delete(controller)
          // Process close precedes slot release, so cancellation cannot overlap workers.
          busy = false
          settled()
        }
      })
    },
  }
}

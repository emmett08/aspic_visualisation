import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ViteDevServer } from 'vite'
import { solverPlugin } from '../server/solver-plugin'

type Middleware = (request: IncomingMessage, response: ServerResponse) => Promise<void>
let fixtureRoot: string
const servers: Server[] = []

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'aspic-bridge-test-'))
  await mkdir(join(fixtureRoot, 'server'))
  // Run a tiny Node process through the same argv/stdin boundary as Python.
  // The actual EAL adapter has separate process tests in server/test_solve.py.
  await writeFile(join(fixtureRoot, 'server/solve.py'), `
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      const request = JSON.parse(input);
      process.stdout.write(JSON.stringify({ received: request.theory }));
    });
  `)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

afterAll(async () => { await rm(fixtureRoot, { recursive: true, force: true }) })

async function start(enabled = true, python = process.execPath) {
  let middleware: Middleware | undefined
  const plugin = solverPlugin(fixtureRoot, enabled, python)
  const configure = plugin.configureServer
  if (typeof configure !== 'function') throw new Error('Expected a development middleware hook')
  const fakeServer = { middlewares: { use(_path: string, handler: Middleware) { middleware = handler } } }
  configure.call({} as never, fakeServer as unknown as ViteDevServer)
  if (!middleware) throw new Error('Solver middleware was not registered')
  const handler = middleware
  const server = createServer((req, res) => { void handler(req, res) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  return `http://127.0.0.1:${address.port}/api/solve`
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const body = JSON.stringify({ theory: { goal: 'run_passes' } })
const post = (url: string, overrides: RequestInit = {}) => fetch(url, {
  method: 'POST', headers: jsonHeaders, body, ...overrides,
})

describe('optional development solver bridge', () => {
  it('keeps solving explicitly opt-in', async () => {
    const response = await post(await start(false))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'The optional EAL solver is not enabled.' })
  })

  it('requires POST, JSON and same-host browser origins', async () => {
    const url = await start()
    expect((await fetch(url)).status).toBe(405)
    expect((await post(url, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    expect((await post(url, { headers: { ...jsonHeaders, Origin: 'https://elsewhere.example' } })).status).toBe(403)
    expect((await post(url, { headers: { ...jsonHeaders, Origin: 'not-a-url' } })).status).toBe(403)
    const response = await post(url, { headers: { ...jsonHeaders, Origin: new URL(url).origin } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: { goal: 'run_passes' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects oversized and malformed JSON bodies and releases the busy slot', async () => {
    const url = await start()
    expect((await post(url, { body: ' '.repeat(64 * 1024 + 1) })).status).toBe(413)
    expect((await post(url, { body: '{' })).status).toBe(400)
    expect((await post(url)).status).toBe(200)
  })

  it('returns an actionable error when the configured executable is unavailable', async () => {
    const response = await post(await start(true, join(fixtureRoot, 'missing-python')))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('Python is unavailable')
  })

  it('bounds an unfinished upload and accepts the next request', async () => {
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: Parameters<typeof setTimeout>) => {
      if (args[1] === 10_000) args[1] = 30
      return originalSetTimeout(...args)
    }) as typeof setTimeout)
    const url = await start()
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const upload = request(url, { method: 'POST', headers: jsonHeaders }, response => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      upload.on('error', reject)
      upload.write('{')
      // Deliberately leave the body unfinished: the upload deadline must free it.
    })
    expect(status).toBe(408)
    expect((await post(url)).status).toBe(200)
  })
})

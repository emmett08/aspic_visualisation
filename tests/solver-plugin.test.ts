import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { createServer as createViteServer } from 'vite'
import sample from '../src/domain/sample.json'
import { solverPlugin, type SolverPluginOptions } from '../server/solver-plugin'

type Middleware = (request: IncomingMessage, response: ServerResponse) => Promise<void>
let fixtureRoot: string, executable: string
const servers: { server: Server; plugin: Plugin }[] = []

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'aspic-native-bridge-'))
  executable = join(fixtureRoot, 'fixture-solver.mjs')
  // A standalone executable exercises real pipes, exit codes and process cleanup.
  // Native solver semantics are covered separately by the actual-binary suite.
  await writeFile(executable, `#!${process.execPath}
import { writeFileSync } from 'node:fs';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const theory = JSON.parse(input).theory;
  const view = ${JSON.stringify(sample)};
  if (theory.record) writeFileSync(theory.record, JSON.stringify({ pid: process.pid, env: process.env, args: process.argv.slice(2), input }));
  const fail = (code, exit, extra = {}) => {
    process.stderr.write(JSON.stringify({ error: { code, message: 'fixture ' + code, ...extra } }));
    process.exitCode = exit;
  };
  switch (theory.mode) {
    case 'hold': setInterval(() => {}, 1000); return;
    case 'invalid_request': fail('invalid_request', 2); return;
    case 'incomplete': fail('incomplete', 1); return;
    case 'unavailable': fail('unavailable', 3); return;
    case 'mismatched-error': fail('incomplete', 2); return;
    case 'extra-error-field': fail('incomplete', 1, { secret: 'not forwarded' }); return;
    case 'failure-with-stdout': process.stdout.write('{}'); fail('incomplete', 1); return;
    case 'success-with-stderr': process.stderr.write('unexpected diagnostic'); break;
    case 'malformed-error': process.stderr.write('secret unstructured diagnostic'); process.exitCode = 2; return;
    case 'oversized-error': process.stderr.write('x'.repeat(8193)); process.exitCode = 2; return;
    case 'oversized-output': process.stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1, 32)); return;
    case 'invalid-utf8': process.stdout.write(Buffer.from([0xc3, 0x28])); return;
    case 'invalid-json': process.stdout.write('{'); return;
    case 'forged-graph': view.arguments[0].label = view.arguments[0].label === 'in' ? 'out' : 'in'; break;
    case 'unicode': {
      view.arguments[0].display_conclusion = 'inspection μ🚀';
      const bytes = Buffer.from(JSON.stringify(view));
      const split = bytes.indexOf(Buffer.from('μ')) + 1;
      process.stdout.write(bytes.subarray(0, split));
      setTimeout(() => process.stdout.end(bytes.subarray(split)), 25);
      return;
    }
    case 'exact-output-limit': {
      const bytes = Buffer.from(JSON.stringify(view));
      process.stdout.write(bytes);
      process.stdout.write(Buffer.alloc(4 * 1024 * 1024 - bytes.length, 32));
      return;
    }
  }
  process.stdout.write(JSON.stringify(view) + '\\n');
});
`)
  await chmod(executable, 0o700)
})

async function closePlugin(plugin: Plugin) {
  const close = plugin.closeBundle
  if (typeof close === 'function') await close.call({} as never)
}

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map(async ({ server, plugin }) => {
    await closePlugin(plugin)
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }))
})

afterAll(async () => { await rm(fixtureRoot, { recursive: true, force: true }) })

async function start(overrides: Partial<SolverPluginOptions> = {}) {
  let middleware: Middleware | undefined
  const plugin = solverPlugin({ enabled: true, executable, ...overrides })
  const server = createServer((req, res) => { void middleware!(req, res) })
  const configure = plugin.configureServer
  if (typeof configure !== 'function') throw new Error('Expected a development middleware hook')
  const fakeServer = { httpServer: server, middlewares: { use(_path: string, handler: Middleware) { middleware = handler } } }
  configure.call({} as never, fakeServer as unknown as ViteDevServer)
  if (!middleware) throw new Error('Solver middleware was not registered')
  servers.push({ server, plugin })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  return { url: `http://127.0.0.1:${address.port}/api/solve`, server, plugin }
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const body = JSON.stringify({ theory: { goal: 'run_passes' } })
const post = (url: string, overrides: RequestInit = {}) => fetch(url, {
  method: 'POST', headers: jsonHeaders, body, ...overrides,
})
const modeBody = (mode: string, rest: Record<string, unknown> = {}) => JSON.stringify({ theory: { mode, ...rest } })

function shortenTimer(milliseconds: number) {
  const originalSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: Parameters<typeof setTimeout>) => {
    if (args[1] === milliseconds) args[1] = 100
    return originalSetTimeout(...args)
  }) as typeof setTimeout)
}

async function recorded(path: string): Promise<{ pid: number; env: Record<string, string>; args: string[]; input: string }> {
  let text = ''
  await vi.waitFor(async () => { text = await readFile(path, 'utf8') })
  return JSON.parse(text)
}

async function expectStopped(pid: number) {
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow())
}

describe('optional native development solver bridge', () => {
  it('keeps solving explicitly opt-in', async () => {
    const response = await post((await start({ enabled: false })).url)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'The optional EAL solver is not enabled.', code: 'unavailable' })
  })

  it('requires POST, JSON and the exact same browser origin', async () => {
    const { url } = await start()
    expect((await fetch(url)).status).toBe(405)
    expect((await post(url, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    for (const origin of ['https://elsewhere.example', 'not-a-url', new URL(url).origin.replace('http:', 'https:'), `${new URL(url).origin}/path`]) {
      expect((await post(url, { headers: { ...jsonHeaders, Origin: origin } })).status).toBe(403)
    }
    expect((await post(url, { headers: { ...jsonHeaders, 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    const response = await post(url, { headers: { ...jsonHeaders, Origin: new URL(url).origin } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(sample)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('requires operator-selected absolute paths without a PATH fallback', async () => {
    vi.stubEnv('PATH', fixtureRoot)
    for (const selected of [undefined, '', 'fixture-solver.mjs', join(fixtureRoot, 'missing')]) {
      const response = await post((await start({ executable: selected })).url)
      expect(response.status).toBe(503)
      expect((await response.json()).code).toBe('unavailable')
    }
    const response = await post((await start({ limitsFile: 'relative.toml' })).url)
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('absolute path')
  })

  it('passes only operator limits and exact request text, with a closed environment', async () => {
    vi.stubEnv('ASPIC_TEST_CREDENTIAL', 'never inherit this credential')
    const record = join(fixtureRoot, 'environment.json')
    const limitsFile = join(fixtureRoot, 'limits with spaces.toml')
    const { url } = await start({ limitsFile })
    const text = `{"theory":{"record":${JSON.stringify(record)},"number":9007199254740993}}`
    expect((await post(url, { body: text })).status).toBe(200)
    const result = await recorded(record)
    expect(result.args).toEqual(['--limits', limitsFile])
    expect(result.env).toEqual({ PATH: '' })
    expect(result.input).toBe(text)
    for (const value of [[], null, {}, { theory: [] }, { theory: null }, { theory: {}, executable }, { theory: {}, limits: {} }]) {
      expect((await post(url, { body: JSON.stringify(value) })).status).toBe(400)
    }
  })

  it('bounds upload bytes, requires valid UTF-8/JSON, and releases the busy slot', async () => {
    const { url } = await start()
    expect((await post(url, { body: body + ' '.repeat(64 * 1024 - Buffer.byteLength(body)) })).status).toBe(200)
    expect((await post(url, { body: body + ' '.repeat(64 * 1024 - Buffer.byteLength(body)) + 'μ' })).status).toBe(413)
    expect((await post(url, { body: '{' })).status).toBe(400)
    expect((await post(url, { body: Buffer.from([0xc3, 0x28]) })).status).toBe(400)
    expect((await post(url)).status).toBe(200)
  })

  it('bounds an unfinished upload and accepts the next request', async () => {
    shortenTimer(10_000)
    const { url } = await start()
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const upload = request(url, { method: 'POST', headers: jsonHeaders }, response => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      upload.on('error', reject)
      upload.write('{')
    })
    expect(status).toBe(408)
    expect((await post(url)).status).toBe(200)
  })

  it('handles an abrupt upload disconnect, including its late stream error', async () => {
    const { url } = await start()
    const upload = request(url, { method: 'POST', headers: jsonHeaders })
    upload.on('error', () => {})
    await new Promise<void>(resolve => { upload.write('{"theory":', () => resolve()) })
    expect((await post(url)).status).toBe(429)
    upload.destroy()
    await vi.waitFor(async () => expect((await post(url)).status).toBe(200))
  })

  it('preserves Unicode split across stdout chunks and accepts the exact response byte ceiling', async () => {
    const { url } = await start()
    const response = await post(url, { body: modeBody('unicode') })
    expect(response.status).toBe(200)
    expect((await response.json()).arguments[0].display_conclusion).toBe('inspection μ🚀')
    expect((await post(url, { body: modeBody('exact-output-limit') })).status).toBe(200)
  })

  it.each([['invalid_request', 400], ['incomplete', 422], ['unavailable', 503]] as const)('maps checked native %s failures without a success snapshot', async (mode, status) => {
    const response = await post((await start()).url, { body: modeBody(mode) })
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: `fixture ${mode}`, code: mode })
  })

  it.each(['mismatched-error', 'extra-error-field', 'failure-with-stdout', 'success-with-stderr', 'malformed-error', 'oversized-error', 'oversized-output', 'invalid-utf8', 'invalid-json', 'forged-graph'])('rejects invalid solver output: %s', async mode => {
    const { url } = await start()
    const response = await post(url, { body: modeBody(mode) })
    expect(response.status).toBe(502)
    const failure = await response.json()
    expect(failure.code).toBe('invalid_response')
    expect(failure.error).not.toContain('secret')
    expect((await post(url)).status).toBe(200)
  })

  it('enforces the deadline and waits for worker cleanup before accepting another theory', async () => {
    shortenTimer(15_000)
    const record = join(fixtureRoot, 'deadline.json')
    const { url } = await start()
    const response = await post(url, { body: modeBody('hold', { record }) })
    expect(response.status).toBe(504)
    expect((await response.json()).code).toBe('incomplete')
    await expectStopped((await recorded(record)).pid)
    expect((await post(url)).status).toBe(200)
  })

  it('rejects concurrent work, kills an aborted worker and releases the slot after close', async () => {
    const record = join(fixtureRoot, 'abort.json')
    const { url } = await start()
    const controller = new AbortController()
    const pending = post(url, { body: modeBody('hold', { record }), signal: controller.signal }).catch(error => error)
    const { pid } = await recorded(record)
    expect((await post(url)).status).toBe(429)
    controller.abort()
    await pending
    await expectStopped(pid)
    expect((await post(url)).status).toBe(200)
  })

  it('kills active workers when the Vite plugin closes', async () => {
    const record = join(fixtureRoot, 'close.json')
    const { url, plugin } = await start()
    const pending = post(url, { body: modeBody('hold', { record }) }).catch(error => error)
    const { pid } = await recorded(record)
    await closePlugin(plugin)
    await pending
    await expectStopped(pid)
    expect((await post(url)).status).toBe(503)
  })

  it('waits for worker cleanup when an actual Vite server closes', async () => {
    const record = join(fixtureRoot, 'vite-close.json')
    const server = await createViteServer({
      configFile: false, root: fixtureRoot,
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [solverPlugin({ enabled: true, executable })],
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string') throw new Error('Expected a Vite TCP address')
      const pending = post(`http://127.0.0.1:${address.port}/api/solve`, { body: modeBody('hold', { record }) }).catch(error => error)
      const { pid } = await recorded(record)
      await server.close()
      await pending
      expect(() => process.kill(pid, 0)).toThrow()
    } finally { await server.close() }
  })
})

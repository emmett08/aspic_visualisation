import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** Optional development-only bridge. Formal construction stays in EAL. */
export function solverPlugin(root: string, enabled: boolean, python: string): Plugin {
  let busy = false;
  return {
    name: 'eal-solver-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/solve', async (req: IncomingMessage, res: ServerResponse) => {
        const reply = (status: number, data: unknown) => {
          if (res.destroyed || res.writableEnded) return;
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(data));
        };
        if (!enabled) return reply(503, { error: 'The optional EAL solver is not enabled.' });
        if (req.method !== 'POST') return reply(405, { error: 'Use POST with a JSON theory.' });
        // Browser requests must come from this same local preview, never a third-party page.
        if (req.headers.origin) {
          try {
            if (new URL(req.headers.origin).host !== req.headers.host)
              return reply(403, { error: 'Cross-origin requests are not accepted.' });
          } catch { return reply(403, { error: 'Invalid request origin.' }); }
        }
        if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
          return reply(415, { error: 'Content-Type must be application/json.' });
        if (busy) return reply(429, { error: 'A theory is already being evaluated. Try again shortly.' });
        busy = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          timer = setTimeout(() => {
            reply(408, { error: 'The theory upload timed out.' });
            req.destroy();
          }, 10_000);
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > MAX_REQUEST_BYTES) {
              reply(413, { error: 'The theory exceeds the 64 KiB request limit.' });
              return;
            }
            chunks.push(buffer);
          }
          const text = Buffer.concat(chunks).toString('utf8');
          clearTimeout(timer);
          try { JSON.parse(text); } catch { return reply(400, { error: 'The request is not valid JSON.' }); }
          const child = spawn(python, [resolve(root, 'server/solve.py')], {
            cwd: root,
            env: { ...process.env, PYTHONPATH: [resolve(root, '.runtime/eal-source/src'), resolve(root, '.runtime/python')].join(delimiter), PYTHONDONTWRITEBYTECODE: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          let stdout = '';
          let stderr = '';
          let exceeded = false;
          let timedOut = false;
          timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15_000);
          child.stdout.on('data', (data: Buffer) => {
            if (Buffer.byteLength(stdout) + data.length > MAX_RESPONSE_BYTES) {
              exceeded = true;
              child.kill('SIGKILL');
            } else stdout += data.toString('utf8');
          });
          child.stderr.on('data', (data: Buffer) => {
            if (stderr.length < 8192) stderr += data.toString('utf8');
          });
          child.stdin.on('error', () => { /* A rejected or unavailable solver can close stdin early. */ });
          child.stdin.end(text);
          const exitCode = await new Promise<number | null>((resolveExit, reject) => {
            child.on('error', reject);
            child.on('close', resolveExit);
          });
          if (timedOut) return reply(504, { error: 'The bounded solver exceeded its 15 second deadline.' });
          if (exceeded) return reply(422, { error: 'The solver result exceeds the 4 MiB limit.' });
          if (exitCode !== 0) return reply(422, { error: stderr.trim() || 'The theory could not be evaluated.' });
          try { reply(200, JSON.parse(stdout)); }
          catch { reply(502, { error: 'The solver returned an invalid response.' }); }
        } catch (error) {
          reply(503, { error: error instanceof Error && 'code' in error && error.code === 'ENOENT'
            ? 'Python is unavailable. Follow the optional solver setup in README.'
            : 'The local solver is unavailable. Check its installation and try again.' });
        } finally {
          if (timer) clearTimeout(timer);
          busy = false;
        }
      });
    },
  };
}

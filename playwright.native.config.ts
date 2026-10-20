import { defineConfig } from '@playwright/test'
import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const executable = process.env.ASPIC_SOLVER_EXECUTABLE
if (!executable || !isAbsolute(executable)) {
  throw new Error('Native browser acceptance requires an absolute ASPIC_SOLVER_EXECUTABLE.')
}
if (!statSync(executable).isFile()) {
  throw new Error('ASPIC_SOLVER_EXECUTABLE must name the installed native solver file.')
}
accessSync(executable, constants.X_OK)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/native-solver.pw.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.ASPIC_CHROMIUM_PATH ? {
      executablePath: process.env.ASPIC_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    env: {
      ASPIC_SOLVER: '1',
      ASPIC_SOLVER_EXECUTABLE: executable,
      // This suite verifies the installed default budget, not a caller override.
      EAL_LIMITS_FILE: '',
    },
  },
})

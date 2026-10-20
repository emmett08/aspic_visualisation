import { expect, test, type Page, type Response } from '@playwright/test'
import type { AspicView } from '../src/domain/aspic'

/** Real browser -> local HTTP bridge -> installed Rust process. No route mocks,
 * substitute solver responses, providers or measured observations are used. */
async function submit(page: Page): Promise<Response> {
  const response = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/solve' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Build graph', exact: true }).click()
  return response
}

async function solve(page: Page): Promise<AspicView> {
  const response = await submit(page)
  const body = await response.text()
  expect(response.status(), body).toBe(200)
  // Run the unchanged full consumer boundary, including Ajv and graph checks,
  // independently on the actual process response received by the browser.
  const view: AspicView = await page.evaluate(async source => {
    // Use the browser's Vite module loader so the exact production Ajv/schema
    // imports execute as they do in the application, rather than Node adapters.
    const modulePath = '/src/domain/aspic.ts'
    const { parseAspicView } = await import(modulePath)
    return parseAspicView(source)
  }, body)
  expect(view.schema).toBe('aspic-view/3')
  expect(view.validation).toEqual({ formal_result: 'recomputed', provenance: 'supplied' })
  expect(view.claim_status).toBeNull()
  expect(view.authored_claim_status).toBeNull()
  await expect(page.getByRole('button', { name: 'Build graph', exact: true })).toBeEnabled()
  await expect(page.locator('.argument-row')).toHaveCount(view.arguments.length)
  return view
}

async function setTheory(page: Page, input: {
  axioms?: string; premises: string; strict?: string; defeasible?: string; contraries?: string;
  goal: string; semantics?: string; query?: string; preference?: string; priorities?: string;
}) {
  await page.getByLabel('Axioms', { exact: true }).fill(input.axioms ?? '')
  await page.getByLabel('Ordinary premises', { exact: true }).fill(input.premises)
  await page.getByLabel('Strict rules', { exact: true }).fill(input.strict ?? '')
  await page.getByLabel('Defeasible rules', { exact: true }).fill(input.defeasible ?? '')
  await page.getByLabel('Contraries', { exact: true }).fill(input.contraries ?? '')
  await page.getByLabel('Goal', { exact: true }).fill(input.goal)
  await page.getByLabel('Acceptance semantics').selectOption(input.semantics ?? 'grounded')
  await page.getByLabel('Query mode').selectOption(input.query ?? 'sceptical')
  await page.getByLabel('Preference ordering').selectOption(input.preference ?? 'minimum_rank')
  if (input.preference === 'last_link_partial') {
    await page.getByLabel('Priorities', { exact: true }).fill(input.priorities ?? '')
  }
}

test('native engineering solve preserves the undercut and independent successful route', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Load engineering demo' }).click()
  const view = await solve(page)
  expect(view.profile).toBe('argumentation/aspic/2')
  // One axiom, three ordinary premises and four authored rules.
  expect(view.arguments).toHaveLength(8)
  expect(view.formal_status).toBe('accepted')
  expect(view.query_status).toBe('accepted')
  const primary = view.arguments.find(argument => argument.rule_id === 'd1')!
  const alternate = view.arguments.find(argument => argument.rule_id === 'd3')!
  const attacker = view.arguments.find(argument => argument.rule_id === 'd2')!
  expect(primary.label).toBe('out')
  expect(alternate.label).toBe('in')
  expect(view.defeats).toEqual([{ attacker: attacker.id, target: primary.id, subargument: primary.id, kind: 'undercut' }])
  await expect(page.locator('.goal-result')).toHaveText('accepted')
  await expect(page.locator('.event-card')).toHaveCount(2)
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible()
  await page.getByRole('button', { name: /^Relations/ }).click()
  await page.locator('.relation-row').filter({ hasText: 'undercut' }).click()
  await expect(page.locator('.witness-box')).toContainText(primary.id)
  expect(errors).toEqual([])
})

test('preferred credulous acceptance remains separate from grounded node labels', async ({ page }) => {
  await page.goto('/')
  await setTheory(page, { premises: 'p\nq', contraries: 'p -> q\nq -> p', goal: 'p', semantics: 'preferred', query: 'credulous' })
  const view = await solve(page)
  expect(view.formal_status).toBe('undecided')
  expect(view.query_status).toBe('accepted')
  expect(view.extensions).toHaveLength(2)
  const goal = view.arguments.find(argument => argument.conclusion === 'p')!
  const goalRow = page.locator('.argument-row').filter({ has: page.locator('.argument-id').filter({ hasText: new RegExp(`^${goal.id}$`) }) })
  await expect(goalRow.locator('.label-chip')).toHaveText('undecided')
  await expect(page.locator('.goal-result')).toHaveText('accepted')
  for (const [index, extension] of view.extensions.entries()) {
    await page.getByLabel('Graph labelling').selectOption({ label: `preferred extension ${index + 1} · ${extension.length} in` })
    await expect(goalRow.locator('.label-chip')).toHaveText(extension.includes(goal.id) ? 'in' : 'out')
  }
  await page.getByLabel('Graph labelling').selectOption({ label: 'Grounded' })
  await expect(goalRow.locator('.label-chip')).toHaveText('undecided')
  await page.getByRole('button', { name: 'Snapshot details' }).click()
  await expect(page.getByLabel('Snapshot metadata')).toContainText('Grounded graph status')
  await expect(page.getByLabel('Snapshot metadata')).toContainText('preferred / credulous: accepted')
})

test('a stable theory without extensions differs from a preferred empty extension', async ({ page }) => {
  await page.goto('/')
  await setTheory(page, { premises: 'p\nq\nr', contraries: 'p -> q\nq -> r\nr -> p', goal: 'p', semantics: 'stable' })
  const stable = await solve(page)
  expect(stable.formal_status).toBe('undecided')
  expect(stable.query_status).toBe('no_extension')
  expect(stable.extensions).toEqual([])
  expect(stable.arguments.every(argument => argument.label === 'undecided')).toBe(true)
  await expect(page.locator('.goal-result')).toHaveText('no_extension')
  await expect(page.getByLabel('Graph labelling').locator('option')).toHaveCount(1)
  await page.getByLabel('Acceptance semantics').selectOption('preferred')
  const preferred = await solve(page)
  expect(preferred.formal_status).toBe('undecided')
  expect(preferred.query_status).toBe('undecided')
  expect(preferred.extensions).toEqual([[]])
  await expect(page.getByLabel('Graph labelling').locator('option')).toHaveCount(2)
  await expect(page.locator('.goal-result')).toHaveText('undecided')
  await expect(page.locator('.event-card')).toHaveCount(3)
})

test('an unfinished bounded native computation cannot replace the current graph', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load engineering demo' }).click()
  const original = await solve(page)
  await expect(page.locator('.event-card')).toHaveCount(2)
  await setTheory(page, { premises: Array.from({ length: 65 }, (_, index) => `p${index}`).join('\n'), goal: 'p0' })
  const response = await submit(page)
  expect(response.status()).toBe(422)
  const failure: unknown = await response.json()
  expect(failure).toMatchObject({ code: 'incomplete', error: expect.stringMatching(/budget|incomplete/i) })
  expect(failure).not.toHaveProperty('arguments')
  expect(failure).not.toHaveProperty('query_status')
  await expect(page.locator('.theory-error')).toContainText(/budget|incomplete/i)
  await expect(page.locator('.argument-row')).toHaveCount(original.arguments.length)
  await expect(page.locator('.goal-result')).toHaveText(original.query_status)
  await expect(page.locator('.event-card')).toHaveCount(2)
  await expect(page.getByLabel('Current snapshot summary')).toContainText(original.goal)
})

test('declared partial last-link priority controls the actual native defeat', async ({ page }) => {
  await page.goto('/')
  await setTheory(page, {
    premises: 'p\nq', contraries: 'p -> q\nq -> p', goal: 'p',
    preference: 'last_link_partial', priorities: 'premise p > q',
  })
  const view = await solve(page)
  expect(view.preference).toBe('last_link_partial')
  expect(view.query_status).toBe('accepted')
  const p = view.arguments.find(argument => argument.conclusion === 'p')!
  const q = view.arguments.find(argument => argument.conclusion === 'q')!
  expect(p.label).toBe('in')
  expect(q.label).toBe('out')
  expect(view.defeats).toEqual([{ attacker: p.id, target: q.id, subargument: q.id, kind: 'undermine' }])
  expect(view.extensions).toEqual([[p.id]])
  await expect(page.locator('.goal-result')).toHaveText('accepted')
  await page.getByRole('button', { name: 'Snapshot details' }).click()
  await expect(page.getByLabel('Snapshot metadata')).toContainText('last_link_partial')
})

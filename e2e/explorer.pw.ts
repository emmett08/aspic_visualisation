import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { AspicView } from '../src/domain/aspic'
const sample: AspicView = JSON.parse(readFileSync(new URL('../src/domain/sample.json', import.meta.url), 'utf8'))

async function importView(page: import('@playwright/test').Page, view: unknown, name: string) {
  await page.getByLabel('Import an ASPIC view JSON snapshot').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(view)),
  })
}

test('one graph supports keyboard selection, exact defeat witnesses and visible filters', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Argument graph', exact: true })).toBeVisible()
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible()
  await expect(page.locator('.argument-row')).toHaveCount(sample.arguments.length)
  const primary = sample.arguments.findIndex(a => a.origin.name === 'primary_run')
  await page.locator('.argument-row').nth(primary).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.details-panel .detail-id')).toContainText('OUT', { ignoreCase: true })
  await page.getByRole('button', { name: /^Relations/ }).click()
  await page.locator('.relation-row').filter({ hasText: 'undercut' }).first().click()
  await expect(page.getByRole('heading', { name: 'Exact attacked subargument' })).toBeVisible()
  await expect(page.locator('.witness-box')).toContainText(sample.defeats[0]!.subargument)
  await page.getByLabel('Defeats', { exact: true }).uncheck()
  await expect(page.getByRole('status').filter({ hasText: 'Filtered view' })).toContainText('defeats hidden')
  await page.getByLabel('Defeats', { exact: true }).check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download visible graph as PNG' }).click()
  expect((await download).suggestedFilename()).toBe('aspic-argument-graph.png')
  expect(errors).toEqual([])
})

test('malformed labels cannot replace the current graph', async ({ page }) => {
  await page.goto('/')
  const forged = structuredClone(sample)
  forged.arguments[0]!.label = 'out'
  await importView(page, forged, 'invalid.json')
  await expect(page.getByRole('alert')).toContainText('grounded')
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.argument-row')).toHaveCount(sample.arguments.length)
})

test('renumbered snapshots compare by derivation and restore through events', async ({ page }) => {
  await page.goto('/')
  const renumbered = structuredClone(sample)
  const ids = new Map(renumbered.arguments.map((a, i) => [a.id, `B${i}`]))
  renumbered.arguments.forEach(a => {
    a.id = ids.get(a.id)!
    a.direct_subarguments = a.direct_subarguments.map(id => ids.get(id)!)
    a.subarguments = a.subarguments.map(id => ids.get(id)!)
  })
  renumbered.defeats.forEach(d => {
    d.attacker = ids.get(d.attacker)!; d.target = ids.get(d.target)!; d.subargument = ids.get(d.subargument)!
  })
  await importView(page, renumbered, 'renumbered.json')
  await expect(page.locator('.event-card')).toHaveCount(2)
  await expect(page.locator('.event-diff')).toContainText('+0 arguments')
  await expect(page.locator('.event-diff')).toContainText('0 label changes')
  await expect(page.locator('.argument-id').first()).toHaveText('B0')
  await page.locator('.event-card').first().click()
  await expect(page.locator('.argument-id').first()).toHaveText('A0')
  await page.locator('.event-card').last().click()
  await expect(page.locator('.argument-id').first()).toHaveText('B0')
})

test('supplied prose is inert text and unavailable evidence is visible', async ({ page }) => {
  await page.goto('/')
  const view = structuredClone(sample)
  const hostile = '<img src=x onerror="window.injected=true">'
  view.arguments[0]!.authored_statement = hostile
  view.unavailable_evidence.push({ name: 'missing_probe', reasons: ['No observation supplied.'], span: null })
  await importView(page, view, 'supplied-text.json')
  await page.locator('.argument-row').first().click()
  await expect(page.locator('.details-panel .statement')).toHaveText(hostile)
  await expect(page.locator('.details-panel img')).toHaveCount(0)
  await expect(page.locator('.unavailable-section')).toContainText('missing_probe')
  await expect(page.locator('.unavailable-section')).toContainText('Absence is not falsity')
  expect(await page.evaluate(() => Object.hasOwn(window, 'injected'))).toBe(false)
})

test('mobile layout keeps graph and keyboard controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByLabel('Search arguments and relations').fill('primary_trace_gap')
  await expect(page.locator('.argument-row')).toHaveCount(1)
  await page.locator('.argument-row').press('Enter')
  await expect(page.locator('.details-panel h3')).toHaveText('primary_trace_gap')
})

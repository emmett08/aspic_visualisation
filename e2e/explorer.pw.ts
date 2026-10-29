import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { AspicView } from '../src/domain/aspic'
const sample: AspicView = JSON.parse(readFileSync(new URL('../src/domain/sample.json', import.meta.url), 'utf8'))
const keywordCompiled: AspicView = JSON.parse(readFileSync(new URL('../tests/fixtures/aspic-keywords-compiled.json', import.meta.url), 'utf8'))
const keywordFormal: AspicView = JSON.parse(readFileSync(new URL('../tests/fixtures/aspic-keywords-formal.json', import.meta.url), 'utf8'))
const nativeEal4: AspicView = JSON.parse(readFileSync(new URL('../tests/fixtures/eal4-native/view.json', import.meta.url), 'utf8'))

test('static build can populate theory fields while evaluation stays disabled', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load engineering demo' }).click()
  await expect(page.getByLabel('Axioms', { exact: true })).toHaveValue('voltage_ok')
  await expect(page.getByLabel('Contraries', { exact: true })).toHaveValue('unreliable_test -> applicable_d1')
  await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('pump_ready')
  await expect(page.getByRole('button', { name: 'Build graph', exact: true })).toBeDisabled()
  await expect(page.locator('.argument-row')).toHaveCount(sample.arguments.length)
})

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
  renumbered.extensions = renumbered.extensions.map(extension => extension.map(id => ids.get(id)!))
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
  view.unavailable_evidence.push({ name: 'missing_probe', reasons: ['No observation supplied.'], availability_issues: ['missing_observation'], span: null })
  await importView(page, view, 'supplied-text.json')
  await page.locator('.argument-row').first().click()
  await expect(page.locator('.details-panel .statement')).toHaveText(hostile)
  await expect(page.locator('.details-panel img')).toHaveCount(0)
  await expect(page.locator('.unavailable-section')).toContainText('missing_probe')
  await expect(page.locator('.unavailable-section')).toContainText('Absence is not falsity')
  await page.locator('.unavailable-section summary').click()
  await expect(page.getByLabel('Evidence availability causes')).toContainText('No observation was supplied.')
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


test('reviewed nested derivations are inspectable and old views cannot replace the graph', async ({ page }) => {
  await page.goto('/')
  const nested = sample.arguments.findIndex(a => a.origin.name === 'independent_probe')
  await page.locator('.argument-row').nth(nested).click()
  await expect(page.locator('.details-panel')).toContainText('Direct subarguments')
  await expect(page.locator('.details-panel')).toContainText('synthetic-review/independent-probe')
  const childId = sample.arguments[nested]!.direct_subarguments[0]!
  await page.locator('.details-panel .inline-buttons').getByRole('button', { name: childId, exact: true }).click()
  await expect(page.locator('.details-panel')).toContainText('probe_arg')
  await expect(page.locator('.details-panel h3')).toHaveText('alternate_probe_ok')
  const strict = sample.arguments.findIndex(a => a.origin.name === 'report_arg')
  await page.locator('.argument-row').nth(strict).click()
  await expect(page.locator('.details-panel')).toContainText('synthetic-review/checked-record-implication')
  await importView(page, { ...sample, schema: 'aspic-view/1' }, 'obsolete-view.json')
  await expect(page.getByRole('alert')).toContainText('constant')
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.argument-row')).toHaveCount(sample.arguments.length)
})

test('failed predicates and absent observations have separate typed panels', async ({page}) => {
  await page.goto('/')
  const value=structuredClone(sample)
  value.unavailable_evidence.push({name:'missing_probe',reasons:['No observation supplied.'],availability_issues:['missing_observation'],span:null})
  value.unavailable_evidence.push({name:'negative_predicate',reasons:['Observed true, required false.'],availability_issues:['predicate_not_met'],span:null})
  await importView(page,value,'evidence-outcomes.json')
  await expect(page.locator('.evidence-group[data-issue="missing_observation"]')).toContainText('missing_probe')
  await expect(page.locator('.evidence-group[data-issue="predicate_not_met"]')).toContainText('negative_predicate')
  await expect(page.locator('.evidence-group[data-issue="predicate_not_met"]')).not.toContainText('missing_probe')
})

test('native EAL/4 imports preserve unresolved predicates and unavailable dependencies', async ({ page }) => {
  await page.goto('/')
  await importView(page, nativeEal4, 'eal4-native.json')
  await expect(page.locator('.argument-row')).toHaveCount(nativeEal4.arguments.length)
  await expect(page.locator('.goal-result')).toHaveText('accepted')
  const unresolved = page.locator('.evidence-group[data-issue="predicate_unresolved"]')
  const dependency = page.locator('.evidence-group[data-issue="dependency_unavailable"]')
  await expect(unresolved).toContainText('Predicate unresolved')
  await expect(unresolved).toContainText('The declared condition could not be evaluated from the supplied data.')
  await expect(dependency).toContainText('Dependency unavailable')
  await expect(dependency).toContainText('A required evidence dependency was unavailable.')
  await expect(dependency).toContainText('derived')
  await expect(unresolved).not.toContainText('derived')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('selected extension labels preserve the grounded graph and restore on snapshot changes', async ({page}) => {
  await page.goto('/')
  await page.getByLabel('Graph labelling').selectOption({label:`grounded extension 1 · ${sample.extensions[0]!.length} in`})
  await expect(page.locator('.argument-row')).toHaveCount(sample.arguments.length)
  await importView(page,sample,'new-snapshot.json')
  await expect(page.getByLabel('Graph labelling')).toHaveValue('Grounded')
  await page.getByRole('button',{name:'Snapshot details'}).click()
  await expect(page.getByLabel('Snapshot metadata')).toContainText('Grounded graph status')
  await expect(page.getByLabel('Snapshot metadata')).toContainText('sceptical')
})

test('actual recursive pattern snapshot exposes the reviewed partial priority', async ({page}) => {
  const scoped=JSON.parse(readFileSync(new URL('../tests/fixtures/scoped-review.json',import.meta.url),'utf8'))
  await page.goto('/')
  await importView(page,scoped,'scoped-review.json')
  await page.getByRole('button',{name:'Snapshot details'}).click()
  await page.getByText('Reviewed directives · 2').click()
  await expect(page.getByLabel('Snapshot metadata')).toContainText('prefer release.checks.rest.item')
  await expect(page.getByLabel('Snapshot metadata')).toContainText('synthetic-review/route-order')
  await page.getByLabel('Graph labelling').selectOption({label:'preferred extension 1 · 7 in'})
  await expect(page.locator('.argument-row')).toHaveCount(10)
})

test('all reviewed keyword directives survive source compilation and remain inspectable', async ({page}) => {
  await page.goto('/')
  await importView(page, keywordCompiled, 'aspic-keywords-compiled.json')
  await expect(page.locator('.argument-row')).toHaveCount(15)
  await page.getByRole('button', {name: 'Snapshot details'}).click()
  await page.locator('.reviewed-directives summary').click()
  for (const kind of ['strict', 'rank', 'contrary', 'prefer']) {
    await expect(page.locator('.reviewed-directives code').filter({hasText: new RegExp(`^${kind} `)}).first()).toBeVisible()
  }
  await expect(page.getByLabel('Snapshot metadata')).toContainText('last_link_partial')
  await expect(page.locator('.goal-result')).toHaveText('accepted')
})

test('complete formal keyword theory exposes all attacks and extension-specific labels', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await importView(page, keywordFormal, 'aspic-keywords-formal.json')
  await expect(page.locator('.argument-row')).toHaveCount(15)
  await page.getByRole('button', {name: /^Relations/}).click()
  for (const kind of ['undermine', 'rebut', 'undercut']) {
    const index = keywordFormal.defeats.findIndex(d => d.kind === kind && d.subargument !== d.target)
    await page.locator('.relation-row').filter({hasText: new RegExp(`^${kind}`)}).filter({hasText: `at subargument ${keywordFormal.defeats[index]!.subargument}`}).last().click()
    await expect(page.locator('.witness-box')).toContainText(keywordFormal.defeats[index]!.subargument)
    await expect(page.getByRole('heading', {name: 'Exact attacked subargument'})).toBeVisible()
  }
  await page.getByRole('button', {name: 'Arguments', exact: true}).click()
  const estimate = keywordFormal.arguments.find(a => a.conclusion === 'estimate_normal')!
  const estimateRow = page.locator('.argument-row').filter({hasText: 'estimate_normal'})
  await expect(estimateRow.locator('.label-chip')).toHaveText('undecided')
  for (let index = 0; index < keywordFormal.extensions.length; index++) {
    const extension = keywordFormal.extensions[index]!
    await page.getByLabel('Graph labelling').selectOption({label: `preferred extension ${index + 1} · ${extension.length} in`})
    await expect(estimateRow.locator('.label-chip')).toHaveText(extension.includes(estimate.id) ? 'in' : 'out')
  }
  await page.getByLabel('Graph labelling').selectOption({label: 'Grounded'})
  await expect(estimateRow.locator('.label-chip')).toHaveText('undecided')
  await page.locator('.argument-row').filter({hasText: '~use_primary'}).click()
  await expect(page.locator('.details-panel h3')).toHaveText('~use_primary')
  expect(errors).toEqual([])
})

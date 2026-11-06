import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH
  || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright', 'index.mjs')
    : null);
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright module.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = process.env.GRAPH_BROWSER_ARTIFACT_DIR || join(tmpdir(), 'medicore-knowledge-graph-results');
const port = Number(process.env.GRAPH_BROWSER_PORT || 4184);
const origin = `http://127.0.0.1:${port}`;
const harnessUrl = `${origin}/tests/browser/knowledge-graph.html`;
await mkdir(artifactDir, { recursive: true });

const vite = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], {
  cwd: projectRoot,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'http://127.0.0.1:1',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key',
    VITE_SUPABASE_ANON_KEY: 'synthetic-public-key',
  },
  stdio: 'pipe',
});
let serverLog = '';
for (const stream of [vite.stdout, vite.stderr]) stream.on('data', chunk => {
  serverLog = (serverLog + chunk).slice(-12000);
});
let ready = false;
for (let attempt = 0; attempt < 150; attempt++) {
  try {
    if ((await fetch(harnessUrl)).ok) { ready = true; break; }
  } catch { /* Vite may still be starting. */ }
  if (vite.exitCode !== null) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!ready) {
  vite.kill();
  throw new Error(`Vite failed to start: ${serverLog}`);
}

const externalRequests = [];
const browserErrors = [];
const passedChecks = [];
const recordPass = description => { passedChecks.push(description); console.log(`PASS: ${description}`); };
const executablePath = process.env.GRAPH_BROWSER_EXECUTABLE
  || (existsSync(chromium.executablePath()) ? chromium.executablePath()
    : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;
let page;
let activePage;

async function openHarness(query = '', viewport = { width: 1440, height: 1000 }) {
  const nextPage = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  activePage = nextPage;
  nextPage.on('pageerror', error => browserErrors.push({ route: query || '3d-default', message: error.message }));
  await nextPage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Every non-local request is denied, including all patient APIs and AI calls.
    externalRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  await nextPage.goto(`${harnessUrl}${query}`, { waitUntil: 'networkidle' });
  await nextPage.getByTestId('synthetic-fixture-banner').waitFor();
  return nextPage;
}

async function snapshot(target, name) {
  await target.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true });
}

async function assertNoOverflow(target) {
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'The graph and its controls must not overflow the document horizontally.');
  assert.ok(await target.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
    'The viewport must keep the toolbar visible while long details scroll within the sidebar.');
}

async function visibleCounts(target) {
  const viewport = target.getByTestId('knowledge-graph-viewport');
  return {
    nodes: Number(await viewport.getAttribute('data-visible-nodes')),
    edges: Number(await viewport.getAttribute('data-visible-edges')),
  };
}

async function waitForMode(target, mode) {
  await target.waitForFunction(expected => document.querySelector('[data-testid="knowledge-graph-viewport"]')?.getAttribute('data-mode') === expected, mode);
  if (Number(await target.getByTestId('knowledge-graph-viewport').getAttribute('data-visible-nodes')) > 0) {
    // The mode flag can commit before a lazy scene or WebGL renderer is ready.
    // The canvas label is applied by onCreated, after its listeners are installed.
    const scene = mode === '3d'
      ? target.locator('canvas[aria-label="Graphe de connaissances en trois dimensions"]')
      : target.getByRole('group', { name: 'Graphe de connaissances en deux dimensions', exact: true });
    await scene.waitFor({ state: 'visible', timeout: 10000 });
  }
}

async function searchFor(target, term) {
  const search = target.getByRole('searchbox', { name: 'Rechercher un nœud' });
  await search.fill(term);
  await target.locator('.kg-search-results button').first().waitFor();
  await search.press('Enter');
  // Selection clears the query in the same commit that updates the detail card.
  await target.locator('.kg-search-results').waitFor({ state: 'hidden', timeout: 3000 });
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  page = await openHarness('?webgl=off');
  await page.getByTestId('knowledge-graph-viewport').waitFor();
  await waitForMode(page, '2d');
  assert.deepEqual(await visibleCounts(page), { nodes: 50, edges: 51 });
  await assertNoOverflow(page);
  await snapshot(page, 'knowledge-graph-desktop-2d');
  recordPass('isolated synthetic graph mounts without a patient session or AI request');

  // The same fixture verifies capability absence rather than hiding a WebGL crash.
  assert.equal(await page.locator('canvas').count(), 0, 'WebGL-disabled mode must render an accessible fallback.');
  assert.ok(await page.locator('svg').count() > 0, 'The fallback must include the graph, not only an error message.');
  recordPass('WebGL absence keeps a rendered graph available');

  const search = page.getByRole('searchbox', { name: 'Rechercher un nœud' });
  await search.fill('nephrine');
  const results = page.locator('.kg-search-results');
  await results.getByRole('button').first().waitFor();
  assert.equal(await results.getByRole('button').count(), 3, 'Accent-insensitive search must keep gene, protein, and antibody concepts.');
  await results.getByRole('button').filter({ hasText: 'GENE' }).click();
  assert.match(await page.locator('.kg-node-family').innerText(), /GENE/);
  assert.match(await page.locator('.kg-detail-card').innerText(), /Gène NPHS1/);
  recordPass('search preserves separate gene/protein entities sharing a display name');

  await searchFor(page, 'podocyte');
  assert.equal(await page.locator('.kg-relations-list button').count(), 6,
    'Distinct relation types and reverse directions must remain individually selectable.');
  await page.locator('.kg-relations-list button').filter({ hasText: 'Contribue à' }).click();
  await page.getByRole('heading', { name: 'Relation sélectionnée', exact: true }).waitFor();
  assert.equal(await page.locator('.kg-relation-type').innerText(), 'Contribue à');
  assert.ok(await page.getByText('Aucune référence vérifiable fournie pour ce lien.', { exact: true }).isVisible());
  assert.deepEqual(await page.evaluate(() => window.__knowledgeGraphHarness.actions), [],
    'Reading a node or relation must not invoke expansion or analysis.');
  recordPass('relation selection retains direction and displays missing evidence without an AI call');

  await searchFor(page, 'autoanticorps anti-nephrine');
  await page.locator('.kg-relations-list button').filter({ hasText: 'Cible' }).click();
  const sourceLink = page.getByRole('link', { name: /Autoantibodies Targeting Nephrin in Podocytopathies/ });
  assert.equal(await sourceLink.getAttribute('href'), 'https://pubmed.ncbi.nlm.nih.gov/38804512/');
  assert.equal(await page.locator('.kg-qualifier-badge').innerText(), 'Recherche');
  assert.ok(await page.getByText('Cette fixture vérifie une interface et ne constitue pas une analyse clinique.', { exact: true }).isVisible());
  await snapshot(page, 'knowledge-graph-evidence');
  recordPass('selected research relation exposes its real source and explicit limitations');

  await page.getByRole('checkbox', { name: 'Famille : Traitements', exact: true }).uncheck();
  assert.equal((await visibleCounts(page)).nodes, 44);
  assert.equal(await page.getByRole('button', { name: 'Sélectionner Rituximab', exact: true }).count(), 0);
  await page.getByRole('checkbox', { name: 'Famille : Traitements', exact: true }).check();
  assert.equal((await visibleCounts(page)).nodes, 50);
  await page.getByRole('checkbox', { name: 'Lien : À vérifier', exact: true }).uncheck();
  assert.deepEqual(await visibleCounts(page), { nodes: 50, edges: 6 });
  await page.getByRole('checkbox', { name: 'Lien : Recherche', exact: true }).uncheck();
  assert.equal((await visibleCounts(page)).edges, 2);
  await page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
  assert.deepEqual(await visibleCounts(page), { nodes: 50, edges: 51 });
  recordPass('family and evidence filters operate independently and reset without data loss');

  const treatmentFamily = page.getByRole('button', { name: 'Explorer la famille Traitements', exact: true });
  await treatmentFamily.focus();
  await treatmentFamily.press('Space');
  assert.equal((await visibleCounts(page)).nodes, 7, 'Keyboard family selection keeps its six concepts and the center.');
  await page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
  recordPass('semantic family groups can be selected using the keyboard');

  await page.getByRole('button', { name: 'Direct', exact: true }).click();
  assert.equal((await visibleCounts(page)).nodes, 27);
  assert.equal(await page.getByRole('button', { name: 'Sélectionner Signal témoin isolé', exact: true }).count(), 0);
  await page.getByRole('button', { name: '3 liens', exact: true }).click();
  assert.ok((await visibleCounts(page)).nodes > 27 && (await visibleCounts(page)).nodes < 50);
  await page.getByRole('button', { name: 'Tout', exact: true }).click();
  assert.equal((await visibleCounts(page)).nodes, 50);
  assert.equal(await page.getByRole('button', { name: 'Sélectionner Signal témoin isolé', exact: true }).count(), 1);
  recordPass('path depth follows actual connectivity and keeps disconnected concepts in the complete view');

  const flatTransform = page.getByRole('group', { name: 'Graphe de connaissances en deux dimensions', exact: true }).locator(':scope > g');
  const initialTransform = await flatTransform.getAttribute('transform');
  await page.getByRole('button', { name: 'Augmenter le zoom', exact: true }).click();
  // Camera commands are consumed in a React effect, after the button's click.
  // Wait for the observable result, preserving the same strict assertions.
  await page.waitForFunction(previous => document.querySelector('svg.kg-svg > g')?.getAttribute('transform') !== previous,
    initialTransform, { timeout: 3000 });
  assert.notEqual(await flatTransform.getAttribute('transform'), initialTransform);
  await page.getByRole('button', { name: 'Recentrer', exact: true }).click();
  await page.waitForFunction(previous => document.querySelector('svg.kg-svg > g')?.getAttribute('transform') === previous,
    initialTransform, { timeout: 3000 });
  assert.equal(await flatTransform.getAttribute('transform'), initialTransform);
  recordPass('zoom and recenter change the rendered graph viewport');

  await page.getByRole('checkbox', { name: 'Famille : Traitements', exact: true }).uncheck();
  await page.getByRole('button', { name: '3 liens', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Isoler visuellement la sélection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Toutes les étiquettes', exact: true }).check();
  await page.getByRole('button', { name: 'Sauvegarder le graphe', exact: true }).click();
  const saved = await page.evaluate(() => window.__knowledgeGraphHarness.savedView);
  assert.equal(saved.maxDepth, 3);
  assert.equal(saved.mode, '2d');
  assert.equal(saved.focus, true);
  assert.equal(saved.showLabels, true);
  assert.ok(!saved.families.includes('treatments'));
  await page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
  await page.getByRole('button', { name: 'Charger un graphe', exact: true }).click();
  await page.waitForFunction(() => {
    const family = document.querySelector('input[aria-label="Famille : Traitements"]');
    return family instanceof HTMLInputElement && family.checked === false;
  }, undefined, { timeout: 3000 });
  assert.equal(await page.getByRole('checkbox', { name: 'Famille : Traitements', exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('button', { name: '3 liens', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('checkbox', { name: 'Toutes les étiquettes', exact: true }).isChecked(), true);
  recordPass('saved presentation state restores filters, depth, mode, and label preferences locally');

  await searchFor(page, 'autoanticorps anti-nephrine');
  await page.getByRole('button', { name: 'Explorer les liens', exact: true }).click();
  await page.getByRole('button', { name: 'Analyse approfondie', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__knowledgeGraphHarness.actions), ['save', 'load', 'expand:anti-nephrin', 'deep-analysis']);
  recordPass('expansion and deep analysis require explicit actions and invoke only supplied local callbacks');

  const three = await openHarness();
  await waitForMode(three, '3d');
  await three.locator('canvas').waitFor();
  const centralLabel = three.getByRole('button', { name: 'Sélectionner Syndrome néphrotique', exact: true });
  await centralLabel.waitFor();
  assert.deepEqual(await visibleCounts(three), { nodes: 50, edges: 51 });
  const canvasBounds = await three.locator('canvas').boundingBox();
  assert.ok(canvasBounds.width > 850 && canvasBounds.height > 550, 'The 3D canvas must occupy the available workspace.');
  await snapshot(three, 'knowledge-graph-desktop-3d');
  await centralLabel.click();
  assert.match(await three.locator('.kg-node-family').innerText(), /PATHOLOGY/);
  await three.getByRole('button', { name: 'Passer en vue 2D', exact: true }).click();
  await waitForMode(three, '2d');
  assert.deepEqual(await visibleCounts(three), { nodes: 50, edges: 51 });
  await three.getByRole('button', { name: 'Passer en vue 3D', exact: true }).click();
  await waitForMode(three, '3d');
  await three.locator('canvas').waitFor();
  await centralLabel.waitFor();
  await three.locator('canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await waitForMode(three, '2d');
  assert.deepEqual(await visibleCounts(three), { nodes: 50, edges: 51 });
  recordPass('3D rendering, 2D toggle, and context-loss fallback retain the same graph');
  await three.close();

  const mobile = await openHarness('?webgl=off', { width: 390, height: 844 });
  await waitForMode(mobile, '2d');
  await assertNoOverflow(mobile);
  assert.ok(await mobile.getByRole('button', { name: 'Analyse approfondie', exact: true }).isVisible());
  assert.ok(await mobile.getByRole('button', { name: 'Recentrer', exact: true }).isVisible());
  await mobile.getByRole('button', { name: 'Explorer', exact: true }).click();
  await mobile.getByRole('checkbox', { name: 'Famille : Traitements', exact: true }).uncheck();
  assert.equal((await visibleCounts(mobile)).nodes, 44);
  await mobile.getByRole('button', { name: 'Fermer les filtres', exact: true }).click();
  await searchFor(mobile, 'podocyte');
  await mobile.getByRole('button', { name: 'Centrer ici', exact: true }).click();
  await mobile.locator('.kg-stage-heading').getByRole('heading', { name: 'Podocyte', exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await mobile.locator('.kg-stage-heading h2').innerText(), 'Podocyte');
  await assertNoOverflow(mobile);
  await snapshot(mobile, 'knowledge-graph-mobile-detail');
  await mobile.getByRole('button', { name: 'Fermer les filtres', exact: true }).click();
  await snapshot(mobile, 'knowledge-graph-mobile-2d');
  recordPass('390px viewport keeps search, filters, node details, and recenter reachable');
  await mobile.close();

  const dense = await openHarness('?dataset=dense&webgl=off');
  await dense.getByTestId('knowledge-graph-viewport').waitFor();
  await waitForMode(dense, '2d');
  assert.deepEqual(await visibleCounts(dense), { nodes: 230, edges: 231 });
  await searchFor(dense, 'Concept synthétique 180');
  assert.ok(await dense.getByRole('heading', { name: 'Concept synthétique 180', exact: true }).isVisible());
  await snapshot(dense, 'knowledge-graph-dense-2d');
  recordPass('230-node fixture preserves every concept, including the final searchable item');
  await dense.close();

  const geneRoot = await openHarness('?dataset=gene-root&webgl=off');
  await waitForMode(geneRoot, '2d');
  assert.deepEqual(await visibleCounts(geneRoot), { nodes: 50, edges: 51 });
  assert.equal(await geneRoot.locator('.kg-stage-heading h2').innerText(), 'Néphrine');
  await geneRoot.locator('.kg-svg-node').filter({ has: geneRoot.locator('.kg-svg-label--center') }).click();
  assert.match(await geneRoot.locator('.kg-node-family').innerText(), /GENE/);
  recordPass('an explicit gene root takes precedence over a legacy ring-zero pathology');
  await geneRoot.close();

  const empty = await openHarness('?state=empty&webgl=off');
  await empty.getByRole('heading', { name: 'Aucun concept disponible', exact: true }).waitFor();
  assert.deepEqual(await visibleCounts(empty), { nodes: 0, edges: 0 });
  assert.equal(await empty.getByRole('button', { name: 'Analyse approfondie', exact: true }).isEnabled(), false);
  await empty.close();
  const loading = await openHarness('?state=loading&webgl=off');
  await loading.getByText('Chargement synthétique : aucun appel réseau.', { exact: true }).waitFor();
  assert.equal(await loading.getByRole('button', { name: 'Analyse approfondie', exact: true }).isEnabled(), false);
  await loading.close();
  recordPass('empty and loading states remain explicit and disable unavailable analysis actions');

  const failed = await openHarness('?state=error&webgl=off');
  await failed.getByRole('alert').filter({ hasText: 'Erreur synthétique' }).waitFor();
  assert.deepEqual(await visibleCounts(failed), { nodes: 50, edges: 51 });
  await failed.getByRole('button', { name: 'Réessayer', exact: true }).click();
  assert.deepEqual(await failed.evaluate(() => window.__knowledgeGraphHarness.actions), ['retry']);
  await failed.close();
  recordPass('error state retains the existing graph and makes retry an explicit action');

  await page.getByRole('button', { name: 'Fermer le graphe', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Démonstration fermée.' }).waitFor();
  recordPass('close action exits the explorer cleanly');

  assert.deepEqual(externalRequests, [], 'The harness must never call remote services.');
  assert.deepEqual(browserErrors, [], 'The tested graph must not throw browser errors.');
  const report = { passed: true, checks: passedChecks, externalRequests, browserErrors, artifactDir };
  await writeFile(join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  const failedPage = activePage && !activePage.isClosed() ? activePage : page;
  if (failedPage) await snapshot(failedPage, 'knowledge-graph-failure').catch(() => {});
  await writeFile(join(artifactDir, 'failure.json'), JSON.stringify({
    passed: false,
    error: String(error),
    checks: passedChecks,
    externalRequests,
    browserErrors,
    serverLog,
  }, null, 2));
  throw error;
} finally {
  await browser?.close();
  vite.kill();
}

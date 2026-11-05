import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { RESEARCH_MODEL } from '../supabase/functions/_shared/research-model.ts';

// These are the scientific synthesis entry points that used to request a legacy
// model and then silently inherit a generic route. Query translation is excluded.
const RESEARCH_CALLERS = [
  'systematic-research', 'focused-research', 'targeted-research', 'live-research', 'discovery-search',
  'deep-research', 'cde-analyze', 'discovery-engine', 'discovery-platform', 'hypothesis-generator',
  'hypothesis-processor', 'scientific-analysis', 'validate-hypothesis', 'causal-reasoning',
  'analyze-kg-links', 'analyze-user-links', 'graph-chat', 'radial-rings-engine',
  'adversarial-reviewer', 'lbd-contradiction-detector',
  'pathology-analyzer', 'patient-health-synthesis', 'detect-side-effects', 'ai-assistant',
  'cross-data-analyzer',
];

test('every research synthesis call uses the explicit research model, including native and second-pass calls', () => {
  const failures: string[] = [];
  let checked = 0;
  let translations = 0;
  for (const name of RESEARCH_CALLERS) {
    const filename = `supabase/functions/${name}/index.ts`;
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const variables = new Map<string, ts.Expression>();
    const collect = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer);
      ts.forEachChild(node, collect);
    };
    collect(source);
    const researchOption = (node?: ts.Expression, depth = 0): boolean => {
      if (!node || depth > 3) return false;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'researchAIOptions') return true;
      return ts.isIdentifier(node) && researchOption(variables.get(node.text), depth + 1);
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && ['callAI', 'streamAI', 'startBackgroundAI'].includes(node.expression.text)) {
        let owner: ts.Node | undefined = node.parent;
        while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
        if (name === 'focused-research' && owner && ts.isFunctionDeclaration(owner) && owner.name?.text === 'translateQuery') {
          translations++;
        } else {
          checked++;
          if (!researchOption(node.arguments.at(-1))) failures.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(checked >= 35, `Expected all synthesis branches; found ${checked}`);
  assert.equal(translations, 1, 'the terminology translation step is kept on its existing lightweight route');
  assert.deepEqual(failures, []);
});

test('both legacy matrix creation branches use the research policy while the native agent keeps its own contract', () => {
  const filename = 'supabase/functions/cross-data-analyzer/matrix-job.ts';
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  let legacyCalls = 0, agentCalls = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'startBackgroundAI') {
      const options = node.arguments.at(-1);
      const isAgent = ts.isPropertyAccessExpression(node.arguments[0]) && node.arguments[0].expression.getText(source) === 'agentRequest';
      if (isAgent) agentCalls++;
      else {
        legacyCalls++;
        assert.ok(options && ts.isCallExpression(options) && ts.isIdentifier(options.expression)
          && options.expression.text === 'researchAIOptions', 'legacy pair analysis and final synthesis must both force Astra');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(legacyCalls, 2);
  assert.equal(agentCalls, 1);
});

test('patient synthesis retrieval carries the same research model policy as its background creation', () => {
  const filename = 'supabase/functions/patient-health-synthesis/index.ts';
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  let retrievals = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'retrieveBackgroundForWorker') {
      retrievals++;
      const options = node.arguments.at(-1);
      assert.ok(options && ts.isCallExpression(options) && ts.isIdentifier(options.expression)
        && options.expression.text === 'researchAIOptions', 'provider retrieval must not advertise a stale or different model');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(retrievals, 1);
});

test('the documented research engine preset matches the actual model policy', () => {
  const config = JSON.parse(readFileSync('src/lib/research-engine-config.json', 'utf8'));
  assert.equal(config.model.primary, RESEARCH_MODEL);
  assert.equal(config.model.fallback, RESEARCH_MODEL);
});

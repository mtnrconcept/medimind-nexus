import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { NATIVE_AI_JOB_TOOLS } from '../supabase/functions/_shared/ai-tool-registry.ts';

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
function property(object: ts.ObjectLiteralExpression, name: string) {
  const item = object.properties.find(item => (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item))
    && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name);
  return item && ts.isPropertyAssignment(item) ? item.initializer : item && ts.isShorthandPropertyAssignment(item) ? item.name : undefined;
}

test('all explicit native AI generation callers opt into server jobs and avoid direct streaming fetch', () => {
  const failures: string[] = [];
  let checked = 0;
  let matrixStarts = 0;
  let systematicStarts = 0;
  for (const filename of sources('src')) {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const [first, second] = node.arguments;
        const callee = ts.isIdentifier(node.expression) ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
          && NATIVE_AI_JOB_TOOLS.has(first.text) && ['invokeAI', 'invoke'].includes(callee)) {
          let body = second;
          if (callee === 'invoke' && body && ts.isObjectLiteralExpression(body)) body = property(body, 'body');
          if (body && ts.isObjectLiteralExpression(body) && !property(body, 'action')) {
            checked += 1;
            if (property(body, 'async')?.kind !== ts.SyntaxKind.TrueKeyword) failures.push(filename + ': ' + first.text + ' must use async:true');
          }
        }
        // The progressive cross-data workflow now uses a dedicated durable
        // server job, rather than a generic async:true Edge invocation.
        if (callee === 'submit' && ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'matrix' &&
            first && ts.isStringLiteral(first) && first.text === 'matrix.start') {
          matrixStarts += 1;
          checked += 1;
        }
        if (['fetch', 'aiFetch'].includes(callee) && first) {
          const endpoint = first.getText(source);
          for (const name of NATIVE_AI_JOB_TOOLS) {
            if (new RegExp('/functions/v1/' + name + '(?![a-z-])').test(endpoint)) failures.push(filename + ': direct fetch bypasses native job observation');
          }
          if (endpoint.includes('/functions/v1/cde-systematic-analyze')) {
            systematicStarts += 1;
            const body = second && ts.isObjectLiteralExpression(second) ? property(second, 'body') : undefined;
            const payload = body && ts.isCallExpression(body) ? body.arguments[0] : undefined;
            const action = payload && ts.isObjectLiteralExpression(payload) ? property(payload, 'action') : undefined;
            if (!action || !ts.isStringLiteral(action) || !['start', 'start_run'].includes(action.text)) {
              failures.push(filename + ': systematic analysis must be orchestrated by its server job');
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(matrixStarts > 0, 'The progressive OpenAI matrix server-job entry point was found');
  assert.ok(checked >= 7, 'Expected native plus durable matrix entries, found ' + checked);
  assert.ok(systematicStarts > 0, 'The systematic workflow entry point was found');
  assert.deepEqual(failures, []);
});

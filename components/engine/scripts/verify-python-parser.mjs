import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Parse inert Python through the shipped bridge and preserve its comment-policy boundary. */
export async function verifyPythonParser(pkg, root) {
  const load = name => import(pathToFileURL(join(pkg, 'dist/engine/src/checkers', name + '.js')).href);
  const { parsePythonAst, analyzePython } = await load('python-analysis');
  const { pythonCommentFindings } = await load('python-comments');
  const { SourceSyntaxError } = await load('typescript-analysis');
  const source = '"""Module overview."""\n@wrapper\ndef existing(flag):\n return left() if flag else None\n\nselect = lambda values: values[0]\ntry:\n inspect()\nexcept Exception:\n recover()\n';
  const input = join(root, 'python-adapter.py');
  writeFileSync(input, source);
  const tree = await parsePythonAst(input);
  assert.ok(tree, 'Release proof requires Python');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(tree);
  for (const [kind, childKind] of [['IfExp', 'Call'], ['Lambda', 'Subscript']]) {
    const node = nodes.find(item => item.kind === kind);
    assert.ok(node, kind);
    assert.equal(node.body.length, 1, kind);
    assert.equal(node.children[node.body[0]].kind, childKind, kind);
  }
  assert.equal(nodes.find(node => node.kind === 'ExceptHandler').name, '');
  assert.equal(tree.doc, 'Module overview.');
  assert.deepEqual(nodes.find(node => node.kind === 'FunctionDef').decorators, [2]);
  const analysis = await analyzePython(input);
  assert.deepEqual(analysis.extents.map(e => [e.kind, e.name, e.start, e.end]), [['function', 'existing', 3, 4]]);
  assert.deepEqual([...analysis.metrics.values()], [[1, 0, 0]]);
  const selection = { enforceAll: false, overviewBlocking: false, ranges: [[4, 4]] };
  const changed = source.replace('left() if flag else None', 'right() if flag else None') + '\ndef added(flag):\n return 3 if flag else 4\n';
  const findings = await pythonCommentFindings('source.py', changed, source, {}, selection);
  assert.ok(!findings.some(f => f.rule_id === 'SC010'));
  assert.equal(findings.find(f => f.declaration === 'existing').severity, 'advisory');
  assert.equal(findings.find(f => f.declaration === 'added').severity, 'blocking');
  writeFileSync(input, 'def broken(:\n');
  await assert.rejects(parsePythonAst(input), SourceSyntaxError);
  const unavailable = await pythonCommentFindings('source.py', 'pass\n', null, {}, selection, async () => null);
  assert.deepEqual(unavailable.map(f => [f.rule_id, f.severity]), [['SC010', 'blocking']]);
  return { status: 'passed', shapes: ['conditional', 'lambda', 'unnamed-exception'],
    currentAndHistoricalComments: 'passed', extentsMetricsDocsDecorators: 'passed', syntaxAndUnavailableStillBlock: 'passed',
    scope: 'compiled installed parser with inert source; no application code executed' };
}

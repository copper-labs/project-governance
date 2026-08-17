#!/usr/bin/env node
// Ask the installed TypeScript compiler for syntax and declaration extents.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let ts;
try {
  ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
} catch (_error) {
  process.exit(2);
}

const input = process.argv[2];
const source = fs.readFileSync(input, 'utf8');
const kind = input.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
const file = ts.createSourceFile(input, source, ts.ScriptTarget.Latest, true, kind);
if (file.parseDiagnostics.length > 0) {
  const diagnostic = file.parseDiagnostics[0];
  const location = file.getLineAndCharacterOfPosition(diagnostic.start || 0);
  process.stderr.write(`${path.basename(input)}:${location.line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`);
  process.exit(1);
}

const extents = [];
function visit(node, scope = []) {
  let declarationKind;
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
    declarationKind = 'type';
  } else if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    declarationKind = 'function';
  }
  let nextScope = scope;
  if (declarationKind) {
    const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const end = file.getLineAndCharacterOfPosition(node.end).line + 1;
    const localName = node.name ? node.name.getText(file) : '<anonymous>';
    const qualifiedName = [...scope, localName].join('.');
    extents.push({
      kind: declarationKind,
      name: qualifiedName,
      start,
      end,
    });
    nextScope = [...scope, localName];
  }
  ts.forEachChild(node, (child) => visit(child, nextScope));
}
visit(file);
process.stdout.write(`${JSON.stringify({ extents })}\n`);

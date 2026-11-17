import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);
afterAll(() => parser.delete());

test.each([
  ['index', 'at:{break :at 0;}', ['at:'], undefined],
  ['start', 'first:{break :first 0;}..1', ['first:'], undefined],
  ['end', '0..last:{break :last 1;}', ['last:'], undefined],
  ['both bounds', 'first:{break :first 0;}..last:{break :last 1;}:0', ['first:', 'last:'], '0'],
  ['sentinel', '0..1:zero:{break :zero 0;}', ['zero:'], 'zero:{break :zero 0;}'],
])('keeps labeled blocks in a slice or index %s', (_context, index, labels, sentinel) => {
  const tree = parser.parse(`const result = values[${index}];`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const access = tree.rootNode.descendantsOfType('index_expression')[0];
    assert.ok(access);
    expect(access.descendantsOfType('block_label').map((node) => node.text)).toEqual(labels);
    expect(access.childForFieldName('sentinel')?.text).toBe(sentinel);
    expect(access.childForFieldName('index')?.type).toBe(
      _context === 'index' ? 'labeled_type_expression' : 'range_expression'
    );
  } finally {
    tree.delete();
  }
});

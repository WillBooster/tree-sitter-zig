import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);
const elements = new Query(language, '(array_type (if_type_expression) @element)');
const highlights = new Query(language, readFileSync(new URL('../../queries/highlights.scm', import.meta.url), 'utf8'));

afterAll(() => {
  highlights.delete();
  elements.delete();
  parser.delete();
});

test('captures conditional array elements and builtin types at their expected source ranges', () => {
  const source = readFileSync(new URL('../fixtures/conditionalArrayTypes.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const captured = elements.captures(tree.rootNode).map(({ node }) => node);
    expect(captured.map((node) => node.text)).toEqual([
      'if (true) u8 else u16',
      'if (false) u8 else u16',
      'if (true) u8 else u16',
      'if (false) [3]u8 else [4]u16',
      'if (true) u8 else u16',
      'if (false) u8 else u16',
    ]);
    expect(captured.map((node) => [node.startIndex, node.endIndex, node.startPosition, node.endPosition])).toEqual([
      [17, 38, { row: 0, column: 17 }, { row: 0, column: 38 }],
      [62, 84, { row: 1, column: 22 }, { row: 1, column: 44 }],
      [107, 128, { row: 2, column: 21 }, { row: 2, column: 42 }],
      [148, 176, { row: 3, column: 18 }, { row: 3, column: 46 }],
      [256, 277, { row: 5, column: 34 }, { row: 5, column: 55 }],
      [302, 324, { row: 6, column: 21 }, { row: 6, column: 43 }],
    ]);
    const expectedBuiltinCaptures = [...source.matchAll(/\b(?:u8|u16|void)\b/g)].map((match) => [
      match[0],
      match.index,
      match.index + match[0].length,
    ]);
    expect(
      highlights
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'type.builtin')
        .map(({ node }) => [node.text, node.startIndex, node.endIndex])
    ).toEqual(expectedBuiltinCaptures);
    const parameter = tree.rootNode.descendantsOfType('parameter')[0]!;
    expect(parameter.childForFieldName('type')?.text).toBe('[2]if (false) u8 else u16');
    const field = tree.rootNode.descendantsOfType('container_field')[0]!;
    expect(field.childForFieldName('type')?.text).toBe('[2]if (true) u8 else u16');
  } finally {
    tree.delete();
  }
});

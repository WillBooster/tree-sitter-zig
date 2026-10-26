import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

test('exposes conditional array elements with complete branches, ranges and type captures', () => {
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
    for (const node of captured) {
      expect(node.parent?.type).toBe('array_type');
      expect(node.parent?.endIndex).toBe(node.endIndex);
      expect(source.slice(node.startIndex, node.endIndex)).toBe(node.text);
      expect(node.startPosition.column).toBe(node.startIndex - source.lastIndexOf('\n', node.startIndex) - 1);
      expect(node.childForFieldName('condition')?.type).toBe('boolean');
    }
    const builtinTypes = tree.rootNode.descendantsOfType('builtin_type');
    expect(
      highlights
        .captures(tree.rootNode)
        .filter(({ name }) => name === 'type.builtin')
        .map(({ node }) => node.startIndex)
    ).toEqual(builtinTypes.map((node) => node.startIndex));
    const parameter = tree.rootNode.descendantsOfType('parameter')[0]!;
    expect(parameter.childForFieldName('type')?.text).toBe('[2]if (false) u8 else u16');
    const field = tree.rootNode.descendantsOfType('container_field')[0]!;
    expect(field.childForFieldName('type')?.text).toBe('[2]if (true) u8 else u16');
  } finally {
    tree.delete();
  }
});

test('recovers and preserves incremental element ownership across grouping and missing branches', () => {
  let value = '[2]u8';
  let source = `const Array = ${value}; const preserved = 1;`;
  const startIndex = source.indexOf(value);
  let tree = parser.parse(source)!;
  try {
    for (const next of [
      '[2]if (true) u8 else u16',
      '[2:0]if (false) u8 else u16',
      '[2](if (true) u8 else u16)',
      '[2]if (true) u8 else',
      '[2]if (true) u8 else u16',
      '[2]u8',
    ]) {
      const oldEndIndex = startIndex + value.length;
      const newEndIndex = startIndex + next.length;
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex,
          startPosition: { row: 0, column: startIndex },
          oldEndPosition: { row: 0, column: oldEndIndex },
          newEndPosition: { row: 0, column: newEndIndex },
        })
      );
      source = source.slice(0, startIndex) + next + source.slice(oldEndIndex);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.hasError).toBe(next.endsWith('else'));
        expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('const preserved = 1;');
        const captures = elements.captures(tree.rootNode);
        expect(captures.map(({ node }) => [node.text, node.startIndex, node.endIndex])).toEqual(
          elements.captures(fresh.rootNode).map(({ node }) => [node.text, node.startIndex, node.endIndex])
        );
        if (!tree.rootNode.hasError) {
          expect(captures).toHaveLength(next.includes(']if') ? 1 : 0);
        }
      } finally {
        fresh.delete();
      }
      value = next;
    }
  } finally {
    tree.delete();
  }
});

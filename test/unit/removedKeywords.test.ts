import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);

afterAll(() => parser.delete());

test('parses removed keywords as declaration names, fields, and enum tags', () => {
  const source = readFileSync(new URL('../fixtures/removedKeywords.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('container_field').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['usingnamespace', 'async', 'await', 'usingnamespace', 'async', 'await']);
    expect(tree.rootNode.descendantsOfType('field_expression').map((node) => node.text)).toContain(
      'value.usingnamespace'
    );
  } finally {
    tree.delete();
  }
});

test.each(['usingnamespace @import("std");', 'pub usingnamespace Namespace;'])(
  'rejects the removed declaration %j',
  (source) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(true);
    } finally {
      tree.delete();
    }
  }
);

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);

afterAll(() => parser.delete());

test('exposes only the prefix operand through try nodes and structural queries', () => {
  const source = readFileSync(new URL('../fixtures/tryExpressions.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
  const query = new Query(language, '(binary_expression left: (try_expression (call_expression)) @propagation)');
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('try_expression').map((node) => node.text)).toEqual([
      'try number(fail)',
      'try number(false)',
      'try number(false)',
      'try (number(false))',
      'try if (fail) number(true) else number(false)',
      'try evaluate(false)',
    ]);
    expect(query.captures(tree.rootNode).map(({ node }) => node.text)).toEqual([
      'try number(fail)',
      'try number(false)',
      'try evaluate(false)',
    ]);
  } finally {
    query.delete();
    tree.delete();
  }
});

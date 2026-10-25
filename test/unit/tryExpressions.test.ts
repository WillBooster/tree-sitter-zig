import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

test('keeps prefix ownership consistent when grouping and a missing operand are edited', () => {
  const source = 'fn f() !i32 { return try number(false) + 1; }';
  const startIndex = source.indexOf('try');
  let currentSource = source;
  let currentExpression = 'try number(false) + 1';
  let tree = parser.parse(source)!;
  try {
    for (const expression of ['try (number(false) + 1)', 'try number(false) +', 'try number(false) + 1']) {
      const oldEndIndex = startIndex + currentExpression.length;
      const newEndIndex = startIndex + expression.length;
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
      currentSource = currentSource.slice(0, startIndex) + expression + currentSource.slice(oldEndIndex);
      const incremental = parser.parse(currentSource, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(currentSource)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.hasError).toBe(expression.endsWith('+'));
        if (!tree.rootNode.hasError) {
          const propagation = tree.rootNode.descendantsOfType('try_expression')[0]!;
          expect(propagation.text).toBe(expression.includes('try (') ? expression : 'try number(false)');
        }
      } finally {
        fresh.delete();
      }
      currentExpression = expression;
    }
  } finally {
    tree.delete();
  }
});

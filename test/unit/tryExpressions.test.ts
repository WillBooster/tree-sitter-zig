import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);

afterAll(() => parser.delete());

test('exposes only the prefix operand through try nodes', () => {
  const source = readFileSync(new URL('../fixtures/tryExpressions.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
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
    const propagations = tree.rootNode.descendantsOfType('binary_expression').flatMap((node) => {
      const left = node.childForFieldName('left');
      return left?.type === 'try_expression' && left.namedChildren.some((child) => child.type === 'call_expression')
        ? [left]
        : [];
    });
    expect(propagations.map((node) => node.text)).toEqual([
      'try number(fail)',
      'try number(false)',
      'try evaluate(false)',
    ]);
  } finally {
    tree.delete();
  }
});

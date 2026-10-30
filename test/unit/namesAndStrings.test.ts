import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);

afterAll(() => parser.delete());

test.each([
  `const ordinary = 1;
const CamelCase = ordinary;
const ALL_CAPS = ordinary;
// ordinary comment
//! container documentation
/// declaration documentation
`,
  'const @"hello world" = "hello world";',
  String.raw`const @"a\nb" = "a\nb"; const character = '\n';`,
  `const Callback = fn (arg: api.inner.callback) void;
pub fn inspect(arg: api.one, nested: api.inner.two, plain: direct) void {
    const value = api.inner.value;
}
`,
])('parses %j without errors', (source) => {
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
  } finally {
    tree.delete();
  }
});

test('parses each multiline string line as content', () => {
  const source = readFileSync(new URL('../fixtures/multilineStrings.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const literal = tree.rootNode.descendantsOfType('multiline_string')[0]!;
    expect(literal.namedChildren.map((node) => node.text)).toEqual([
      '  two leading spaces',
      '// literal comment marker',
      String.raw`あ😀 literal \n and \\ text`,
    ]);
  } finally {
    tree.delete();
  }
});

test.each(['\n', '\r\n'])('keeps empty multiline bodies and %j line endings outside content nodes', (newline) => {
  const source = ['const text =', String.raw`    \\`, String.raw`    \\tail`, ';'].join(newline);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const literal = tree.rootNode.descendantsOfType('multiline_string')[0]!;
    expect(literal.namedChildren.map((node) => node.text)).toEqual(['tail']);
  } finally {
    tree.delete();
  }
});

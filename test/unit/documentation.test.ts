import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);

afterAll(() => parser.delete());

test('parses documentation comments, ordinary comments, and strings without errors', () => {
  const tree = parser.parse(readFileSync(new URL('../fixtures/documentation.zig', import.meta.url), 'utf8'))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
  } finally {
    tree.delete();
  }
});

test.each(['///', '//!'])('keeps empty and nonempty %s bodies at EOF without zero-width public nodes', (marker) => {
  for (const body of ['', ' text', ' あ😀\0']) {
    const source = marker + body;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      const comment = tree.rootNode.namedChild(0)!;
      expect(comment.text).toBe(source);
      expect(comment.startIndex).toBe(0);
      expect(comment.endIndex).toBe(source.length);
      expect(comment.namedChildren.map((node) => node.text)).toEqual(body ? [body] : []);
      expect(comment.namedChildren.every((node) => node.endIndex > node.startIndex)).toBe(true);
    } finally {
      tree.delete();
    }
  }
});

test.each(['\n', '\r\n'])('preserves %j in documentation bodies, including empty lines', (newline) => {
  const source = ['//! Container', '//!', '/// Declaration', '///', 'const value = 1;'].join(newline);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const contents = tree.rootNode.descendantsOfType('doc_comment_content');
    expect(contents.map((node) => node.text)).toEqual([
      ` Container${newline}`,
      newline,
      ` Declaration${newline}`,
      newline,
    ]);
    expect(contents.map((node) => node.endPosition)).toEqual([
      { row: 1, column: 0 },
      { row: 2, column: 0 },
      { row: 3, column: 0 },
      { row: 4, column: 0 },
    ]);
  } finally {
    tree.delete();
  }
});

test.each([
  '/\nconst preserved = 1;\n',
  'const broken = /;\nconst preserved = 1;\n',
  'const broken = "/\nconst preserved = 1;\n',
])('recovers declarations after incomplete slash or string input: %j', (source) => {
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
    expect(tree.rootNode.descendantsOfType('doc_comment_content')).toHaveLength(0);
    expect(
      tree.rootNode.descendantsOfType('variable_declaration').some((node) => node.text === 'const preserved = 1;')
    ).toBe(true);
  } finally {
    tree.delete();
  }
});

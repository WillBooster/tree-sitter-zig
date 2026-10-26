import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const highlights = new Query(language, readFileSync(new URL('../../queries/highlights.scm', import.meta.url), 'utf8'));

test('classifies names and documentation comments without treating ordinary text as types or constants', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(`const ordinary = 1;
const CamelCase = ordinary;
const ALL_CAPS = ordinary;
// ordinary comment
//! container documentation
/// declaration documentation
`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const captures = highlights.captures(tree.rootNode);
    const texts = (name: string): string[] =>
      captures.filter((capture) => capture.name === name).map(({ node }) => node.text);
    expect(texts('type')).toEqual(['CamelCase', 'ALL_CAPS']);
    expect(texts('constant')).toEqual(['ALL_CAPS']);
    expect(texts('comment.documentation')).toEqual(['//! container documentation']);
    expect(texts('variable')).toContain('ordinary');
    expect(texts('comment')).toEqual([
      '// ordinary comment',
      '//! container documentation',
      '/// declaration documentation',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('highlights qualified parameter types without treating value members as types', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const directory = mkdtempSync(path.join(root, '.tmp/qualified-highlights-'));
  const parser = new Parser();
  parser.setLanguage(language);
  const source = `const Callback = fn (arg: api.inner.callback) void;
pub fn inspect(arg: api.one, nested: api.inner.two, plain: direct) void {
    const value = api.inner.value;
}
`;
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const types = highlights
      .captures(tree.rootNode)
      .filter(({ name }) => name === 'type')
      .map(({ node }) => node.text);
    expect(types).toEqual(['Callback', 'callback', 'one', 'two', 'direct']);
    const file = path.join(directory, 'input.zig');
    writeFileSync(file, source);
    const html = execFileSync(
      path.join(root, 'script/tree-sitter'),
      ['highlight', '--html', '--layout', 'fragment', '--style', 'minimal', file],
      { cwd: root, encoding: 'utf8' }
    );
    for (const type of ['callback', 'one', 'two', 'direct']) {
      expect(html).toContain(`<span class='type'>${type}</span>`);
    }
    expect(html).toContain(`<span class='variable'>value</span>`);
  } finally {
    tree.delete();
    parser.delete();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('captures multiline delimiters without consuming raw text as comments or escapes', () => {
  const source = readFileSync(new URL('../fixtures/multilineStrings.zig', import.meta.url), 'utf8');
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const captures = highlights.captures(tree.rootNode);
    const delimiters = captures.filter(({ name }) => name === 'string.special.symbol').map(({ node }) => node);
    expect(delimiters.map((node) => node.text)).toEqual([
      String.raw`\\`,
      String.raw`\\`,
      String.raw`\\`,
      String.raw`\\`,
    ]);
    const literal = tree.rootNode.descendantsOfType('multiline_string')[0]!;
    expect(literal.namedChildren.map((node) => node.text)).toEqual([
      '  two leading spaces',
      '// literal comment marker',
      String.raw`あ😀 literal \n and \\ text`,
    ]);
    expect(captures.filter(({ name }) => name === 'comment').map(({ node }) => node.text)).toEqual([
      '// ordinary comment',
    ]);
    expect(
      captures.some(({ name, node }) => name === 'string.escape' && node.parent?.type === 'multiline_string')
    ).toBe(false);
    for (const delimiter of delimiters) {
      expect(delimiter.parent?.type).toBe('multiline_string');
      expect(delimiter.startPosition.column).toBe(4);
      expect(delimiter.endIndex - delimiter.startIndex).toBe(2);
    }
    const html = execFileSync(
      fileURLToPath(new URL('../../script/tree-sitter', import.meta.url)),
      [
        'highlight',
        '--html',
        '--layout',
        'fragment',
        '--style',
        'minimal',
        fileURLToPath(new URL('../fixtures/multilineStrings.zig', import.meta.url)),
      ],
      { encoding: 'utf8' }
    );
    expect(html.split(String.raw`<span class='string special'>\\</span>`)).toHaveLength(5);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each(['\n', '\r\n'])('keeps empty multiline bodies and %j line endings outside content nodes', (newline) => {
  const source = ['const text =', String.raw`    \\`, String.raw`    \\tail`, ';'].join(newline);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const literal = tree.rootNode.descendantsOfType('multiline_string')[0]!;
    expect(literal.namedChildren.map((node) => node.text)).toEqual(['tail']);
    const delimiters = highlights.captures(tree.rootNode).filter(({ name }) => name === 'string.special.symbol');
    expect(delimiters.map(({ node }) => node.text)).toEqual([String.raw`\\`, String.raw`\\`]);
    expect(delimiters.map(({ node }) => node.startPosition)).toEqual([
      { row: 1, column: 4 },
      { row: 2, column: 4 },
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('agrees with fresh parsing when a multiline delimiter is damaged and restored', () => {
  const delimiter = String.raw`\\`;
  const source = `const text =\n    ${delimiter}body\n;\n`;
  const startIndex = source.indexOf(delimiter);
  const parser = new Parser();
  parser.setLanguage(language);
  let currentSource = source;
  let currentPrefix = delimiter;
  let tree = parser.parse(source)!;
  const initial = tree.rootNode.toString();
  try {
    for (const prefix of [delimiter.slice(1), `${delimiter}\\`, delimiter]) {
      const oldEndIndex = startIndex + currentPrefix.length;
      tree.edit(
        new Edit({
          startIndex,
          oldEndIndex,
          newEndIndex: startIndex + prefix.length,
          startPosition: { row: 1, column: 4 },
          oldEndPosition: { row: 1, column: 4 + currentPrefix.length },
          newEndPosition: { row: 1, column: 4 + prefix.length },
        })
      );
      currentSource = currentSource.slice(0, startIndex) + prefix + currentSource.slice(oldEndIndex);
      const incremental = parser.parse(currentSource, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(currentSource)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.hasError).toBe(prefix.length === 1);
        const delimiters = highlights.captures(tree.rootNode).filter(({ name }) => name === 'string.special.symbol');
        expect(delimiters.map(({ node }) => node.text)).toEqual(prefix.length === 1 ? [] : [delimiter]);
      } finally {
        fresh.delete();
      }
      currentPrefix = prefix;
    }
    expect(tree.rootNode.toString()).toBe(initial);
  } finally {
    tree.delete();
    parser.delete();
  }
});

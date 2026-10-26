import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);
const injections = new Query(language, readFileSync(new URL('../../queries/injections.scm', import.meta.url), 'utf8'));
const indents = new Query(language, readFileSync(new URL('../../queries/indents.scm', import.meta.url), 'utf8'));

afterAll(() => {
  indents.delete();
  injections.delete();
  parser.delete();
});

test('provides prefix-free Markdown ranges with line endings while leaving ordinary comments and strings separate', () => {
  const source = readFileSync(new URL('../fixtures/documentation.zig', import.meta.url), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const matches = injections.matches(tree.rootNode);
    const markdown = matches.filter((match) => match.setProperties?.['injection.language'] === 'markdown');
    expect(markdown).toHaveLength(9);
    const contents = markdown.flatMap((match) => {
      expect(match.setProperties).toHaveProperty('injection.combined');
      return match.captures.map(({ node }) => node);
    });
    expect(contents.map((node) => node.text).join('')).toBe(
      ' # Container\n\n A container with あ😀 documentation.\n # Record\n\n ```zig\n const answer = 42;\n ```\n Field documentation.\n'
    );
    for (const content of contents) {
      expect(content.startIndex).toBe(content.parent!.startIndex + 3);
      expect(content.endIndex).toBe(content.parent!.endIndex);
      expect(content.endPosition.column).toBe(0);
      expect(content.endIndex).toBeGreaterThan(content.startIndex);
    }
    expect(
      matches
        .filter((match) => match.setProperties?.['injection.language'] === 'comment')
        .flatMap((match) => match.captures.map(({ node }) => node.text))
    ).toEqual(['// ordinary comment', '//// four slashes are ordinary']);
    const ignored = indents
      .captures(tree.rootNode)
      .filter(({ name }) => name === 'indent.ignore')
      .map(({ node }) => node.text);
    expect(ignored).toEqual(expect.arrayContaining(contents.map((content) => content.parent!.text)));
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

test('updates documentation kinds and injection ranges consistently when comment prefixes are edited', () => {
  let source = '/// text\nconst value = 1;\n';
  let marker = '///';
  let tree = parser.parse(source)!;
  try {
    for (const next of ['////', '//!', '//', '///']) {
      tree.edit(
        new Edit({
          startIndex: 0,
          oldEndIndex: marker.length,
          newEndIndex: next.length,
          startPosition: { row: 0, column: 0 },
          oldEndPosition: { row: 0, column: marker.length },
          newEndPosition: { row: 0, column: next.length },
        })
      );
      source = next + source.slice(marker.length);
      const incremental = parser.parse(source, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(source)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.hasError).toBe(false);
        const contents = tree.rootNode.descendantsOfType('doc_comment_content');
        expect(contents.map((node) => node.text)).toEqual(next === '///' || next === '//!' ? [' text\n'] : []);
      } finally {
        fresh.delete();
      }
      marker = next;
    }
  } finally {
    tree.delete();
  }
});

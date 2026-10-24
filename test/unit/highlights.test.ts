import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
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

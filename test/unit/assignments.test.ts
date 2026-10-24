import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Edit, Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);
const highlights = new Query(language, readFileSync(new URL('../../queries/highlights.scm', import.meta.url), 'utf8'));

afterAll(() => {
  highlights.delete();
  parser.delete();
});

test('distinguishes initializer fields from assignments in statement positions', () => {
  const tree = parser.parse(readFileSync(new URL('../fixtures/assignments.zig', import.meta.url), 'utf8'))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const fields = tree.rootNode.descendantsOfType('field_initializer');
    expect(
      fields.map((field) => [field.childForFieldName('name')?.text, field.childForFieldName('value')?.text])
    ).toEqual([
      ['value', 'left'],
      ['@"escaped-name"', 'right'],
      ['nested', '.{ .count = other }'],
      ['count', 'other'],
    ]);
    for (const field of fields) {
      expect(field.descendantsOfType('assignment_expression')).toHaveLength(0);
    }
    const assignments = tree.rootNode.descendantsOfType('assignment_expression');
    expect(assignments.some((assignment) => assignment.text === 'left += 1')).toBe(true);
    expect(
      assignments.some(
        (assignment) =>
          assignment
            .childrenForFieldName('left')
            .map((node) => node.text)
            .join(',') === 'left,right'
      )
    ).toBe(true);
    for (const assignment of assignments) {
      expect(assignment.childForFieldName('operator')?.text).toBeDefined();
      expect(assignment.childForFieldName('right')?.text).toBeDefined();
    }
    const members = highlights
      .captures(tree.rootNode)
      .filter(({ name, node }) => name === 'variable.member' && node.parent?.type === 'field_initializer')
      .map(({ node }) => node.text);
    expect(members).toEqual(['value', '@"escaped-name"', 'nested', 'count']);
  } finally {
    tree.delete();
  }
});

test.each([
  ['parenthesized expression', 'const result = (left = right);'],
  ['variable initializer', 'const result = left = right;'],
  ['call argument', 'fn f() void { call(left = right); }'],
  ['if condition', 'fn f() void { if (left = right) {} }'],
  ['while condition', 'fn f() void { while (left = right) {} }'],
  ['returned expression', 'fn f() void { return (left = right); }'],
  ['chained assignment', 'fn f() void { left = right = 1; }'],
  ['field value', 'const result = .{ .field = left = right };'],
  ['switch destructuring', 'fn f() void { switch (left) { 0 => left, right = .{ 1, 2 }, else => {} } }'],
  ['continuation declaration', 'fn f() void { while (true) : (const left = 1) {} }'],
  ['deferred declaration', 'fn f() void { defer const left = 1; }'],
])('reports an invalid assignment in a %s', (_context, source) => {
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
  } finally {
    tree.delete();
  }
});

test('agrees with a fresh parse when an invalid field value is inserted and undone', () => {
  const source = 'const value = .{ .field = 1 };';
  const startIndex = source.indexOf('1');
  let currentSource = source;
  let currentValue = '1';
  let tree = parser.parse(source)!;
  const initialTree = tree.rootNode.toString();
  try {
    for (const value of ['left = right', '1']) {
      const oldEndIndex = startIndex + currentValue.length;
      const newEndIndex = startIndex + value.length;
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
      currentSource = currentSource.slice(0, startIndex) + value + currentSource.slice(oldEndIndex);
      const incremental = parser.parse(currentSource, tree)!;
      tree.delete();
      tree = incremental;
      const fresh = parser.parse(currentSource)!;
      try {
        expect(tree.rootNode.toString()).toBe(fresh.rootNode.toString());
        expect(tree.rootNode.hasError).toBe(value !== '1');
      } finally {
        fresh.delete();
      }
      currentValue = value;
    }
    expect(tree.rootNode.toString()).toBe(initialTree);
  } finally {
    tree.delete();
  }
});

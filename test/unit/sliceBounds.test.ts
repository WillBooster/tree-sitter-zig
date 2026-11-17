import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { afterAll, expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(fileURLToPath(new URL('../../tree-sitter-zig.wasm', import.meta.url)));
const parser = new Parser();
parser.setLanguage(language);
afterAll(() => parser.delete());

test.each([
  ['index', 'at:{break :at 0;}', ['at:'], undefined],
  ['start', 'first:{break :first 0;}..1', ['first:'], undefined],
  ['end', '0..last:{break :last 1;}', ['last:'], undefined],
  ['both bounds', 'first:{break :first 0;}..last:{break :last 1;}:0', ['first:', 'last:'], '0'],
  ['sentinel', '0..1:zero:{break :zero 0;}', ['zero:'], 'zero:{break :zero 0;}'],
])('keeps labeled blocks in a slice or index %s', (_context, index, labels, sentinel) => {
  const tree = parser.parse(`const result = values[${index}];`)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const access = tree.rootNode.descendantsOfType('index_expression')[0];
    assert.ok(access);
    expect(access.descendantsOfType('block_label').map((node) => node.text)).toEqual(labels);
    expect(access.childForFieldName('sentinel')?.text).toBe(sentinel);
    expect(access.childForFieldName('index')?.type).toBe(
      _context === 'index' ? 'labeled_type_expression' : 'range_expression'
    );
  } finally {
    tree.delete();
  }
});

test.each(['', 'comptime ', 'noalias '])('does not reinterpret a %sparameter name as a block label', (modifier) => {
  for (const body of ['break :a u8;', 'return;']) {
    const tree = parser.parse(`fn f(${modifier}a: {${body}}) void {}`)!;
    try {
      expect(tree.rootNode.hasError).toBe(true);
    } finally {
      tree.delete();
    }
  }
});

test.each([
  'fn f(value: named:{break :named u8;}) void {_=value;}',
  'extern fn g((unnamed:{break :unnamed u8;})) void;',
  'extern fn h([size:{break :size 2;}]u8) void;',
])('retains valid parameter type expression %s', (source) => {
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
  } finally {
    tree.delete();
  }
});

test.each(['fn f(@"quoted name":{return;}) void {}'])(
  'rejects a raw block after a quoted parameter name: %s',
  (source) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(true);
    } finally {
      tree.delete();
    }
  }
);

test.each([
  'fn f(value // comment\n: u8) void {_=value;}',
  'fn f(value: labeled:{break :labeled u8;}) void {_=value;}',
])('allows comments and labeled types after a parameter name: %s', (source) => {
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
  } finally {
    tree.delete();
  }
});

test.each([
  'const S=struct { mem: switch(os){else=>u8} };',
  'const S=union(enum) { mem: switch(os){else=>u8} };',
  'const S=opaque { mem: switch(os){else=>u8} };',
  'const S=struct { comptime mem: switch(os){else=>u8}=1 };',
  'const S=struct { mem: while(c){} else u8 };',
  'fn f(mem: switch(os){else=>u8}) void {}',
  'fn f(comptime mem: switch(os){else=>u8}) void {}',
  'const F=fn(mem: switch(os){else=>u8}) void;',
])('preserves declaration names before control flow types: %s', (source) => {
  const tree = parser.parse(source)!;
  try {
    if (!source.includes('while(c)')) expect(tree.rootNode.hasError).toBe(false);
    const declaration = tree.rootNode.descendantsOfType(['container_field', 'parameter'])[0];
    assert.ok(declaration);
    expect(declaration.childForFieldName('name')?.text).toBe('mem');
    expect(declaration.childForFieldName('type')).toBeDefined();
  } finally {
    tree.delete();
  }
});

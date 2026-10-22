import test from 'node:test';
import assert from 'node:assert/strict';
import { gilbertOrder, transformGilbert } from '../dist/gilbert.js';

test('matches the reference Gilbert traversal and golden-ratio mapping', () => {
  assert.deepEqual([...gilbertOrder(3, 2)], [0, 3, 4, 5, 2, 1]);
  assert.deepEqual([...gilbertOrder(2, 3)], [0, 1, 3, 5, 4, 2]);
  const source = Uint8Array.from({ length: 24 }, (_, i) => Math.floor(i / 4));
  const encrypted = transformGilbert(source, 3, 2);
  // N=6, shift=4: 0→2, 3→1, 4→0, 5→3, 2→4, 1→5.
  assert.deepEqual([...encrypted].filter((_, i) => i % 4 === 0), [4, 3, 0, 5, 2, 1]);
});

for (const [width, height] of [[1, 1], [1, 401], [503, 1], [17, 31], [31, 17], [1280, 1707]]) {
  test(`Gilbert ${width}×${height}: one-to-one and exact RGBA round trip`, () => {
    const order = gilbertOrder(width, height);
    assert.equal(new Set(order).size, width * height);
    assert.equal(order.reduce((n, v) => Math.max(n, v), 0), width * height - 1);
    const source = Uint8Array.from({ length: width * height * 4 }, (_, i) => (i * 73 ^ i >>> 3) & 255);
    const encrypted = transformGilbert(source, width, height);
    assert.deepEqual(transformGilbert(encrypted, width, height, true), source);
  });
}

test('rejects invalid dimensions and incorrect RGBA length', () => {
  assert.throws(() => gilbertOrder(0, 2), /尺寸/);
  assert.throws(() => gilbertOrder(12_000_001, 1), /尺寸/);
  assert.throws(() => transformGilbert(new Uint8Array(4), 3, 2), /像素/);
});

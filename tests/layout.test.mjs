// Geometrie moodboardu v aplikaci Focení (foceni/layout.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aspectOf, cropRect, layoutCollage, tapesFor } from '../layout.js';

test('poměr fotky odpovídá poměru fotek a orientaci', () => {
  assert.equal(aspectOf('3:2', 'l'), 1.5);
  assert.equal(aspectOf('3:2', 'p'), 2 / 3);
  assert.equal(aspectOf('1:1', 'p'), 1);
  assert.equal(aspectOf('neznámý', 'l'), 1.5, 'neznámý poměr spadne na 3:2');
});

test('ořez screenshotu má přesně poměr fotky a zůstane uvnitř obrázku', () => {
  for (const [w, h] of [[1170, 2532], [2532, 1170], [1000, 1000]]) {
    for (const aspect of [2 / 3, 1.5, 1, 16 / 9]) {
      for (const f of [0, 0.5, 1]) {
        const r = cropRect(w, h, aspect, f, f);
        assert.ok(Math.abs(r.sw / r.sh - aspect) < 1e-9, `poměr ${w}x${h} → ${aspect}`);
        assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= w + 1e-9 && r.sy + r.sh <= h + 1e-9);
      }
    }
  }
  const z = cropRect(1200, 1800, 2 / 3, 0.25, 0.75, 2);
  assert.deepEqual([z.sw, z.sh], [600, 900], 'přiblížení 2× vezme polovinu');
  assert.deepEqual([z.sx, z.sy], [150, 675], 'přiblížení drží bod výřezu na místě');
  const mid = cropRect(1170, 2532, 2 / 3);
  assert.equal(mid.sx, 0);
  assert.equal(mid.sy, (2532 - 1755) / 2, 'výchozí výřez je na střed');
});

const photos = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, orient: i % 3 ? 'p' : 'l' }));

test('koláž: každá fotka má poměr fotek, leží na desce a fotky desku pokryjí', () => {
  for (const format of ['16:9', '9:16', '4:5', '1:1']) {
    for (const n of [1, 2, 5, 12, 25]) {
      const items = photos(n);
      const { boxes, W, H } = layoutCollage(items, { format, ratio: '3:2', seed: 7 });
      assert.equal(boxes.length, n);
      let area = 0;
      for (const [i, b] of boxes.entries()) {
        assert.ok(Math.abs(b.w / b.h - aspectOf('3:2', items[i].orient)) < 1e-9, 'poměr fotky');
        assert.ok(b.cx - b.w / 2 >= -1e-9 && b.cx + b.w / 2 <= W + 1e-9, `${format} ${n}: vodorovně na desce`);
        assert.ok(b.cy - b.h / 2 >= -1e-9 && b.cy + b.h / 2 <= H + 1e-9, `${format} ${n}: svisle na desce`);
        assert.ok(Math.abs(b.rot) <= 8);
        area += b.w * b.h;
      }
      if (n >= 5) assert.ok(area > W * H * 0.5, `${format} ${n}: koláž je hustá (${(area / (W * H)).toFixed(2)})`);
      assert.deepEqual(boxes.map((b) => b.z).sort((a, b) => a - b), [...Array(n).keys()], 'každá fotka má své patro');
    }
  }
});

test('koláž je pro stejné semínko pořád stejná, zamíchání ji změní', () => {
  const a = layoutCollage(photos(8), { seed: 1 });
  assert.deepEqual(a, layoutCollage(photos(8), { seed: 1 }));
  assert.notDeepEqual(a.boxes.map((b) => b.cx), layoutCollage(photos(8), { seed: 2 }).boxes.map((b) => b.cx));
});

test('každá fotka je přilepená aspoň jedním kusem pásky', () => {
  const { boxes, short } = layoutCollage(photos(30), { seed: 3 });
  const kinds = new Set();
  for (const b of boxes) {
    const tapes = tapesFor(b, short);
    assert.ok(tapes.length >= 1);
    for (const t of tapes) kinds.add(t.kind);
  }
  assert.deepEqual([...kinds].sort(), ['clear', 'masking'], 'krepová i průhledná páska');
});

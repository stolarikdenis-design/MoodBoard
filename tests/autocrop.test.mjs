// Automatický ořez screenshotu na samotnou fotku (autocrop.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPhotoRect } from '../autocrop.js';

// Syntetický screenshot: pozadí aplikace, řádky „textu“ a fotka s šumem.
function screenshot({ w = 120, h = 260, bg = [255, 255, 255], photo = { x: 0, y: 40, w: 120, h: 150 }, text = true, band = null } = {}) {
  const d = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = bg;
      const inPhoto = x >= photo.x && x < photo.x + photo.w && y >= photo.y && y < photo.y + photo.h;
      if (inPhoto) c = band && y >= band[0] && y < band[1] ? bg : [60 + rnd() * 150, 40 + rnd() * 120, 30 + rnd() * 100];
      else if (text && (y % 12 < 3) && x % 9 < 3 && x > 6 && x < w * 0.7) c = [30, 30, 30]; // písmenka
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  return d;
}

const close = (a, b, tol = 3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('najde fotku mezi lištami a textem Instagramu (bílý režim)', () => {
  const photo = { x: 0, y: 40, w: 120, h: 150 };
  const r = detectPhotoRect(screenshot({ photo }), 120, 260);
  close(r.x, 0); close(r.y, 40); close(r.w, 120); close(r.h, 150);
});

test('najde fotku s okraji na Pinterestu i v tmavém režimu', () => {
  const photo = { x: 14, y: 60, w: 90, h: 120 };
  const r = detectPhotoRect(screenshot({ photo, bg: [12, 12, 12] }), 120, 260);
  close(r.x, 14); close(r.y, 60); close(r.w, 90); close(r.h, 120);
});

test('obrázek, který je celý fotkou, nechá být', () => {
  const r = detectPhotoRect(screenshot({ photo: { x: 0, y: 0, w: 120, h: 260 }, text: false }), 120, 260);
  assert.deepEqual(r, { x: 0, y: 0, w: 120, h: 260 });
});

test('screenshot jen s textem neořízne na nesmysl', () => {
  const r = detectPhotoRect(screenshot({ photo: { x: 0, y: 0, w: 0, h: 0 } }), 120, 260);
  assert.deepEqual(r, { x: 0, y: 0, w: 120, h: 260 });
});

test('černý pruh uvnitř fotky na černém Instagramu fotku nerozdělí', () => {
  const photo = { x: 0, y: 40, w: 120, h: 150 };
  const r = detectPhotoRect(screenshot({ photo, bg: [0, 0, 0], band: [90, 112] }), 120, 260);
  close(r.y, 40); close(r.h, 150);
});

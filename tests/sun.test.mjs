// Východ, západ a zlatá hodinka (sun.js). Porovnává se s astronomickými tabulkami.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, lightAt } from '../sun.js';

const utc = (d) => d.toISOString().slice(11, 16);
const near = (date, hhmm, tol = 4) => {
  const [h, m] = hhmm.split(':').map(Number);
  const diff = Math.abs(date.getUTCHours() * 60 + date.getUTCMinutes() - (h * 60 + m));
  assert.ok(diff <= tol, `${utc(date)} UTC ≈ ${hhmm} UTC`);
};

test('Pardubice 2. 11. 2026: východ kolem 6:47 a západ kolem 16:32 SEČ', () => {
  const t = sunTimes('2026-11-02', 50.0343, 15.7812);
  near(t.sunrise, '05:47');
  near(t.sunset, '15:32');
  assert.ok(t.goldenEvening[0] < t.sunset && t.sunset < t.goldenEvening[1], 'západ je uvnitř zlaté hodinky');
  assert.ok(t.blueEvening[0] >= t.goldenEvening[1], 'modrá hodinka je po zlaté');
});

test('Praha o letním slunovratu: východ kolem 4:52 a západ kolem 21:13 SELČ', () => {
  const t = sunTimes('2026-06-21', 50.0755, 14.4378);
  near(t.sunrise, '02:52');
  near(t.sunset, '19:13');
});

test('za polárním kruhem v zimě slunce nevyjde', () => {
  const t = sunTimes('2026-12-21', 78.22, 15.65);
  assert.equal(t.sunrise, null);
  assert.equal(t.sunset, null);
});

test('čas focení: ve zlaté hodince, přes den, v noci', () => {
  const t = sunTimes('2026-11-02', 50.0343, 15.7812);
  const golden = new Date(t.goldenEvening[0].valueOf() + 90000);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  assert.equal(lightAt(t, '2026-11-02', hhmm(golden)), 'golden');
  assert.equal(lightAt(t, '2026-11-02', null), null);
  assert.equal(lightAt(t, '2026-11-02', '23:30'), 'night');
});

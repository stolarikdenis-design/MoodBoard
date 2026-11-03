// Odpověď vložená z appky Claude se přečte i z bloku kódu a nesmysly zahodí (ai.js: parsePlanText).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanText, manualPrompt } from '../ai.js';

test('přečte JSON z odpovědi i s textem a blokem kódu okolo', () => {
  const plan = parsePlanText('Tady je plán:\n```json\n{"mood":"Temná","light":"Z boku","colors":"Červená","poses":[{"title":"Zády","how":"Stojí zády","photo":2,"props":["jablko"]}],"outfit":["Kalhoty"],"props":["Tyl"],"places":[{"name":"Ateliér","why":"Tma","saved":true}],"watch":["Text"]}\n```\nHodně štěstí!');
  assert.equal(plan.poses[0].title, 'Zády');
  assert.equal(plan.poses[0].photo, 2);
  assert.deepEqual(plan.props, ['Tyl']);
  assert.equal(plan.places[0].saved, true);
});

test('chybějící a špatné hodnoty nahradí prázdnými, bez JSONu ohlásí chybu', () => {
  const plan = parsePlanText('{"poses":[{"title":"A","photo":"x"},{"how":"bez názvu"}],"places":"nic"}');
  assert.equal(plan.poses.length, 1);
  assert.equal(plan.poses[0].photo, 0);
  assert.deepEqual(plan.places, []);
  assert.equal(plan.mood, '');
  assert.throws(() => parsePlanText('Promiň, nevím.'), /JSON/);
});

test('zadání pro appku Claude obsahuje inventář, lokality a tvar odpovědi', () => {
  const t = manualPrompt({ shoot: { title: 'Jirka' }, props: [{ name: 'Bílý tyl' }], places: [{ name: 'Ateliér 3xl', note: 'tma' }], count: 3 });
  assert.match(t, /Bílý tyl/);
  assert.match(t, /Ateliér 3xl/);
  assert.match(t, /1–3/);
  assert.match(t, /"poses"/);
});

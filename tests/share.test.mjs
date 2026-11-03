// Událost do kalendáře a zpráva pro modelku (share.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsFor, modelMessage } from '../share.js';

const shoot = {
  id: 'abc', title: 'Jirka Aťas', model: 'Jirka Pytlík', date: '2026-11-02', time: '16:00',
  poses: [{ text: 'Zády s nápisem' }], outfit: [{ text: 'Černé kalhoty' }, { text: 'Rukavice' }],
  bring: [{ text: 'Baterie', done: true }, { text: 'Tyl, bílý; 3 m', done: false }],
  ai: { mood: 'Temné portréty v rudém světle.' },
};
const place = { name: 'Ateliér 3xl', lat: 49.757, lng: 16.46 };

test('kalendář: začátek v čase focení, dvě hodiny, místo, připomenutí a escapování', () => {
  const ics = icsFor(shoot, place, { now: new Date(Date.UTC(2026, 10, 1, 8, 0)) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261102T160000\r\n/);
  assert.match(ics, /DTEND:20261102T180000\r\n/);
  assert.match(ics, /SUMMARY:Focení: Jirka Aťas/);
  assert.match(ics, /LOCATION:Ateliér 3xl/);
  assert.match(ics, /GEO:49\.757000;16\.460000/);
  assert.match(ics, /TRIGGER:-PT2H/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /S sebou: Tyl\\, bílý\\; 3 m/, 'čárka a středník escapované, odškrtnuté věci chybí');
  assert.ok(!unfolded.includes('Baterie'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `řádek moc dlouhý: ${line}`);
});

test('kalendář: bez času celodenní, bez data nic', () => {
  const ics = icsFor({ ...shoot, time: '' }, null);
  assert.match(ics, /DTSTART;VALUE=DATE:20261102/);
  assert.match(ics, /DTEND;VALUE=DATE:20261103/);
  assert.equal(icsFor({ ...shoot, date: '' }, place), null);
});

test('zpráva pro modelku: oslovení, termín, místo s mapou, nálada, oblečení', () => {
  const t = modelMessage(shoot, place);
  assert.match(t, /^Ahoj Jirka!/);
  assert.match(t, /Kdy: .*2\. listopadu 2026 v 16:00/);
  assert.match(t, /Kde: Ateliér 3xl\nhttps:\/\/mapy\.cz/);
  assert.match(t, /Nálada: Temné/);
  assert.match(t, /– Černé kalhoty\n– Rukavice/);
  assert.ok(!t.includes('Baterie'), 'věci s sebou jsou jen pro fotografa');
});

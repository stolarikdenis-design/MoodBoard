// Focení ven z appky: událost do kalendáře (.ics) a zpráva pro modelku.

const pad = (n) => String(n).padStart(2, '0');
const esc = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const czDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
export const mapLink = (p) => `https://mapy.cz/zakladni?source=coor&id=${p.lng},${p.lat}&x=${p.lng}&y=${p.lat}&z=16`;

// Řádky iCalendaru se zalamují po 75 bajtech (RFC 5545), pokračování začíná mezerou.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Událost do kalendáře. Bez data vrátí null; bez času celodenní. Délka 2 hodiny. */
export function icsFor(shoot, place, { now = new Date(), hours = 2 } = {}) {
  if (!shoot.date) return null;
  const [y, m, d] = shoot.date.split('-').map(Number);
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  let start;
  let end;
  if (shoot.time) {
    const [hh, mm] = shoot.time.split(':').map(Number);
    const s = new Date(y, m - 1, d, hh, mm);
    const e = new Date(s.valueOf() + hours * 3600000);
    const local = (t) => `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
    start = `DTSTART:${local(s)}`;
    end = `DTEND:${local(e)}`;
  } else {
    const next = new Date(y, m - 1, d + 1);
    start = `DTSTART;VALUE=DATE:${y}${pad(m)}${pad(d)}`;
    end = `DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
  }
  const desc = [
    shoot.model && `Model: ${shoot.model}`,
    shoot.poses?.length && `Pózy: ${shoot.poses.map((p) => p.text).join(', ')}`,
    shoot.outfit?.length && `Oblečení: ${shoot.outfit.map((p) => p.text).join(', ')}`,
    shoot.bring?.filter((b) => !b.done).length && `S sebou: ${shoot.bring.filter((b) => !b.done).map((b) => b.text).join(', ')}`,
    place && mapLink(place),
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MoodBoard//Foceni//CS', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${shoot.id}@moodboard`, `DTSTAMP:${stamp}`, start, end,
    `SUMMARY:${esc(`Focení: ${shoot.title || 'bez názvu'}`)}`,
    place && `LOCATION:${esc(place.name)}`,
    place && `GEO:${place.lat.toFixed(6)};${place.lng.toFixed(6)}`,
    desc && `DESCRIPTION:${esc(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Focení', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Zpráva pro modelku: kdy, kde, nálada a co si vzít na sebe. */
export function modelMessage(shoot, place) {
  const outfit = (shoot.outfit ?? []).map((o) => `– ${o.text}`);
  return [
    `Ahoj${shoot.model ? ` ${shoot.model.split(' ')[0]}` : ''}! Posílám plán focení „${shoot.title || 'focení'}“.`,
    '',
    shoot.date && `Kdy: ${czDate(shoot.date)}${shoot.time ? ` v ${shoot.time}` : ''}`,
    place && `Kde: ${place.name}\n${mapLink(place)}`,
    shoot.ai?.mood && `\nNálada: ${shoot.ai.mood}`,
    outfit.length && `\nCo na sebe:\n${outfit.join('\n')}`,
    '\nMoodboard je v příloze. Kdyby něco, napiš.',
  ].filter((l) => typeof l === 'string').join('\n');
}

// Poloha slunce pro den a místo focení: východ, západ, zlatá a modrá hodinka.
// Výpočet přímo v telefonu (astronomický vzorec pro východ slunce), bez internetu.

const rad = Math.PI / 180;
const DAY = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const obliquity = rad * 23.4397;

const toDays = (date) => date.valueOf() / DAY - 0.5 + J1970 - J2000;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY);
const meanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const declination = (L) => Math.asin(Math.sin(obliquity) * Math.sin(L));
const transit = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/**
 * Časy pro den `day` ('YYYY-MM-DD') na souřadnicích lat/lng.
 * Výsledek jsou Date (null, když slunce danou výšku ten den nemá, třeba za polárním kruhem).
 */
export function sunTimes(day, lat, lng) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const lw = rad * -lng;
  const phi = rad * lat;
  const days = toDays(date);
  const n = Math.round(days - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = meanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const noon = transit(ds, M, L);
  // Časy, kdy je slunce ve výšce h (ve stupních) ráno a večer.
  const at = (h) => {
    const cos = (Math.sin(h * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cos < -1 || cos > 1) return [null, null];
    const w = Math.acos(cos);
    const set = transit(J0 + (w + lw) / (2 * Math.PI) + n, M, L);
    return [fromJulian(noon - (set - noon)), fromJulian(set)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [goldenAmEnd, goldenPmStart] = at(6);
  const [blueAmStart, blueStart] = at(-6);
  const [blueAmEnd, blueEnd] = at(-4);
  return {
    noon: fromJulian(noon),
    sunrise, sunset,
    // Zlatá hodinka: slunce mezi -4° a 6° nad obzorem; modrá: mezi -6° a -4°.
    goldenMorning: [blueAmEnd, goldenAmEnd],
    goldenEvening: [goldenPmStart, blueEnd],
    blueMorning: [blueAmStart, blueAmEnd],
    blueEvening: [blueEnd, blueStart],
  };
}

/** Do kterého světla padne čas focení ('HH:MM'). */
export function lightAt(times, day, hhmm) {
  if (!hhmm) return null;
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm).valueOf();
  const inside = ([a, b]) => a && b && t >= a.valueOf() && t <= b.valueOf();
  if (inside(times.goldenMorning) || inside(times.goldenEvening)) return 'golden';
  if (inside(times.blueMorning) || inside(times.blueEvening)) return 'blue';
  if (times.sunrise && times.sunset && t > times.sunrise.valueOf() && t < times.sunset.valueOf()) return 'day';
  return 'night';
}

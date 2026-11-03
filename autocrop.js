// Najde ve screenshotu (Instagram, Pinterest, web) samotnou fotku a vrátí její obdélník.
// Bez DOM: pracuje s RGBA polem, takže jde testovat v Node.

const near = (d, i, c, tol) => Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;

/** Nejčastější barva na okrajích obrázku = pozadí aplikace (bílá, černá, šedá). */
function borderColor(d, w, h) {
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) add(x, y);
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) add(x, y);
  let best = 0;
  let key = 0;
  for (const [k, n] of counts) if (n > best) [best, key] = [n, k];
  return [((key >> 8) & 15) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
}

/** Nejdelší úsek indexů s hodnotou nad prahem; mezery do `gap` se přemostí. */
function longestRun(values, threshold, gap) {
  let best = null;
  let start = -1;
  let lastHit = -1;
  for (let i = 0; i <= values.length; i++) {
    const hit = i < values.length && values[i] >= threshold;
    if (hit) {
      if (start < 0 || i - lastHit > gap + 1) start = i;
      lastHit = i;
      if (!best || lastHit - start > best[1] - best[0]) best = [start, lastHit];
    }
  }
  return best;
}

/**
 * Rozšíří jádro fotky přes pruh, který splývá s pozadím (černé nebo bílé plochy uvnitř fotky),
 * ale jen když za ním do `gap` pokračuje hustý obraz. Řádky textu tak husté nebývají.
 */
function grow(values, run, gap) {
  if (!run) return run;
  let [a, b] = run;
  const dense = (i) => values[i] >= 0.6;
  const minLen = Math.max(2, Math.round(values.length * 0.015));
  const stretch = (from, dir) => {
    for (let i = from + dir, seen = 0; Math.abs(i - from) <= gap && i >= 0 && i < values.length; i += dir) {
      seen = dense(i) ? seen + 1 : 0;
      if (seen >= minLen) {
        // Za pruhem pokračuje fotka: přidej ji celou.
        let j = i;
        while (j + dir >= 0 && j + dir < values.length && values[j + dir] >= 0.45) j += dir;
        return j;
      }
    }
    return null;
  };
  for (let next; (next = stretch(b, 1)) !== null;) b = next;
  for (let next; (next = stretch(a, -1)) !== null;) a = next;
  return [a, b];
}

/**
 * Obdélník fotky ve screenshotu v pixelech {x, y, w, h}.
 * Když fotku nenajde (nebo screenshot už je jen fotka), vrátí celý obrázek.
 */
export function detectPhotoRect(data, w, h) {
  const full = { x: 0, y: 0, w, h };
  if (w < 16 || h < 16) return full;
  const bg = borderColor(data, w, h);
  const tol = 22;
  // Pixel patří fotce, když se liší od pozadí aplikace.
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = near(data, p * 4, bg, tol) ? 0 : 1;

  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += mask[y * w + x];
    rows[y] = s / w;
  }
  // Řádky s textem mají obsahu málo, řádky fotky hodně.
  const r = grow(rows, longestRun(rows, 0.45, Math.round(h * 0.02)), Math.round(h * 0.1));
  if (!r) return full;
  const [y0, y1] = r;
  const cols = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = y0; y <= y1; y++) s += mask[y * w + x];
    cols[x] = s / (y1 - y0 + 1);
  }
  const c = grow(cols, longestRun(cols, 0.45, Math.round(w * 0.02)), Math.round(w * 0.1));
  if (!c) return full;
  const [x0, x1] = c;
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const area = (rect.w * rect.h) / (w * h);
  // Moc malý nález je spíš ikona nebo tlačítko; skoro celý obrázek = nic k ořezání.
  if (area < 0.12 || area > 0.97 || rect.w < w * 0.3) return full;
  return rect;
}

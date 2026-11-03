// Čistá geometrie moodboardu: poměr fotek, ořez a koláž. Bez DOM, aby šla testovat v Node.
// Souřadnice koláže jsou normalizované: šířka desky = 1, výška = 1 / poměr desky.

// Poměr stran fotek z foťáku (delší : kratší strana).
export const RATIOS = {
  '3:2': [3, 2],
  '4:3': [4, 3],
  '5:4': [5, 4],
  '16:9': [16, 9],
  '1:1': [1, 1],
};

// Formát celé desky (šířka : výška).
export const FORMATS = {
  '16:9': { label: 'Na šířku 16:9', aspect: 16 / 9 },
  '9:16': { label: 'Story 9:16', aspect: 9 / 16 },
  '4:5': { label: 'Příspěvek 4:5', aspect: 4 / 5 },
  '1:1': { label: 'Čtverec 1:1', aspect: 1 },
};

/** Šířka / výška snímku pro poměr fotek a orientaci fotky ('p' na výšku, 'l' na šířku). */
export function aspectOf(ratio, orient) {
  const [a, b] = RATIOS[ratio] ?? RATIOS['3:2'];
  return orient === 'l' ? a / b : b / a;
}

export const formatAspect = (format) => (FORMATS[format] ?? FORMATS['16:9']).aspect;

/**
 * Výřez zdroje se stejnou logikou jako CSS object-fit: cover + object-position.
 * fx, fy jsou 0..1 (0,5 = střed).
 */
export function cropRect(imgW, imgH, aspect, fx = 0.5, fy = 0.5) {
  const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
  let sw = imgW;
  let sh = imgW / aspect;
  if (sh > imgH) {
    sh = imgH;
    sw = imgH * aspect;
  }
  return { sx: (imgW - sw) * clamp(fx), sy: (imgH - sh) * clamp(fy), sw, sh };
}

/** Stabilní pseudonáhoda ze semínka. */
export function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// Rozdělí obdélník na n buněk (střídavě podle delší strany, s náhodným poměrem), takže fotky mají různé velikosti.
function partition(rect, n, rnd, out) {
  if (n <= 1) {
    out.push(rect);
    return;
  }
  const n1 = n === 2 ? 1 : Math.max(1, Math.min(n - 1, Math.round(n * (0.35 + rnd() * 0.3))));
  const t = (n1 / n) * (0.88 + rnd() * 0.24);
  if (rect.w >= rect.h) {
    const w1 = rect.w * t;
    partition({ x: rect.x, y: rect.y, w: w1, h: rect.h }, n1, rnd, out);
    partition({ x: rect.x + w1, y: rect.y, w: rect.w - w1, h: rect.h }, n - n1, rnd, out);
  } else {
    const h1 = rect.h * t;
    partition({ x: rect.x, y: rect.y, w: rect.w, h: h1 }, n1, rnd, out);
    partition({ x: rect.x, y: rect.y + h1, w: rect.w, h: rect.h - h1 }, n - n1, rnd, out);
  }
}

const TAPES = ['masking-corners', 'masking-top', 'clear-side', 'clear-corners', 'masking-corners', 'clear-top'];

/**
 * Koláž: fotky se přes sebe překrývají, mají různé velikosti a náklon, každá je nalepená jinak.
 * Vrací boxy {id, cx, cy, w, h, rot, z, tape, sticker} a rozměry desky.
 */
export function layoutCollage(items, { format = '16:9', ratio = '3:2', seed = 0 } = {}) {
  const W = 1;
  const H = 1 / formatAspect(format);
  const short = Math.min(W, H);
  const pad = short * 0.07;
  const rnd = seeded(`${seed}:${items.length}`);
  const cells = [];
  partition({ x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 }, items.length, rnd, cells);
  // Buňky zamíchat, ať první fotka není pokaždé vlevo nahoře.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const order = items.map((_, i) => i).sort(() => rnd() - 0.5);

  const boxes = items.map((item, i) => {
    const c = cells[i];
    const a = aspectOf(ratio, item.orient);
    // Fotka se do buňky vejde celá a pak se zvětší, aby přesahovala k sousedům.
    let w = c.w;
    let h = c.w / a;
    if (h > c.h) {
      h = c.h;
      w = c.h * a;
    }
    const grow = 1.16 + rnd() * 0.2;
    w *= grow;
    h *= grow;
    // Nikdy větší než deska (s okrajem) a u víc fotek nejvýš 0,92 kratší strany.
    const k = Math.min(1, (W - pad * 0.5) / w, (H - pad * 0.5) / h, items.length > 1 ? (short * 0.92) / Math.max(w, h) : 1);
    w *= k;
    h *= k;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const cx = clamp(c.x + c.w / 2 + (rnd() - 0.5) * c.w * 0.26, w / 2 + pad * 0.25, W - w / 2 - pad * 0.25);
    const cy = clamp(c.y + c.h / 2 + (rnd() - 0.5) * c.h * 0.26, h / 2 + pad * 0.25, H - h / 2 - pad * 0.25);
    const tilt = rnd();
    const rot = tilt < 0.3 ? (rnd() - 0.5) * 2 : (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 5);
    return {
      id: item.id,
      cx: Number.isFinite(cx) ? cx : W / 2,
      cy: Number.isFinite(cy) ? cy : H / 2,
      w,
      h,
      rot,
      z: order.indexOf(i),
      tape: TAPES[Math.floor(rnd() * TAPES.length)],
      sticker: items.length >= 4 && rnd() < 0.14,
      cross: rnd() < 0.08,
      seed: `${seed}:${item.id}`,
    };
  });
  return { boxes, W, H, short };
}

/**
 * Kusy pásky pro fotku v souřadnicích fotky (0,0 = levý horní roh nenatočené fotky).
 * Délky jsou v jednotkách desky, takže páska je všude stejně velká.
 */
export function tapesFor(box, short) {
  const rnd = seeded(`${box.seed}-tape`);
  const len = short * (0.13 + rnd() * 0.04);
  const th = short * (0.035 + rnd() * 0.008);
  const { w, h } = box;
  const j = () => (rnd() - 0.5) * 10;
  const t = (kind, cx, cy, rot, l = len) => ({ kind, cx, cy, len: l, th, rot });
  let out;
  switch (box.tape) {
    case 'masking-top':
      out = [t('masking', w / 2 + (rnd() - 0.5) * w * 0.3, 0, j())];
      break;
    case 'clear-side': {
      const left = rnd() < 0.5;
      out = [t('clear', left ? 0 : w, h * (0.3 + rnd() * 0.4), 90 + j(), len * 1.1)];
      break;
    }
    case 'clear-corners':
      out = [t('clear', 0, 0, -45 + j()), t('clear', w, h, -45 + j())];
      break;
    case 'clear-top':
      out = [t('clear', w / 2, 0, j(), len * 1.2)];
      break;
    default:
      out = [t('masking', 0, 0, -45 + j()), t('masking', w, 0, 45 + j())];
  }
  if (box.cross) {
    const cx = rnd() < 0.5 ? 0 : w;
    const cy = h * (0.55 + rnd() * 0.4);
    out.push(t('masking', cx, cy, 45, len * 1.1), t('masking', cx, cy, -45, len * 1.1));
  }
  return out;
}

// Moodboard: koláž na obrazovce (DOM) i v exportu (canvas). Obojí z jednoho rozložení a stejných textur pásky.
import { aspectOf, cropRect, formatAspect, layoutCollage, layoutGrid, seeded, tapesFor } from './layout.js';
import { imageUrl } from './db.js';

const TYPE = '"Inter", system-ui, sans-serif';

// ---------- Textury pásky (generované jednou, stejné pro DOM i export) ----------

const TEX_W = 420;
const TEX_H = 120;

function tornPath(g, rnd, w, h, rough) {
  const teeth = 9;
  g.beginPath();
  g.moveTo(rnd() * rough, 0);
  for (let i = 1; i <= 10; i++) g.lineTo((w * i) / 10, (rnd() - 0.5) * 2);
  for (let i = 0; i <= teeth; i++) g.lineTo(w - rnd() * rough, (h * i) / teeth);
  for (let i = 10; i >= 0; i--) g.lineTo((w * i) / 10, h + (rnd() - 0.5) * 2);
  for (let i = teeth; i >= 0; i--) g.lineTo(rnd() * rough, (h * i) / teeth);
  g.closePath();
}

function maskingTexture(seed) {
  const rnd = seeded(`masking-${seed}`);
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  tornPath(g, rnd, TEX_W, TEX_H, 14);
  g.save();
  g.clip();
  g.fillStyle = 'rgba(247, 246, 241, 0.94)';
  g.fillRect(0, 0, TEX_W, TEX_H);
  // Krepová vlákna a zmačkání.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * TEX_W;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.6)';
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (rnd() - 0.5) * 30, TEX_H * 0.3, x + (rnd() - 0.5) * 30, TEX_H * 0.7, x + (rnd() - 0.5) * 24, TEX_H);
    g.stroke();
  }
  const shade = g.createLinearGradient(0, 0, 0, TEX_H);
  shade.addColorStop(0, 'rgba(255,255,255,0.25)');
  shade.addColorStop(1, 'rgba(0,0,0,0.05)');
  g.fillStyle = shade;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.restore();
  const d = g.getImageData(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function clearTexture(seed) {
  const rnd = seeded(`clear-${seed}`);
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  tornPath(g, rnd, TEX_W, TEX_H, 6);
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255, 255, 255, 0.14)';
  g.fillRect(0, 0, TEX_W, TEX_H);
  // Lesklé pruhy po délce a záhyby napříč.
  for (let i = 0; i < 7; i++) {
    const y = rnd() * TEX_H;
    g.strokeStyle = `rgba(255,255,255,${0.15 + rnd() * 0.4})`;
    g.lineWidth = 0.8 + rnd() * 3;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(TEX_W * 0.3, y + (rnd() - 0.5) * 40, TEX_W * 0.7, y + (rnd() - 0.5) * 40, TEX_W, y + (rnd() - 0.5) * 30);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = rnd() * TEX_W;
    g.strokeStyle = `rgba(255,255,255,${0.3 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (rnd() - 0.5) * 60, TEX_H);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(-2, 1, TEX_W + 4, TEX_H - 2);
  g.strokeStyle = 'rgba(120,120,120,0.2)';
  g.lineWidth = 1;
  g.strokeRect(-2, 3, TEX_W + 4, TEX_H - 6);
  g.restore();
  return c;
}

let textures;
function tex(kind, seed) {
  textures ??= {
    masking: [0, 1, 2].map(maskingTexture),
    clear: [0, 1, 2].map(clearTexture),
  };
  textures.url ??= {
    masking: textures.masking.map((c) => c.toDataURL()),
    clear: textures.clear.map((c) => c.toDataURL()),
  };
  const i = Math.floor(seeded(seed)() * 3);
  return { canvas: textures[kind][i], url: textures.url[kind][i] };
}

// ---------- Společné ----------

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${day}. ${m}. ${y}`;
};

/** Text na pásce s názvem: název, model, datum. */
export function labelText(shoot) {
  return [shoot.title || 'bez názvu', shoot.model, fmtDate(shoot.date)].filter(Boolean).join('  ·  ');
}

/** Boxy seřazené podle patra; „navrch“ z editoru má přednost. */
function stack(shoot) {
  const items = shoot.board ?? [];
  const layout = layoutCollage(items, { format: shoot.format, ratio: shoot.ratio, seed: shoot.seed ?? 0 });
  const byId = new Map(items.map((it) => [it.id, it]));
  const boxes = layout.boxes
    .map((b) => ({ ...b, item: byId.get(b.id) }))
    .sort((a, b) => (a.item.top ?? 0) - (b.item.top ?? 0) || a.z - b.z);
  return { ...layout, boxes };
}

// Štítek s názvem v jednotkách desky (vlevo dole, šikmo).
const labelBox = (W, H, short) => ({ x: short * 0.05, y: H - short * 0.085, th: short * 0.07, rot: -2.5 });
const tapeSeed = (b, t) => `${b.seed}|${t.cx.toFixed(4)}|${t.rot.toFixed(2)}`;

// ---------- DOM ----------

function el(tag, cls, style) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (style) for (const [k, v] of Object.entries(style)) n.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v);
  return n;
}

/**
 * Vykreslí desku do kontejneru. onPick(id) se volá po klepnutí na fotku.
 * Vrací funkci, která vykreslení zruší.
 */
export function mountBoard(container, shoot, { onPick } = {}) {
  if (styleOf(shoot) === 'grid') return mountGrid(container, shoot, { onPick });
  const board = el('div', 'board');
  board.style.aspectRatio = String(formatAspect(shoot.format));
  container.replaceChildren(board);
  let last = 0;

  async function draw() {
    const S = board.clientWidth;
    if (!S || S === last) return;
    last = S;
    const { boxes, W, H, short } = stack(shoot);
    const px = (v) => `${(v * S).toFixed(2)}px`;
    const nodes = await Promise.all(boxes.map(async (b, i) => {
      const it = b.item;
      const photo = el('button', `photo${b.sticker ? ' sticker' : ''}`, {
        left: px(b.cx - b.w / 2), top: px(b.cy - b.h / 2), width: px(b.w), height: px(b.h),
        transform: `rotate(${b.rot}deg)`, zIndex: String(i + 1),
        '--border': px(short * 0.012),
      });
      photo.type = 'button';
      photo.dataset.id = it.id;
      photo.setAttribute('aria-label', `Fotka ${i + 1}`);
      const pos = `${(it.fx ?? 0.5) * 100}% ${(it.fy ?? 0.5) * 100}%`;
      const img = el('img', 'shot', { objectPosition: pos, transformOrigin: pos, transform: `scale(${it.zoom ?? 1})` });
      img.alt = '';
      img.draggable = false;
      img.src = await imageUrl(it.imageId);
      const clip = el('span', 'clip');
      clip.append(img);
      photo.append(clip);
      for (const t of tapesFor(b, short)) {
        const tape = el('img', `tape ${t.kind}`, {
          left: px(t.cx - t.len / 2), top: px(t.cy - t.th / 2), width: px(t.len), height: px(t.th),
          transform: `rotate(${t.rot}deg)`,
        });
        tape.alt = '';
        tape.src = tex(t.kind, tapeSeed(b, t)).url;
        photo.append(tape);
      }
      photo.addEventListener('click', () => onPick?.(it.id));
      return photo;
    }));

    const kids = [...nodes];
    if (!boxes.length) {
      const empty = el('p', 'board-empty');
      empty.textContent = 'Prázdná nástěnka. Přidej screenshoty.';
      kids.push(empty);
    }
    if (shoot.showLabel !== false) {
      const L = labelBox(W, H, short);
      const label = el('div', 'board-label', {
        left: px(L.x), top: px(L.y - L.th / 2), height: px(L.th), fontSize: px(L.th * 0.42),
        paddingInline: px(L.th * 0.45), transform: `rotate(${L.rot}deg)`, zIndex: String(boxes.length + 2),
        backgroundImage: `url(${tex('masking', 'label').url})`,
      });
      label.textContent = labelText(shoot);
      kids.push(label);
    }
    board.replaceChildren(...kids);
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(container);
  draw();
  return () => ro.disconnect();
}

// ---------- Export do obrázku ----------

const loadImg = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Vyrenderuje moodboard do PNG; delší strana má `long` pixelů. */
export async function renderBoardImage(shoot, { long = 2400 } = {}) {
  if (styleOf(shoot) === 'grid') return renderGridImage(shoot, { long });
  await document.fonts.load(`40px ${TYPE}`).catch(() => {});
  const aspect = formatAspect(shoot.format);
  const S = aspect >= 1 ? long : Math.round(long * aspect); // pixely na šířku desky
  const { boxes, W, H, short } = stack(shoot);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * S);
  canvas.height = Math.round(H * S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F5F4F1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const b of boxes) {
    const it = b.item;
    const src = await imageUrl(it.imageId);
    const img = src ? await loadImg(src).catch(() => null) : null;
    const w = b.w * S;
    const h = b.h * S;
    ctx.save();
    ctx.translate(b.cx * S, b.cy * S);
    ctx.rotate((b.rot * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2); // počátek v levém horním rohu fotky
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = S * 0.014;
    ctx.shadowOffsetY = S * 0.004;
    if (b.sticker) {
      const bw = short * 0.012 * S;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -bw, -bw, w + bw * 2, h + bw * 2, bw * 1.6);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ddd';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.shadowColor = 'transparent';
    if (img) {
      const r = cropRect(img.naturalWidth, img.naturalHeight, aspectOf(shoot.ratio, it.orient), it.fx, it.fy, it.zoom ?? 1);
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    }
    for (const t of tapesFor(b, short)) {
      ctx.save();
      ctx.translate(t.cx * S, t.cy * S);
      ctx.rotate((t.rot * Math.PI) / 180);
      ctx.shadowColor = t.kind === 'masking' ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = S * 0.003;
      ctx.shadowOffsetY = S * 0.0008;
      ctx.drawImage(tex(t.kind, tapeSeed(b, t)).canvas, (-t.len / 2) * S, (-t.th / 2) * S, t.len * S, t.th * S);
      ctx.restore();
    }
    ctx.restore();
  }

  if (shoot.showLabel !== false) {
    const L = labelBox(W, H, short);
    const text = labelText(shoot);
    ctx.save();
    ctx.font = `500 ${L.th * 0.4 * S}px ${TYPE}`;
    const tw = ctx.measureText(text).width + L.th * 0.9 * S;
    ctx.translate(L.x * S, L.y * S);
    ctx.rotate((L.rot * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = S * 0.003;
    ctx.drawImage(tex('masking', 'label').canvas, 0, (-L.th / 2) * S, tw, L.th * S);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#111111';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, L.th * 0.45 * S, 0);
    ctx.restore();
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ---------- Mřížka (kontaktní arch na tmavém panelu) ----------

export const styleOf = (shoot) => shoot.style ?? 'grid';
const GRID_BG = '#0E0E0E';
const LABEL_BG = '#1C1C1C';

/** Podtitulek štítku: model a datum. */
export function gridSubtitle(shoot) {
  return [shoot.model, fmtDate(shoot.date)].filter(Boolean).join(' · ');
}

function mountGrid(container, shoot, { onPick } = {}) {
  const board = el('div', 'board grid');
  container.replaceChildren(board);
  let last = 0;
  async function draw() {
    const S = board.clientWidth || container.clientWidth;
    if (!S || S === last) return;
    last = S;
    const items = shoot.board ?? [];
    const g = layoutGrid(items, { format: shoot.format, ratio: shoot.ratio });
    board.style.aspectRatio = String(g.W / g.H);
    board.style.borderRadius = `${(g.radius * S).toFixed(1)}px`;
    const px = (v) => `${(v * S).toFixed(2)}px`;
    const byId = new Map(items.map((it) => [it.id, it]));
    const nodes = await Promise.all(g.cells.map(async (c, i) => {
      const it = byId.get(c.id);
      const cell = el('button', 'cell', { left: px(c.x), top: px(c.y), width: px(c.w), height: px(c.h) });
      cell.type = 'button';
      cell.dataset.id = it.id;
      cell.setAttribute('aria-label', `Fotka ${i + 1}`);
      const pos = `${(it.fx ?? 0.5) * 100}% ${(it.fy ?? 0.5) * 100}%`;
      const img = el('img', 'shot', { objectPosition: pos, transformOrigin: pos, transform: `scale(${it.zoom ?? 1})` });
      img.alt = '';
      img.draggable = false;
      img.src = await imageUrl(it.imageId);
      cell.append(img);
      cell.addEventListener('click', () => onPick?.(it.id));
      return cell;
    }));
    const L = g.label;
    const label = el('div', 'grid-label', { left: px(L.x), top: px(L.y), width: px(L.w), height: px(L.h), padding: px(L.h * 0.06) });
    const t = el('strong', '', { fontSize: px(Math.min(L.h * 0.08, 0.04)) });
    t.textContent = shoot.title || 'Moodboard';
    const sub = el('span', '', { fontSize: px(Math.min(L.h * 0.047, 0.022)) });
    sub.textContent = gridSubtitle(shoot);
    label.append(t, sub);
    if (!items.length) {
      const empty = el('p', 'board-empty');
      empty.textContent = 'Prázdný moodboard. Přidej screenshoty.';
      nodes.push(empty);
    }
    board.replaceChildren(...nodes, label);
  }
  const ro = new ResizeObserver(() => draw());
  ro.observe(container);
  draw();
  return () => ro.disconnect();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function renderGridImage(shoot, { long = 2400 } = {}) {
  await document.fonts.load(`700 40px ${TYPE}`).catch(() => {});
  const items = shoot.board ?? [];
  const g = layoutGrid(items, { format: shoot.format, ratio: shoot.ratio });
  const S = g.W >= g.H ? long : Math.round(long * (g.W / g.H));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(g.W * S);
  canvas.height = Math.round(g.H * S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = GRID_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const c of g.cells) {
    const it = byId.get(c.id);
    const src = await imageUrl(it.imageId);
    const img = src ? await loadImg(src).catch(() => null) : null;
    if (!img) continue;
    const r = cropRect(img.naturalWidth, img.naturalHeight, g.cellAspect, it.fx, it.fy, it.zoom ?? 1);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, c.x * S, c.y * S, c.w * S, c.h * S);
  }
  const L = g.label;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(L.x * S, L.y * S, L.w * S, L.h * S);
  const padL = L.h * 0.06 * S;
  const tSize = Math.min(L.h * 0.08, 0.04) * S;
  const sSize = Math.min(L.h * 0.047, 0.022) * S;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${sSize}px ${TYPE}`;
  const subLines = wrapLines(ctx, gridSubtitle(shoot), L.w * S - padL * 2);
  ctx.font = `700 ${tSize}px ${TYPE}`;
  const titleLines = wrapLines(ctx, (shoot.title || 'Moodboard').toUpperCase(), L.w * S - padL * 2);
  let y = (L.y + L.h) * S - padL - subLines.length * sSize * 1.35;
  ctx.fillStyle = '#ffffff';
  for (const [i, line] of titleLines.entries()) ctx.fillText(line, L.x * S + padL, y - (titleLines.length - 1 - i) * tSize * 1.1 - sSize * 0.6);
  ctx.font = `400 ${sSize}px ${TYPE}`;
  ctx.fillStyle = '#A3A3A3';
  for (const [i, line] of subLines.entries()) ctx.fillText(line, L.x * S + padL, y + (i + 1) * sSize * 1.35);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Příprava focení z moodboardu: Claude se podívá na fotky a navrhne pózy, rekvizity, oblečení a místa.
// Volá se přímo z telefonu s vlastním API klíčem (uložený jen v tomhle zařízení).
import Anthropic from './lib/anthropic/sdk.js';

const KEY = 'foceni-api-key';
const QUALITY = 'foceni-quality';
export const MAX_PHOTOS = 20;

// Úsporně: Claude Haiku 5.5 a menší fotky (zlomek ceny). Nejlíp: Claude Opus 5.5.
export const QUALITIES = {
  saver: { label: 'Úsporně', note: 'Claude Haiku 5.5, asi 0,1 Kč za přípravu', model: 'claude-haiku-5-5', size: 768 },
  best: { label: 'Nejlíp', note: 'Claude Opus 5.5, asi 2–6 Kč za přípravu', model: 'claude-opus-5-5', size: 1024 },
};
export function getQuality() {
  try { return QUALITIES[localStorage.getItem(QUALITY)] ? localStorage.getItem(QUALITY) : 'saver'; } catch { return 'saver'; }
}
export function setQuality(v) {
  try { localStorage.setItem(QUALITY, v); } catch { /* soukromý režim */ }
}

export function getApiKey() {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function setApiKey(v) {
  try {
    if (v) localStorage.setItem(KEY, v.trim());
    else localStorage.removeItem(KEY);
  } catch { /* soukromý režim */ }
}

// Struktura odpovědi (structured outputs): appka ji rovnou rozloží do plánu.
const list = (description) => ({ type: 'array', description, items: { type: 'string' } });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mood', 'light', 'colors', 'poses', 'outfit', 'props', 'places', 'watch'],
  properties: {
    mood: { type: 'string', description: 'Nálada a příběh focení, 1–2 věty.' },
    light: { type: 'string', description: 'Jaké světlo a kdy fotit (denní doba, směr, studio/ven).' },
    colors: { type: 'string', description: 'Barevnost a postprodukce (např. černobílá, teplé tóny).' },
    poses: {
      type: 'array',
      description: 'Pózy připravené podle moodboardu, v pořadí, v jakém je fotit.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'how', 'photo', 'props'],
        properties: {
          title: { type: 'string', description: 'Krátký název pózy (2–5 slov).' },
          how: { type: 'string', description: 'Jak ji navést modela: postoj, ruce, pohled, kompozice. 1–2 věty.' },
          photo: { type: 'integer', description: 'Číslo fotky z moodboardu, ze které póza vychází (1 = první), 0 když žádná.' },
          props: list('Rekvizity k póze.'),
        },
      },
    },
    outfit: list('Oblečení, boty, doplňky, vlasy a make-up, které sednou k moodboardu.'),
    props: list('Všechny rekvizity na focení. Z inventáře použij přesný název.'),
    places: {
      type: 'array',
      description: 'Vhodná místa: nejdřív uložené lokality, které sednou, pak typy míst, která hledat.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'saved'],
        properties: {
          name: { type: 'string', description: 'Název uložené lokality, nebo typ místa (např. „prázdná betonová chodba“).' },
          why: { type: 'string', description: 'Proč sedí k moodboardu, jedna věta.' },
          saved: { type: 'boolean', description: 'true = jde o uloženou lokalitu (name je přesně její název).' },
        },
      },
    },
    watch: list('Na co si dát během tohohle focení pozor (specifické k moodboardu).'),
  },
};

const SYSTEM = `Jsi zkušený asistent portrétního fotografa. Fotograf ti posílá moodboard ze screenshotů (inspirace z Instagramu, Pinterestu) a podle něj chystá focení.
Podívej se na fotky pozorně: póza, světlo, kompozice, oblečení, rekvizity, prostředí, barevnost. Navrhni konkrétní plán, který jde druhý den rovnou odfotit.
- Pózy piš tak, aby je fotograf mohl modelovi přečíst nahlas. Každá póza vychází z konkrétní fotky moodboardu, pokud to jde.
- Rekvizity: když věc je v inventáři, použij přesně její název. Jinak napiš, co sehnat.
- Místa: nejdřív vyber z uložených lokalit ty, které k moodboardu sedí (nebo žádnou), pak doplň 2–4 typy míst, která hledat.
- Piš česky, stručně, bez úvodů. Nevymýšlej si nic o modelovi, co není vidět nebo napsané.`;

async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Zmenší fotku na rozumnou velikost pro analýzu (delší strana `size` px). */
export async function shrinkForAi(blob, size = 1024) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
}

function contextText({ shoot, props, places, count, total }) {
  const lines = [
    `Focení: ${shoot.title || 'bez názvu'}`,
    shoot.model && `Model: ${shoot.model}`,
    shoot.date && `Datum: ${shoot.date}${shoot.time ? ` ${shoot.time}` : ''}`,
    shoot.notes && `Poznámky fotografa: ${shoot.notes}`,
    '',
    `Moodboard: ${count} fotek výše, očíslované 1–${count}${total > count ? ` (z celkem ${total}, posílám prvních ${count})` : ''}.`,
    '',
    props.length ? `Inventář (rekvizity, které fotograf má):\n${props.map((p) => `- ${p.name}${p.category ? ` [${p.category}]` : ''}${p.note ? ` – ${p.note}` : ''}`).join('\n')}` : 'Inventář je prázdný.',
    '',
    places.length ? `Uložené lokality:\n${places.map((p) => `- ${p.name}${p.note ? ` – ${p.note}` : ''}`).join('\n')}` : 'Žádné uložené lokality.',
  ];
  return lines.filter((l) => typeof l === 'string').join('\n');
}

/**
 * Pošle moodboard Claude a vrátí plán podle SCHEMA.
 * photos: [{blob}] v pořadí moodboardu.
 */
export async function planFromBoard({ apiKey, shoot, photos, props, places, quality = getQuality() }) {
  const q = QUALITIES[quality] ?? QUALITIES.saver;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const used = photos.slice(0, MAX_PHOTOS);
  const content = [];
  for (const [i, p] of used.entries()) {
    content.push({ type: 'text', text: `Fotka ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64(await shrinkForAi(p.blob, q.size)) } });
  }
  content.push({ type: 'text', text: contextText({ shoot, props, places, count: used.length, total: photos.length }) });

  const params = {
    model: q.model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: quality === 'best' ? 'medium' : 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  };
  // Opus má záložní model pro případ odmítnutí; Haiku ho nemá.
  const response = quality === 'best'
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params);
  if (response.stop_reason === 'refusal') throw new Error('Claude tenhle moodboard odmítl zpracovat.');
  if (response.stop_reason === 'max_tokens') throw new Error('Odpověď byla moc dlouhá. Zkus to s menším počtem fotek.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { plan: JSON.parse(text), used: used.length };
}

// ---------- Zdarma přes appku Claude (předplatné) ----------

const EXAMPLE = {
  mood: '…', light: '…', colors: '…',
  poses: [{ title: '…', how: '…', photo: 1, props: ['…'] }],
  outfit: ['…'], props: ['…'],
  places: [{ name: '…', why: '…', saved: false }],
  watch: ['…'],
};

/** Zadání, které se vloží do appky Claude spolu s fotkami. */
export function manualPrompt({ shoot, props, places, count }) {
  return `${SYSTEM}

${contextText({ shoot, props, places, count, total: count })}

Odpověz jen JSONem přesně v tomhle tvaru (bez dalšího textu), aby šel vložit zpátky do appky:
${JSON.stringify(EXAMPLE, null, 1)}
- photo = číslo fotky (podle pořadí příloh, 1 = první), 0 když žádná.
- saved = true jen u uložené lokality, name je pak přesně její název.`;
}

/** Přečte odpověď vloženou z appky Claude (JSON, klidně v bloku kódu). */
export function parsePlanText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('V textu není odpověď od Claude (chybí JSON).');
  const raw = JSON.parse(text.slice(start, end + 1));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    mood: str(raw.mood), light: str(raw.light), colors: str(raw.colors),
    poses: arr(raw.poses).map((p) => ({ title: str(p?.title), how: str(p?.how), photo: Number.isInteger(p?.photo) ? p.photo : 0, props: arr(p?.props).map(str).filter(Boolean) })).filter((p) => p.title),
    outfit: arr(raw.outfit).map(str).filter(Boolean),
    props: arr(raw.props).map(str).filter(Boolean),
    places: arr(raw.places).map((p) => ({ name: str(p?.name), why: str(p?.why), saved: p?.saved === true })).filter((p) => p.name),
    watch: arr(raw.watch).map(str).filter(Boolean),
  };
}

/** Srozumitelná chybová hláška pro telefon. */
export function errorMessage(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'API klíč nefunguje. Zkontroluj ho v nastavení.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Tenhle API klíč nemá k modelu přístup.';
  if (e instanceof Anthropic.RateLimitError) return 'Moc požadavků najednou. Zkus to za chvíli.';
  if (e instanceof Anthropic.BadRequestError) return `Požadavek se nepovedl: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Bez připojení k internetu to nejde.';
  if (e instanceof Anthropic.APIError) return `Chyba služby (${e.status ?? '?'}). Zkus to znovu.`;
  if (e instanceof SyntaxError) return 'Odpověď nešla přečíst. Zkus to znovu.';
  return e?.message || 'Něco se pokazilo.';
}

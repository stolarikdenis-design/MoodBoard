// Příprava focení z moodboardu: Claude se podívá na fotky a navrhne pózy, rekvizity, oblečení a místa.
// Volá se přímo z telefonu s vlastním API klíčem (uložený jen v tomhle zařízení).
import Anthropic from './lib/anthropic/sdk.js';

const KEY = 'foceni-api-key';
export const MAX_PHOTOS = 20;

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

/** Zmenší fotku na rozumnou velikost pro analýzu (delší strana 1024 px). */
export async function shrinkForAi(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
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
export async function planFromBoard({ apiKey, shoot, photos, props, places }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const used = photos.slice(0, MAX_PHOTOS);
  const content = [];
  for (const [i, p] of used.entries()) {
    content.push({ type: 'text', text: `Fotka ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64(await shrinkForAi(p.blob)) } });
  }
  content.push({ type: 'text', text: contextText({ shoot, props, places, count: used.length, total: photos.length }) });

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude tenhle moodboard odmítl zpracovat.');
  if (response.stop_reason === 'max_tokens') throw new Error('Odpověď byla moc dlouhá. Zkus to s menším počtem fotek.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { plan: JSON.parse(text), used: used.length };
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

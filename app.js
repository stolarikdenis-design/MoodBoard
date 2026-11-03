// Focení: plánovač focení pro Denise. Moodboard, plán, checklisty, inventář a lokality. Data jen v telefonu.
import * as db from './db.js';
import { mountBoard, renderBoardImage } from './board.js';
import { FORMATS, RATIOS, aspectOf } from './layout.js';

const L = window.L;
const HOME = [50.0343, 15.7812]; // Pardubice
const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
let cleanup = [];

// ---------- DOM pomocníci ----------

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) n.style.setProperty(sk.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), sv);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid);
  return n;
}

const ICONS = {
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  pin: 'M12 21s-6-5.6-6-11a6 6 0 1112 0c0 5.4-6 11-6 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 100 8 4 4 0 000-8z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M13 9.5C14 8 15 7 17 7h3M18 4l3 3-3 3M18 14l3 3-3 3',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

const iconBtn = (name, label, onclick, cls = '') => h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onclick }, icon(name));

function toast(text) {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

function setTop(title, { back, actions = [] } = {}) {
  topbar.replaceChildren(
    back ? iconBtn('back', 'Zpět', () => (location.hash = back)) : null,
    h('h1', {}, title),
    h('div', { class: 'top-actions' }, actions),
  );
}

function setNav(active) {
  for (const a of document.querySelectorAll('.tabs a')) a.toggleAttribute('aria-current', a.dataset.tab === active);
}

/** Spodní panel (dialog). Vrací {close}. */
function sheet(title, body, { onClose } = {}) {
  const dlg = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), iconBtn('close', 'Zavřít', () => dlg.close())),
    h('div', { class: 'sheet-body' }, body),
  );
  dlg.addEventListener('close', () => {
    onClose?.();
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
  return { close: () => dlg.close(), el: dlg };
}

function confirmSheet(text, yes) {
  const s = sheet(text, h('div', { class: 'row-actions' },
    h('button', { type: 'button', class: 'btn', onclick: () => s.close() }, 'Nechat'),
    h('button', { type: 'button', class: 'btn danger', onclick: () => { s.close(); yes(); } }, 'Smazat'),
  ));
}

function field(label, input) {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

// Fotka z galerie nebo foťáku, zmenšená na rozumnou velikost (screenshoty bývají obří).
async function shrink(file, max = 2048) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) return { blob: file, w: 1, h: 1 };
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  return { blob, w: c.width, h: c.height };
}

function pickFiles({ multiple = true, capture = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', multiple, class: 'sr-only' });
    if (capture) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);

const navLinks = (lat, lng) => h('div', { class: 'nav-links' },
  h('a', { class: 'btn small', href: `https://mapy.cz/zakladni?source=coor&id=${lng},${lat}&x=${lng}&y=${lat}&z=16`, target: '_blank', rel: 'noopener' }, 'Mapy.cz'),
  h('a', { class: 'btn small', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, target: '_blank', rel: 'noopener' }, 'Navigovat (Google)'),
);

// ---------- Mapa ----------

const pinIcon = () => L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 36], iconAnchor: [14, 34] });

function makeMap(node, { center = HOME, zoom = 11 } = {}) {
  const map = L.map(node, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  cleanup.push(() => map.remove());
  // Mapa v nově vloženém prvku potřebuje znát svou velikost.
  requestAnimationFrame(() => map.invalidateSize());
  return map;
}

function locateMe(map, onFound) {
  if (!navigator.geolocation) return toast('Telefon polohu neposkytuje.');
  toast('Hledám polohu…');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const ll = [p.coords.latitude, p.coords.longitude];
      map.setView(ll, 16);
      onFound?.(ll);
    },
    () => toast('Polohu se nepodařilo zjistit.'),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

// ---------- Výchozí obsah nového focení ----------

const item = (text) => ({ id: db.uid(), text, done: false });
const DEFAULT_BRING = ['Nabité baterie + náhradní', 'Prázdné a naformátované karty', 'Čisticí hadřík na objektivy', 'Odrazná deska', 'Souhlas modelu se zveřejněním'];
const DEFAULT_WATCH = [
  'Ostrost na blížší oko',
  'Ruce a prsty: uvolněné, ne useknuté',
  'Vlasy, límec a oblečení (smotky, žmolky)',
  'Pozadí: nic nevyrůstá z hlavy',
  'Horizont a svislice rovně',
  'Světlo v očích',
  'Přepaly na kůži',
];

function newShoot() {
  return {
    id: db.uid(),
    title: '',
    model: '',
    date: '',
    time: '',
    placeId: '',
    ratio: '3:2',
    format: '16:9',
    seed: Math.floor(Math.random() * 1e6),
    showLabel: true,
    notes: '',
    poses: [],
    bring: DEFAULT_BRING.map(item),
    watch: DEFAULT_WATCH.map(item),
    board: [],
    created: Date.now(),
  };
}

// ---------- Seznam s odškrtáváním (pózy, s sebou, hlídat) ----------

function checklist(list, save, { placeholder, extra } = {}) {
  const ul = h('ul', { class: 'checklist' });
  const count = h('span', { class: 'count' });
  const refresh = () => {
    const done = list.filter((i) => i.done).length;
    count.textContent = list.length ? `${done}/${list.length}` : '';
  };
  const row = (it) => {
    const li = h('li', { class: it.done ? 'done' : '' },
      h('input', {
        type: 'checkbox', checked: it.done, 'aria-label': 'Hotovo',
        onchange: (e) => { it.done = e.target.checked; li.classList.toggle('done', it.done); refresh(); save(); },
      }),
      h('input', { type: 'text', class: 'item-text', value: it.text, 'aria-label': 'Text položky', oninput: (e) => { it.text = e.target.value; save(); } }),
      iconBtn('close', 'Odebrat', () => { list.splice(list.indexOf(it), 1); li.remove(); refresh(); save(); }, 'subtle'),
    );
    return li;
  };
  const add = (text) => {
    if (!text.trim()) return;
    const it = item(text.trim());
    list.push(it);
    ul.append(row(it));
    refresh();
    save();
  };
  const input = h('input', { type: 'text', placeholder, enterKeyHint: 'done', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); input.value = ''; } } });
  ul.append(...list.map(row));
  refresh();
  return {
    count,
    add,
    el: h('div', { class: 'list-wrap' }, ul,
      h('div', { class: 'add-row' }, input, h('button', { type: 'button', class: 'btn', onclick: () => { add(input.value); input.value = ''; input.focus(); } }, 'Přidat'), extra),
    ),
  };
}

// ---------- Pohledy ----------

async function shootsView() {
  setNav('foceni');
  setTop('Focení', { actions: [iconBtn('more', 'Záloha dat', () => settingsSheet())] });
  const shoots = await db.all('shoots');
  const places = Object.fromEntries((await db.all('places')).map((p) => [p.id, p]));
  const t = today();
  const upcoming = shoots.filter((s) => !s.date || s.date >= t).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const past = shoots.filter((s) => s.date && s.date < t).sort((a, b) => b.date.localeCompare(a.date));

  const card = async (s) => {
    const thumbs = await Promise.all((s.board ?? []).slice(0, 3).map((b) => db.imageUrl(b.imageId)));
    const all = [...s.bring, ...s.watch];
    return h('a', { class: 'shoot-card', href: `#/foceni/${s.id}` },
      h('div', { class: 'card-thumbs' }, thumbs.length ? thumbs.map((src, i) => h('img', { src, alt: '', style: { '--i': i } })) : h('span', { class: 'card-empty' }, 'moodboard')),
      h('div', { class: 'card-text' },
        h('strong', {}, s.title || 'Bez názvu'),
        s.model && h('span', {}, s.model),
        h('span', { class: 'muted' }, [fmtDate(s.date), s.time, places[s.placeId]?.name].filter(Boolean).join(' · ') || 'Datum zatím není'),
        all.length ? h('span', { class: 'muted' }, `Checklist ${all.filter((i) => i.done).length}/${all.length}`) : null,
      ),
    );
  };

  view.replaceChildren(
    h('section', { class: 'page' },
      shoots.length ? null : h('div', { class: 'empty' },
        h('p', { class: 'hand' }, 'Žádné focení v plánu.'),
        h('p', {}, 'Založ první: název, model, moodboard ze screenshotů, lokalitu a co si vzít s sebou.'),
      ),
      upcoming.length ? h('h2', { class: 'section-title' }, 'V plánu') : null,
      await Promise.all(upcoming.map(card)),
      past.length ? h('h2', { class: 'section-title' }, 'Proběhlá') : null,
      await Promise.all(past.map(card)),
    ),
    h('button', { type: 'button', class: 'fab', onclick: async () => { const s = newShoot(); await db.put('shoots', s); location.hash = `#/foceni/${s.id}/plan`; } }, icon('plus'), 'Nové focení'),
  );
}

async function shootView(id, tab = 'moodboard') {
  setNav('foceni');
  const shoot = await db.get('shoots', id);
  if (!shoot) return (location.hash = '#/');
  const places = await db.all('places');
  // Ukládá hned: IndexedDB drží pořadí transakcí, takže přepnutí záložky přečte už uloženou verzi.
  const save = () => db.put('shoots', shoot);

  setTop(shoot.title || 'Nové focení', {
    back: '#/',
    actions: [iconBtn('trash', 'Smazat focení', () => confirmSheet('Smazat celé focení?', async () => {
      for (const b of shoot.board) await db.deleteImage(b.imageId);
      await db.del('shoots', shoot.id);
      location.hash = '#/';
    }))],
  });

  const tabs = [['moodboard', 'Moodboard'], ['plan', 'Plán'], ['checklist', 'Checklist']];
  const seg = h('nav', { class: 'segmented', 'aria-label': 'Části focení' },
    tabs.map(([k, label]) => h('a', { href: `#/foceni/${id}/${k}`, 'aria-current': k === tab ? 'page' : null }, label)));

  let body;
  if (tab === 'plan') body = planTab(shoot, places, save);
  else if (tab === 'checklist') body = await checklistTab(shoot, save);
  else body = moodboardTab(shoot, () => db.put('shoots', shoot));
  view.replaceChildren(seg, body);
}

function moodboardTab(shoot, saveNow) {
  const holder = h('div', { class: 'board-holder' });
  const redraw = () => {
    cleanup.forEach((f) => f());
    cleanup = [mountBoard(holder, shoot, { onPick: (pid) => photoSheet(shoot, pid, saveNow, redraw) })];
  };
  const change = async (fn) => { fn(); await saveNow(); redraw(); };

  const addPhotos = async () => {
    const files = await pickFiles();
    if (!files.length) return;
    toast(`Lepím ${files.length} ${files.length === 1 ? 'fotku' : files.length < 5 ? 'fotky' : 'fotek'}…`);
    for (const f of files) {
      const { blob, w, h: ht } = await shrink(f);
      const imageId = await db.saveImage(blob);
      shoot.board.push({ id: db.uid(), imageId, orient: ht > w ? 'p' : 'l', fx: 0.5, fy: 0.5 });
    }
    await saveNow();
    redraw();
  };

  const select = (label, value, options, onchange) => h('label', { class: 'mini-field' }, h('span', {}, label),
    h('select', { 'aria-label': label, onchange: (e) => change(() => onchange(e.target.value)) },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))));

  const exportBtn = h('button', {
    type: 'button', class: 'btn',
    onclick: async () => {
      if (!shoot.board.length) return toast('Nejdřív přidej fotky.');
      exportBtn.disabled = true;
      exportBtn.textContent = 'Lepím…';
      try {
        const blob = await renderBoardImage(shoot);
        const name = `moodboard-${(shoot.title || 'foceni').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')}.png`;
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: shoot.title }).catch(() => {});
        else {
          const a = h('a', { href: URL.createObjectURL(blob), download: name });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
      } finally {
        exportBtn.disabled = false;
        exportBtn.replaceChildren(icon('share'), 'Uložit obrázek');
      }
    },
  }, icon('share'), 'Uložit obrázek');

  queueMicrotask(redraw);
  return h('section', { class: 'mood' },
    h('div', { class: 'board-tools' },
      select('Deska', shoot.format ?? '16:9', Object.entries(FORMATS).map(([k, f]) => [k, f.label]), (v) => (shoot.format = v)),
      select('Fotky', shoot.ratio, Object.keys(RATIOS).map((r) => [r, r]), (v) => (shoot.ratio = v)),
      h('button', { type: 'button', class: 'btn small', onclick: () => change(() => { shoot.seed = (shoot.seed ?? 0) + 1; for (const b of shoot.board) delete b.top; }) }, icon('shuffle'), 'Zamíchat'),
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: shoot.showLabel !== false, onchange: (e) => change(() => (shoot.showLabel = e.target.checked)) }),
        h('span', {}, 'štítek s názvem')),
    ),
    holder,
    h('p', { class: 'hint' }, 'Klepni na fotku: posuneš výřez, otočíš ji nebo ji dáš navrch.'),
    h('div', { class: 'dock' },
      h('button', { type: 'button', class: 'btn primary', onclick: addPhotos }, icon('plus'), 'Fotky'),
      exportBtn,
    ),
  );
}

async function photoSheet(shoot, pid, saveNow, redraw) {
  const it = shoot.board.find((b) => b.id === pid);
  if (!it) return;
  const src = await db.imageUrl(it.imageId);
  const img = h('img', { src, alt: '', draggable: false });
  const frame = h('div', { class: 'crop-frame' }, img, h('span', { class: 'crop-hint' }, 'táhni prstem'));
  const apply = () => {
    const a = aspectOf(shoot.ratio, it.orient);
    frame.style.aspectRatio = String(a);
    frame.style.width = `min(100%, ${(52 * a).toFixed(2)}dvh)`;
    img.style.objectPosition = `${it.fx * 100}% ${it.fy * 100}%`;
  };
  apply();

  // Tažením se posouvá výřez (stejně jako object-position).
  let start = null;
  frame.addEventListener('pointerdown', (e) => {
    frame.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, fx: it.fx, fy: it.fy };
  });
  frame.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = frame.getBoundingClientRect();
    const nat = img.naturalWidth / img.naturalHeight;
    const fa = r.width / r.height;
    // Přebývající část obrázku v pixelech rámečku: podle ní se přepočítá posun prstu.
    const overX = nat > fa ? r.height * nat - r.width : 0;
    const overY = nat < fa ? r.width / nat - r.height : 0;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    if (overX) it.fx = clamp(start.fx - (e.clientX - start.x) / overX);
    if (overY) it.fy = clamp(start.fy - (e.clientY - start.y) / overY);
    apply();
  });
  const end = () => { if (start) { start = null; saveNow(); } };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);

  const orient = h('div', { class: 'segmented small', role: 'group', 'aria-label': 'Orientace' },
    [['p', 'Na výšku'], ['l', 'Na šířku']].map(([k, label]) => h('button', {
      type: 'button', 'aria-pressed': String(it.orient === k),
      onclick: (e) => {
        it.orient = k;
        for (const b of orient.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        apply();
        saveNow();
      },
    }, label)));

  const s = sheet('Fotka', [
    frame,
    orient,
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button', class: 'btn danger',
        onclick: async () => {
          shoot.board.splice(shoot.board.indexOf(it), 1);
          await db.deleteImage(it.imageId);
          await saveNow();
          s.close();
        },
      }, 'Odlepit'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => { it.top = Date.now(); await saveNow(); s.close(); } }, 'Dát navrch'),
    ),
  ], { onClose: redraw });
}

function planTab(shoot, places, save) {
  const input = (key, props = {}) => h('input', { value: shoot[key] ?? '', ...props, oninput: (e) => { shoot[key] = e.target.value; save(); if (key === 'title') topbar.querySelector('h1').textContent = e.target.value || 'Nové focení'; } });
  const mapBox = h('div', { class: 'mini-map' });
  const placeInfo = h('div', { class: 'place-info' });

  const showPlace = () => {
    cleanup.forEach((f) => f());
    cleanup = [];
    const p = places.find((x) => x.id === shoot.placeId);
    mapBox.hidden = !p;
    placeInfo.replaceChildren();
    if (!p) return;
    const map = makeMap(mapBox, { center: [p.lat, p.lng], zoom: 15 });
    L.marker([p.lat, p.lng], { icon: pinIcon() }).addTo(map);
    placeInfo.append(
      p.note ? h('p', { class: 'muted' }, p.note) : null,
      navLinks(p.lat, p.lng),
      h('a', { class: 'link', href: `#/lokalita/${p.id}` }, 'Otevřít lokalitu s fotkami →'),
    );
  };

  const select = h('select', {
    onchange: (e) => {
      if (e.target.value === '__new') {
        location.hash = `#/lokalita/new?shoot=${shoot.id}`;
        return;
      }
      shoot.placeId = e.target.value;
      save();
      showPlace();
    },
  },
  h('option', { value: '' }, '— vyber uloženou lokalitu —'),
  places.sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((p) => h('option', { value: p.id, selected: p.id === shoot.placeId }, p.name || 'Bez názvu')),
  h('option', { value: '__new' }, '+ nová lokalita na mapě…'));

  const poses = checklist(shoot.poses, save, { placeholder: 'třeba: sedí na schodech, pohled přes rameno' });
  queueMicrotask(showPlace);

  return h('section', { class: 'page form' },
    field('Název focení', input('title', { type: 'text', placeholder: 'třeba: Podzimní les' })),
    field('Model', input('model', { type: 'text', placeholder: 'jméno nebo přezdívka' })),
    h('div', { class: 'two' },
      field('Datum', input('date', { type: 'date' })),
      field('Čas', input('time', { type: 'time' })),
    ),
    h('h2', { class: 'section-title' }, 'Lokalita'),
    select, mapBox, placeInfo,
    h('h2', { class: 'section-title' }, 'Pózy ', poses.count),
    h('p', { class: 'muted' }, 'Krátký popis každé pózy. Během focení si je odškrtáváš.'),
    poses.el,
    h('h2', { class: 'section-title' }, 'Poznámky'),
    h('textarea', { rows: 4, value: shoot.notes ?? '', placeholder: 'styling, make-up, kontakt, cokoli dalšího', oninput: (e) => { shoot.notes = e.target.value; save(); } }),
  );
}

async function checklistTab(shoot, save) {
  const props = await db.all('props');
  const bring = checklist(shoot.bring, save, {
    placeholder: 'přidat věc',
    extra: props.length ? h('button', { type: 'button', class: 'btn', onclick: () => propPicker(props, (names) => names.forEach((n) => bring.add(n))) }, 'Z inventáře') : null,
  });
  const watch = checklist(shoot.watch, save, { placeholder: 'na co si dát pozor' });
  return h('section', { class: 'page' },
    h('h2', { class: 'section-title' }, 'Co si vzít s sebou ', bring.count),
    bring.el,
    h('h2', { class: 'section-title' }, 'Co hlídat během focení ', watch.count),
    watch.el,
  );
}

function propPicker(props, done) {
  const chosen = new Set();
  const s = sheet('Vybrat z inventáře', [
    h('ul', { class: 'pick-list' }, props.sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((p) => h('li', {},
      h('label', {}, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? chosen.add(p) : chosen.delete(p)) }),
        h('span', {}, p.name, p.qty > 1 ? ` (${p.qty}×)` : '', p.category ? h('small', { class: 'muted' }, ` · ${p.category}`) : null)),
    ))),
    h('button', { type: 'button', class: 'btn primary wide', onclick: () => { done([...chosen].map((p) => (p.qty > 1 ? `${p.name} (${p.qty}×)` : p.name))); s.close(); } }, 'Přidat do „s sebou“'),
  ]);
}

// ---------- Inventář ----------

async function propsView() {
  setNav('inventar');
  setTop('Inventář');
  const props = await db.all('props');
  const groups = new Map();
  for (const p of props.sort((a, b) => a.name.localeCompare(b.name, 'cs'))) {
    const k = p.category || 'Ostatní';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const cats = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'cs'));
  view.replaceChildren(
    h('section', { class: 'page' },
      props.length ? null : h('div', { class: 'empty' }, h('p', { class: 'hand' }, 'Inventář je prázdný.'), h('p', {}, 'Přidej rekvizity a vybavení na focení: látky, květiny, rámečky, světla. U focení je pak jedním klepnutím dáš do seznamu „s sebou“.')),
      await Promise.all(cats.map(async (c) => [
        h('h2', { class: 'section-title' }, c),
        h('div', { class: 'prop-grid' }, await Promise.all(groups.get(c).map(async (p) => h('button', { type: 'button', class: 'prop', onclick: () => propSheet(p, cats) },
          p.imageId ? h('img', { src: await db.imageUrl(p.imageId), alt: '' }) : h('span', { class: 'prop-noimg' }, p.name.slice(0, 1).toUpperCase()),
          h('strong', {}, p.name, p.qty > 1 ? h('span', { class: 'qty' }, ` ${p.qty}×`) : null),
          p.note ? h('small', {}, p.note) : null,
        )))),
      ])),
    ),
    h('button', { type: 'button', class: 'fab', onclick: () => propSheet(null, cats) }, icon('plus'), 'Přidat věc'),
  );
}

async function propSheet(prop, cats) {
  const p = prop ? { ...prop } : { id: db.uid(), name: '', category: '', qty: 1, note: '', imageId: '' };
  const preview = h('button', { type: 'button', class: 'prop-photo', 'aria-label': 'Fotka věci' });
  const showPhoto = async () => preview.replaceChildren(p.imageId ? h('img', { src: await db.imageUrl(p.imageId), alt: '' }) : h('span', {}, icon('camera'), 'Vyfotit / vybrat'));
  preview.addEventListener('click', async () => {
    const [f] = await pickFiles({ multiple: false });
    if (!f) return;
    const old = p.imageId;
    p.imageId = await db.saveImage((await shrink(f, 1200)).blob);
    if (old && old !== prop?.imageId) await db.deleteImage(old);
    showPhoto();
  });
  showPhoto();
  const list = h('datalist', { id: 'cats' }, cats.filter((c) => c !== 'Ostatní').concat(['Látky a pozadí', 'Květiny', 'Oblečení', 'Světla', 'Drobnosti']).filter((c, i, a) => a.indexOf(c) === i).map((c) => h('option', { value: c })));
  const cat = h('input', { type: 'text', value: p.category, placeholder: 'třeba: Látky a pozadí', oninput: (e) => (p.category = e.target.value) });
  cat.setAttribute('list', 'cats');
  const s = sheet(prop ? 'Upravit věc' : 'Nová věc', [
    preview,
    field('Název', h('input', { type: 'text', value: p.name, required: true, placeholder: 'třeba: bílý tyl 3 m', oninput: (e) => (p.name = e.target.value) })),
    h('div', { class: 'two' }, field('Kategorie', cat), field('Počet', h('input', { type: 'number', min: 1, value: p.qty, inputMode: 'numeric', oninput: (e) => (p.qty = Math.max(1, Number(e.target.value) || 1)) }))),
    list,
    field('Poznámka', h('input', { type: 'text', value: p.note, placeholder: 'kde leží, stav, od koho', oninput: (e) => (p.note = e.target.value) })),
    h('div', { class: 'row-actions' },
      prop ? h('button', { type: 'button', class: 'btn danger', onclick: () => confirmSheet(`Smazat „${prop.name}“?`, async () => { await db.deleteImage(prop.imageId); await db.del('props', prop.id); s.close(); render(); }) }, 'Smazat') : null,
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          if (!p.name.trim()) return toast('Doplň název.');
          if (prop?.imageId && prop.imageId !== p.imageId) await db.deleteImage(prop.imageId);
          await db.put('props', { ...p, name: p.name.trim() });
          s.close();
          render();
        },
      }, 'Uložit'),
    ),
  ]);
}

// ---------- Lokality ----------

async function placesView() {
  setNav('lokality');
  setTop('Lokality');
  const places = await db.all('places');
  const mapBox = h('div', { class: 'big-map' });
  view.replaceChildren(
    mapBox,
    h('section', { class: 'page' },
      places.length ? null : h('div', { class: 'empty' }, h('p', { class: 'hand' }, 'Žádná uložená místa.'), h('p', {}, 'Ulož si místa, kde se dobře fotí, i s fotkami a poznámkou, kdy je tam nejlepší světlo.')),
      h('div', { class: 'place-list' }, await Promise.all(places.sort((a, b) => a.name.localeCompare(b.name, 'cs')).map(async (p) => h('a', { class: 'place-card', href: `#/lokalita/${p.id}` },
        p.photos?.[0] ? h('img', { src: await db.imageUrl(p.photos[0]), alt: '' }) : h('span', { class: 'prop-noimg' }, icon('pin')),
        h('span', {}, h('strong', {}, p.name || 'Bez názvu'), p.note ? h('small', { class: 'muted' }, p.note) : null),
      )))),
    ),
    h('button', { type: 'button', class: 'fab', onclick: () => (location.hash = '#/lokalita/new') }, icon('plus'), 'Nová lokalita'),
  );
  const map = makeMap(mapBox);
  const markers = places.map((p) => L.marker([p.lat, p.lng], { icon: pinIcon() }).addTo(map).bindPopup(`<a href="#/lokalita/${p.id}">${escapeHtml(p.name || 'Bez názvu')}</a>`));
  if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3), { maxZoom: 14 });
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function placeView(id, params) {
  setNav('lokality');
  const isNew = id === 'new';
  const p = isNew ? { id: db.uid(), name: '', note: '', lat: HOME[0], lng: HOME[1], photos: [], created: Date.now() } : await db.get('places', id);
  if (!p) return (location.hash = '#/lokality');
  const forShoot = params.get('shoot');
  const back = forShoot ? `#/foceni/${forShoot}/plan` : '#/lokality';
  let saved = !isNew;
  const save = async () => {
    await db.put('places', p);
    saved = true;
  };
  const saveNow = async () => { await db.put('places', p); saved = true; };

  setTop(isNew ? 'Nová lokalita' : p.name || 'Lokalita', {
    back,
    actions: isNew ? [] : [iconBtn('trash', 'Smazat lokalitu', () => confirmSheet('Smazat lokalitu i s fotkami?', async () => {
      for (const ph of p.photos) await db.deleteImage(ph);
      await db.del('places', p.id);
      location.hash = '#/lokality';
    }))],
  });

  const mapBox = h('div', { class: 'big-map pick' });
  const coords = h('span', { class: 'muted coords' });
  const links = h('div');
  const showCoords = () => {
    coords.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    links.replaceChildren(navLinks(p.lat, p.lng));
  };
  const gallery = h('div', { class: 'place-photos' });
  const drawGallery = async () => {
    gallery.replaceChildren(...await Promise.all(p.photos.map(async (ph) => h('figure', {},
      h('img', { src: await db.imageUrl(ph), alt: '' }),
      iconBtn('close', 'Odebrat fotku', async () => { p.photos = p.photos.filter((x) => x !== ph); await db.deleteImage(ph); await saveNow(); drawGallery(); }, 'on-photo'),
    ))),
    h('button', { type: 'button', class: 'add-photo', onclick: async () => {
      for (const f of await pickFiles()) p.photos.push(await db.saveImage((await shrink(f, 1600)).blob));
      await saveNow();
      drawGallery();
    } }, icon('camera'), 'Přidat fotky'));
  };

  const shoots = isNew ? [] : (await db.all('shoots')).filter((s) => s.placeId === p.id);

  view.replaceChildren(
    mapBox,
    h('section', { class: 'page form' },
      h('p', { class: 'muted' }, 'Klepnutím do mapy přesuneš špendlík. ', coords),
      field('Název místa', h('input', { type: 'text', value: p.name, placeholder: 'třeba: Kunětická hora, západní svah', oninput: (e) => { p.name = e.target.value; save(); } })),
      field('Popis', h('textarea', { rows: 3, value: p.note, placeholder: 'kdy je nejlepší světlo, kde zaparkovat, co je kolem', oninput: (e) => { p.note = e.target.value; save(); } })),
      links,
      h('h2', { class: 'section-title' }, 'Fotky z místa'),
      gallery,
      shoots.length ? [h('h2', { class: 'section-title' }, 'Focení tady'), h('ul', { class: 'plain' }, shoots.map((s) => h('li', {}, h('a', { class: 'link', href: `#/foceni/${s.id}` }, s.title || 'Bez názvu', s.date ? ` · ${fmtDate(s.date)}` : ''))))] : null,
      forShoot ? h('button', {
        type: 'button', class: 'btn primary wide',
        onclick: async () => {
          if (!p.name.trim()) p.name = 'Místo focení';
          await saveNow();
          const s = await db.get('shoots', forShoot);
          if (s) await db.put('shoots', { ...s, placeId: p.id });
          location.hash = back;
        },
      }, 'Použít pro focení') : null,
    ),
  );
  showCoords();
  drawGallery();

  const map = makeMap(mapBox, { center: [p.lat, p.lng], zoom: isNew ? 12 : 15 });
  const marker = L.marker([p.lat, p.lng], { icon: pinIcon(), draggable: true }).addTo(map);
  const moveTo = (ll) => {
    [p.lat, p.lng] = Array.isArray(ll) ? ll : [ll.lat, ll.lng];
    marker.setLatLng([p.lat, p.lng]);
    showCoords();
    if (saved || p.name) save();
  };
  map.on('click', (e) => moveTo(e.latlng));
  marker.on('dragend', () => moveTo(marker.getLatLng()));
  const locate = L.control({ position: 'topright' });
  locate.onAdd = () => iconBtn('locate', 'Moje poloha', (e) => { e.stopPropagation(); locateMe(map, moveTo); }, 'map-btn');
  locate.addTo(map);
  if (isNew && !forShoot) locateMe(map, moveTo);
}

// ---------- Záloha ----------

function settingsSheet() {
  const s = sheet('Záloha dat', [
    h('p', {}, 'Všechno je uložené jen v tomhle telefonu. Občas si stáhni zálohu (jeden soubor i s fotkami), ať o nic nepřijdeš, a v novém telefonu ji obnovíš.'),
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          const blob = await db.exportAll();
          const a = h('a', { href: URL.createObjectURL(blob), download: `foceni-zaloha-${today()}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        },
      }, 'Stáhnout zálohu'),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const input = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only' });
          input.addEventListener('change', async () => {
            try {
              await db.importAll(input.files[0]);
              toast('Záloha obnovena.');
              s.close();
              render();
            } catch (e) {
              toast(e.message || 'Zálohu se nepodařilo načíst.');
            }
          });
          document.body.append(input);
          input.click();
        },
      }, 'Obnovit ze zálohy'),
    ),
  ]);
}

// ---------- Směrování ----------

async function render() {
  cleanup.forEach((f) => f());
  cleanup = [];
  document.querySelectorAll('dialog.sheet').forEach((d) => d.close());
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  if (parts[0] === 'foceni' && parts[1]) await shootView(parts[1], parts[2]);
  else if (parts[0] === 'inventar') await propsView();
  else if (parts[0] === 'lokality') await placesView();
  else if (parts[0] === 'lokalita' && parts[1]) await placeView(parts[1], params);
  else await shootsView();
  document.body.dataset.ready = '1';
}

window.addEventListener('hashchange', render);
render();
db.persist();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js');

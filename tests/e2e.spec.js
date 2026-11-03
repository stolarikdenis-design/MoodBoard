// Aplikace Focení: moodboard ořízne fotky na poměr, checklisty, inventář a lokality se uloží v telefonu.
import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// Testovací "screenshot" na výšku (300 × 650 px).
const shot = async () => ({ name: 'screen.png', mimeType: 'image/png',
  buffer: await sharp({ create: { width: 300, height: 650, channels: 3, background: '#c96' } }).png().toBuffer() });

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 204 }));
});

test('focení: moodboard ořízne screenshot přesně na poměr fotek a přilepí ho páskou', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await page.getByRole('button', { name: 'Nové focení' }).click();
  await page.getByLabel('Název focení').fill('Podzimní les');
  await page.getByLabel('Model').fill('Testovací model');
  await page.getByRole('link', { name: 'Moodboard' }).click();
  await expect(page.locator('.board-label')).toContainText('Podzimní les');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotky' }).click();
  await (await chooser).setFiles(await shot());
  const print = page.locator('.photo').first();
  await expect(print).toBeVisible();
  await expect(print.locator('.tape').first()).toBeAttached();

  const ratio = async () => print.locator('img.shot').evaluate((img) => img.offsetWidth / img.offsetHeight);
  expect(await ratio()).toBeCloseTo(2 / 3, 2); // screenshot na výšku → 3:2 na výšku
  await page.getByRole('combobox', { name: 'Fotky' }).selectOption('1:1');
  await expect.poll(ratio).toBeCloseTo(1, 2);

  await page.reload();
  await expect(page.locator('.photo')).toHaveCount(1); // data přežijí znovunačtení
  expect(errors).toEqual([]);
});

test('focení: checklist, inventář a lokalita', async ({ page }) => {
  await page.goto('/#/inventar');
  await page.getByRole('button', { name: 'Přidat věc' }).click();
  await page.getByLabel('Název').fill('Bílý tyl');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.locator('.prop')).toHaveText(/Bílý tyl/);

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Nové focení' }).click();
  await page.getByRole('link', { name: 'Checklist' }).click();
  await expect(page.getByRole('heading', { name: /Co si vzít s sebou/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Co hlídat během focení/ })).toBeVisible();
  await page.getByRole('button', { name: 'Z inventáře' }).click();
  await page.getByLabel('Bílý tyl').check();
  await page.getByRole('button', { name: /Přidat do/ }).click();
  await expect(page.locator('.checklist .item-text').nth(5)).toHaveValue('Bílý tyl');

  await page.goto('/#/lokality');
  await expect(page.locator('.big-map.leaflet-container')).toBeVisible();
});

test('focení: screenshot se ořízne na fotku a Claude z moodboardu připraví pózy, rekvizity a oblečení', async ({ page }) => {
  // Screenshot jako z Instagramu: bílé lišty a text nahoře i dole, uprostřed fotka 300 × 380.
  const photo = await sharp({ create: { width: 300, height: 380, channels: 3, background: '#8a2b2b' } }).png().toBuffer();
  const screen = await sharp({ create: { width: 300, height: 650, channels: 3, background: '#ffffff' } })
    .composite([{ input: photo, top: 120, left: 0 }]).png().toBuffer();
  const plan = {
    mood: 'Temná nálada.', light: 'Tvrdé světlo z boku.', colors: 'Červená a černá.',
    poses: [{ title: 'Zády s nápisem', how: 'Stojí zády, hlava k rameni.', photo: 1, props: ['jablko'] }],
    outfit: ['Černé kalhoty'], props: ['Bílý tyl', 'jablko'],
    places: [{ name: 'Betonová chodba', why: 'Chladný tón.', saved: false }],
    watch: ['Čitelný text na těle'],
  };
  let sent;
  await page.route('https://api.anthropic.com/**', async (r) => {
    sent = JSON.parse(r.request().postData());
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify(plan) }], usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
  await page.goto('/#/inventar');
  await page.getByRole('button', { name: 'Přidat věc' }).click();
  await page.getByLabel('Název').fill('Bílý tyl');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Nové focení' }).click();
  await page.getByRole('link', { name: 'Moodboard' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotky' }).click();
  await (await chooser).setFiles({ name: 'ig.png', mimeType: 'image/png', buffer: screen });
  await expect(page.locator('.photo')).toHaveCount(1);
  // Oříznutá fotka má poměr samotné fotky (300 : 380), ne celého screenshotu.
  const item = await page.evaluate(async () => {
    const db = await import('./db.js');
    const [s] = await db.all('shoots');
    const b = s.board[0];
    const bmp = await createImageBitmap(await db.imageBlob(b.imageId));
    return { w: bmp.width, h: bmp.height, orig: Boolean(b.origId) };
  });
  expect(item.orig).toBe(true);
  expect(item.w / item.h).toBeCloseTo(300 / 380, 1);

  await page.getByRole('button', { name: 'Připravit z moodboardu' }).click();
  await page.getByLabel('API klíč').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nálada a světlo' })).toBeVisible();
  expect(sent.model).toBe('claude-opus-5-5');
  expect(sent.messages[0].content.filter((c) => c.type === 'image')).toHaveLength(1);
  await expect(page.locator('.checklist .item-text').first()).toHaveValue('Zády s nápisem');
  await expect(page.locator('.pose-thumb')).toHaveCount(1);
  await expect(page.getByText('Betonová chodba')).toBeVisible();
  await page.getByRole('link', { name: 'Checklist' }).click();
  await expect(page.getByRole('heading', { name: /Co si vzít s sebou/ })).toBeVisible();
  const bring = await page.locator('.checklist').first().locator('.item-text').evaluateAll((els) => els.map((e) => e.value));
  expect(bring).toContain('Bílý tyl');
  expect(bring).toContain('Sehnat: jablko');
});

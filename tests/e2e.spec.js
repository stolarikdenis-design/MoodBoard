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

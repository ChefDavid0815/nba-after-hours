import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const PRODUCTION = 'http://127.0.0.1:28024';
const SAVE_KEY = 'nba-after-hours.save.v1';
const STORAGE_KEYS = [SAVE_KEY, `${SAVE_KEY}.backup`, 'nba-after-hours.tournament.v1', 'nba-after-hours.tournament.v1.backup', 'nba-after-hours.lineups.v1', 'nba-after-hours.daily-challenges.v1', 'nba-after-hours.tutorial.completed.v1'];

async function ready(page: Page) { await page.goto(PRODUCTION); await expect(page.locator('[data-start]')).toBeVisible(); }
async function openManager(page: Page) {
  await page.locator('[data-settings]').click();
  await page.locator('[data-manage-save]').click();
  await expect(page.locator('.save-panel[role="dialog"]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), STORAGE_KEYS);
}
async function downloadBackup(page: Page, info: TestInfo) {
  const pending = page.waitForEvent('download'); await page.locator('[data-export]').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^nba-after-hours-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = info.outputPath(download.suggestedFilename()); await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const text = await readFile(path, 'utf8'); expect(JSON.parse(text).format).toBe('nba-after-hours.profile');
  return { path, text, document: JSON.parse(text) };
}

test('a real downloaded backup previews, imports and restores settings and selected players after reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page); await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('#team-home').selectOption('hou'); await page.locator('#difficulty').selectOption('rookie'); await page.locator('#quarter-length').selectOption('120');
  await page.locator('[data-roster="home"]').click();
  for (const index of [1, 2, 4]) await page.locator(`[data-roster-player="${index}"]`).click();
  for (const index of [4, 3, 0]) await page.locator(`[data-roster-player="${index}"]`).click();
  await page.locator('[data-save-roster]').click();
  await page.locator('[data-settings]').click(); await page.locator('#camera').selectOption('overhead');
  await page.locator('#volume').fill('0.25'); await expect(page.locator('#volume-value')).toHaveText('25%');
  await page.locator('[data-manage-save]').click();
  const downloaded = await downloadBackup(page, info);
  expect(downloaded.document.data.save.settings).toMatchObject({ locale: 'en', volume: 0.25, camera: 'overhead', difficulty: 'rookie', quarterLength: 120 });
  expect(downloaded.document.data.lineups.teams.hou).toEqual([4, 3, 0]);
  await page.locator('[data-backup-file]').setInputFiles(downloaded.path);
  await expect(page.locator('[data-save-status]')).toHaveText('This backup has been validated and is ready to import.');
  await expect(page.locator('[data-import-preview] .save-summary b')).toHaveText(['0', '0', '0', '0', '1']);
  await expect(page.locator('[data-import-preview] .save-file-name')).toHaveText(downloaded.path.split(/[\\/]/).at(-1)!);
  await expect(page.locator('[data-import]')).toBeVisible();

  // Modify the current device through normal UI after inspecting the downloaded data.
  await page.keyboard.press('Escape'); await expect(page.locator('[data-manage-save]')).toBeFocused();
  await page.locator('#camera').selectOption('courtside'); await page.locator('#volume').fill('0.9');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.locator('#difficulty').selectOption('allstar'); await page.locator('#quarter-length').selectOption('60');
  const changed = JSON.parse((await stored(page))[SAVE_KEY]!);
  expect(changed.settings).toMatchObject({ locale: 'zh', volume: 0.9, camera: 'courtside', difficulty: 'allstar', quarterLength: 60 });
  await openManager(page); await page.locator('[data-backup-file]').setInputFiles(downloaded.path);
  await expect(page.locator('[data-save-status]')).toHaveText('备份已验证，可以导入。');
  const navigation = page.waitForEvent('load'); await page.locator('[data-import]').click(); await navigation;
  await expect(page.locator('[data-start]')).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(page.url()).toContain(PRODUCTION);
  const restored = await stored(page);
  expect(JSON.parse(restored[SAVE_KEY]!)).toEqual(downloaded.document.data.save);
  expect(JSON.parse(restored['nba-after-hours.lineups.v1']!)).toEqual(downloaded.document.data.lineups);
  await expect(page.locator('#team-home')).toHaveValue('hou'); await expect(page.locator('#difficulty')).toHaveValue('rookie'); await expect(page.locator('#quarter-length')).toHaveValue('120');
  await page.locator('[data-settings]').click(); await expect(page.locator('#camera')).toHaveValue('overhead'); await expect(page.locator('#volume')).toHaveValue('0.25');
  expect(errors).toEqual([]);
});

for (const locale of ['zh', 'en'] as const) {
  test(`invalid backup files preserve all stored progress with ${locale} feedback and Escape focus restoration`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    if (locale === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.locator('#team-home').selectOption('gsw'); await openManager(page);
    await expect(page.locator('[data-save-close]')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(page.locator('[data-choose]')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('[data-save-close]')).toBeFocused();
    const downloaded = await downloadBackup(page, info); const before = await stored(page);
    const samples = [
      { name: 'broken.json', body: Buffer.from('{broken JSON'), zh: '无法读取这个 JSON 备份文件。', en: 'This is not a readable JSON backup.' },
      { name: 'oversized.json', body: Buffer.alloc(1_048_577, 97), zh: '备份文件超过 1 MiB 限制。', en: 'The backup exceeds the 1 MiB limit.' },
      { name: 'foreign.json', body: Buffer.from(JSON.stringify({ format: 'another-game', version: 1 })), zh: '这不是本游戏的进度备份。', en: 'This is not a progress backup for this game.' },
    ];
    for (const file of samples) {
      // A rejected replacement must also clear the previously valid preview/import action.
      await page.locator('[data-backup-file]').setInputFiles(downloaded.path); await expect(page.locator('[data-import]')).toBeVisible();
      await page.locator('[data-backup-file]').setInputFiles({ name: file.name, mimeType: 'application/json', buffer: file.body });
      await expect(page.locator('[data-save-status]')).toHaveText(file[locale]);
      await expect(page.locator('[data-save-status]')).toHaveClass(/is-error/);
      await expect(page.locator('[data-import]')).toBeHidden(); await expect(page.locator('[data-import-preview]')).toBeEmpty();
      expect(await stored(page)).toEqual(before);
    }
    await page.keyboard.press('Escape'); await expect(page.locator('.save-panel')).toBeHidden();
    await expect(page.locator('[data-manage-save]')).toBeFocused(); await expect(page.locator('.dialog-panel')).toBeVisible();
    expect(await page.locator('#ui').evaluate(element => (element as HTMLElement).inert)).toBe(false);
    await page.keyboard.press('Escape'); await expect(page.locator('.dialog-panel')).toHaveCount(0);
    await expect(page.locator('[data-settings]')).toBeFocused(); expect(await stored(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

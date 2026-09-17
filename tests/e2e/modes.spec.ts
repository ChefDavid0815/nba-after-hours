import { test, expect, type Page } from '@playwright/test';

const SAVE_KEY = 'nba-after-hours.save.v1';
const TOURNAMENT_KEY = 'nba-after-hours.tournament.v1';
const DAILY_KEY = 'nba-after-hours.daily-challenges.v1';

async function state(page: Page) { return page.evaluate(() => (window as any).__NBA.state()); }
async function readSaved(page: Page, key: string) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key); }
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-start]')).toBeVisible();
  await page.waitForFunction(() => typeof (window as any).__NBA?.step === 'function');
}
async function waitForPlay(page: Page) { await page.waitForFunction(() => (window as any).__NBA.state()?.phase === 'playing'); }
async function finish(page: Page, seconds = 300) {
  await page.evaluate(seconds => (window as any).__NBA.step(seconds), seconds);
  await page.waitForFunction(() => (window as any).__NBA.status().resultShown);
  await expect(page.locator('.result-shell')).toBeVisible();
}

/** Attainable input policy: reads snapshots and sends normal movement/shoot/pass/defend controls. */
async function playByInputs(page: Page, seconds: number, tickRate = 10, startFromMenu = false) {
  return page.evaluate(async ({ seconds, tickRate, startFromMenu }) => {
    const game = (window as any).__NBA;
    // Start through the real UI handler and simulate in the same browser task. This prevents
    // variable RAF time before the first bot input from consuming a different seeded AI sequence.
    if (startFromMenu) {
      (document.querySelector('[data-start]') as HTMLButtonElement).click();
      if (game.state()?.elapsed !== 0) throw new Error('Expected an untouched match at the start of the input sequence.');
    }
    const initialTournament = JSON.parse(localStorage.getItem('nba-after-hours.tournament.v1') ?? 'null');
    const empty = () => ({ moveX: 0, moveZ: 0, sprint: false, shootHeld: false, shootPressed: false, shootReleased: false, passPressed: false, switchPressed: false, stealPressed: false, blockPressed: false, crossoverPressed: false, callScreenPressed: false });
    const distance = (a: any, b: any) => Math.hypot(a.x - b.x, a.z - b.z);
    const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
    const steer = (input: any, player: any, x: number, z: number, sprint = false) => {
      const dx = x - player.x, dz = z - player.z, length = Math.hypot(dx, dz);
      input.moveX = length < 0.15 ? 0 : dx / Math.max(1, length);
      input.moveZ = length < 0.15 ? 0 : dz / Math.max(1, length); input.sprint = sprint;
    };
    const dt = 1 / tickRate;
    for (let frame = 0; frame < seconds * tickRate; frame++) {
      const snapshot = game.state();
      if (!snapshot || snapshot.phase === 'finished') break;
      const input = empty();
      const player = snapshot.players.find((item: any) => item.id === snapshot.controlled);
      const ball = snapshot.ball;
      const owner = snapshot.players.find((item: any) => item.id === ball.owner);
      if (snapshot.phase === 'playing' && player) {
        if (ball.state === 'loose') steer(input, player, ball.x, ball.z, true);
        else if (snapshot.possession === 1) {
          const target = owner ?? ball;
          steer(input, player, target.x - 1, target.z, distance(player, target) > 3);
          input.stealPressed = ball.state === 'held' && distance(player, target) < 1.5 && snapshot.elapsed % 1.4 < dt;
          input.blockPressed = ball.state === 'shot' && ball.progress < 0.25 && distance(player, ball) < 2;
        } else if (owner && ball.state === 'held') {
          if (owner.id !== player.id) input.passPressed = true;
          else if (snapshot.charging) {
            input.shootHeld = snapshot.charge < 0.69;
            input.shootReleased = !input.shootHeld;
          } else {
            const defenders = snapshot.players.filter((item: any) => item.side === 1);
            const pressure = (target: any) => defenders.reduce((total: number, defender: any) => Math.max(total, clamp(1 - distance(target, defender) / 2.5, 0, 1)), 0);
            const range = Math.hypot(12.15 - player.x, player.z), contest = pressure(player);
            const shotValue = (target: any) => (1 - pressure(target)) * (Math.hypot(12.15 - target.x, target.z) > 6.75 ? target.athlete.shooting / 100 * 3 : 2) - Math.max(0, Math.hypot(12.15 - target.x, target.z) - 8) * 0.4;
            const teammate = snapshot.players.filter((item: any) => item.side === 0 && item.id !== player.id && item.x > 2).sort((a: any, b: any) => shotValue(b) - shotValue(a))[0];
            if (teammate && contest > 0.38 && pressure(teammate) + 0.2 < contest && snapshot.shotClock > 3) {
              input.passPressed = true; (input as any).passTarget = teammate.id;
            } else if ((range < 2.6 && contest < 0.76) || (range < 8 && contest < 0.38) || snapshot.shotClock < 1.6) {
              input.shootHeld = true;
            } else {
              if (contest > 0.42 && player.cooldown <= 0) input.crossoverPressed = true;
              if (contest > 0.4 && snapshot.shotClock < 18 && snapshot.elapsed % 3.3 < dt) input.callScreenPressed = true;
              const nearest = defenders.filter((item: any) => item.x >= player.x - 0.4).sort((a: any, b: any) => distance(a, player) - distance(b, player))[0];
              let lane = player.z > 0 ? 1.7 : -1.7;
              if (nearest && distance(player, nearest) < 2.7) lane = nearest.z >= player.z ? player.z - 2.7 : player.z + 2.7;
              if (player.x > 9.4) lane *= 0.25;
              steer(input, player, player.x < 4 ? 6 : 11, clamp(lane, -5.6, 5.6), player.x < 5 || player.action === 'crossover');
            }
          }
        } else if (ball.state === 'shot') steer(input, player, 11, 0, true);
      }
      game.step(dt, input);
      // Avoid interleaving empty live keyboard frames into a timed charge in deterministic cup runs.
      if (tickRate < 60 && frame % (tickRate * 2) === tickRate * 2 - 1) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return { state: game.state(), initialTournament };
  }, { seconds, tickRate, startFromMenu });
}

async function makeTimedAttempt(page: Page) {
  await page.evaluate(() => {
    const game = (window as any).__NBA;
    const empty = { moveX: 0, moveZ: 0, sprint: false, shootHeld: false, shootPressed: false, shootReleased: false, passPressed: false, switchPressed: false, stealPressed: false, blockPressed: false, crossoverPressed: false, callScreenPressed: false };
    if (game.state().phase !== 'playing' || game.state().ball.state !== 'held') game.step(1.5, empty);
    game.step(0.7, { ...empty, shootHeld: true });
    game.step(1 / 60, { ...empty, shootReleased: true });
    game.step(2.2, empty);
  });
  // A separate browser task ensures the real event pipeline accounts for this basket.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('custom three-person lineups survive reload and practice uses the chosen solo athlete', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page); await page.locator('#team-home').selectOption('hou');
  await page.locator('[data-roster="home"]').click();
  for (const index of [1, 2, 4]) await page.locator(`[data-roster-player="${index}"]`).click();
  await expect(page.locator('[data-save-roster]')).toBeDisabled();
  for (const index of [4, 3, 0]) await page.locator(`[data-roster-player="${index}"]`).click();
  await page.locator('[data-save-roster]').click();
  await page.reload(); await expect(page.locator('#team-home')).toHaveValue('hou');
  await page.locator('[data-roster="home"]').click();
  for (const index of [4, 3, 0]) await expect(page.locator(`[data-roster-player="${index}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.dialog-panel [data-close]').first().click();
  await page.locator('[data-start]').click(); await waitForPlay(page);
  expect((await state(page)).players.filter((player: any) => player.side === 0).map((player: any) => player.athlete.name)).toEqual(['Yao Ming', 'Hakeem Olajuwon', 'Steve Francis']);
  await page.keyboard.press('Escape'); await page.locator('[data-quit]').click();
  await page.locator('button[data-mode="practice"]').click(); await page.locator('[data-roster="home"]').click();
  await page.locator('[data-roster-player="2"]').click(); await page.locator('[data-save-roster]').click();
  await page.locator('[data-start]').click(); await waitForPlay(page);
  const practice = await state(page); expect(practice.players).toHaveLength(1); expect(practice.players[0].athlete.name).toBe('Tracy McGrady');
  await expect(page.locator('[data-player-name]')).toContainText('麦克格雷迪');
  await page.reload(); await page.locator('button[data-mode="practice"]').click(); await page.locator('[data-start]').click(); await waitForPlay(page);
  expect((await state(page)).players[0].athlete.name).toBe('Tracy McGrady');
  expect(errors).toEqual([]);
});

for (const kind of ['three', 'inside', 'allaround'] as const) {
  test(`daily ${kind} uses its locked athlete, correct HUD metric and independent saved medal`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page); await page.locator('button[data-mode="challenge"]').click();
    await expect(page.locator('[data-daily]')).toHaveCount(3);
    const lockedName = await page.locator(`[data-daily="${kind}"] .daily-athlete`).evaluate(element => element.childNodes[0].textContent?.trim() ?? '');
    await page.locator(`[data-daily="${kind}"]`).click(); await waitForPlay(page);
    const initial = await state(page);
    expect(initial.config.challengeKind).toBe(kind); expect(initial.config.dailyChallengeId).toMatch(new RegExp(`-${kind}$`));
    expect(initial.players).toHaveLength(kind === 'allaround' ? 6 : 1);
    expect(initial.config.quarterLength).toBe(60); expect(initial.config.quarters).toBe(1); expect(initial.config.difficulty).toBe('pro');
    await expect(page.locator('[data-player-name]')).toHaveText(lockedName);
    await expect(page.locator('.daily-score-panel')).toBeVisible(); await expect(page.locator('[data-daily-score]')).toHaveText('0');
    if (kind === 'allaround') await playByInputs(page, 70);
    else {
      for (let attempt = 0; attempt < 14; attempt++) {
        const snapshot = await state(page); if (snapshot.phase === 'finished' || snapshot.clock < 3) break;
        const range = Math.hypot(12.15 - snapshot.players[0].x, snapshot.players[0].z);
        expect(kind === 'inside' ? range < 3.2 : range >= 6.75).toBe(true);
        await makeTimedAttempt(page);
      }
    }
    const played = await state(page); const own = played.players.filter((player: any) => player.side === 0);
    const sum = (key: string) => own.reduce((total: number, player: any) => total + player.stats[key], 0);
    const expectedScore = kind === 'three' ? sum('tpm') : kind === 'inside' ? played.score[0] : played.score[0] + 2 * sum('assists') + 2 * sum('steals') + 2 * sum('blocks') + sum('rebounds');
    expect(expectedScore).toBeGreaterThan(0);
    if (played.phase !== 'finished') {
      await expect(page.locator('[data-daily-score]')).toHaveText(String(expectedScore));
      await finish(page, 80);
    } else await page.waitForFunction(() => (window as any).__NBA.status().resultShown);
    const result = await state(page);
    expect(result.dailyResult.score).toBe(expectedScore);
    await expect(page.locator('.daily-result-card')).toBeVisible();
    await expect(page.locator('.daily-result-points strong')).toHaveText(String(expectedScore));
    await expect(page.locator('.daily-result-card')).toHaveClass(new RegExp(result.dailyResult.medal));
    const save = await readSaved(page, SAVE_KEY); expect(save.career.games).toBe(0); expect(save.career.wins).toBe(0); expect(save.career.points).toBe(0);
    expect(save.history).toHaveLength(1); expect(save.history[0].mode).toBe('challenge');
    const daily = await readSaved(page, DAILY_KEY); expect(daily.entries).toHaveLength(1); expect(daily.entries[0].id).toBe(result.config.dailyChallengeId); expect(daily.entries[0].score).toBe(expectedScore);
    await page.reload(); await page.locator('button[data-mode="challenge"]').click();
    await expect(page.locator(`[data-daily="${kind}"] .daily-thresholds b`)).toContainText(String(expectedScore));
    for (const other of ['three', 'inside', 'allaround'].filter(item => item !== kind)) await expect(page.locator(`[data-daily="${other}"] .daily-thresholds b`)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('a saved cup restores its actual opponent and a loss completes the bracket without offering advancement', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page); await page.locator('#team-home').selectOption('gsw'); await page.locator('#team-away').selectOption('cha');
  await page.locator('button[data-mode="championship"]').click(); await page.locator('[data-start]').click(); await waitForPlay(page);
  const first = await state(page); expect(first.config.away.id).toBe('cha');
  const original = await readSaved(page, TOURNAMENT_KEY); expect(original.round).toBe(1); expect(original.teams).toHaveLength(16);
  await page.reload(); await expect(page.locator('[data-resume-tournament]')).toBeVisible();
  await page.locator('[data-bracket]').click(); await expect(page.locator('.bracket-match')).toHaveCount(15);
  await expect(page.locator('.bracket-match.is-next')).toContainText('GSW'); await expect(page.locator('.bracket-match.is-next')).toContainText('CHA');
  await page.locator('.dialog-panel [data-resume-tournament]').click(); await waitForPlay(page);
  expect((await state(page)).config.away.id).toBe(first.config.away.id);
  expect((await readSaved(page, TOURNAMENT_KEY)).id).toBe(original.id);
  await finish(page, 360);
  const final = await state(page); expect(final.winner).toBe(1);
  const eliminated = await readSaved(page, TOURNAMENT_KEY); expect(eliminated.completed).toBe(true); expect(eliminated.eliminated).toBe(true);
  expect(eliminated.bracket.flat().every((match: any) => match.score && match.score[0] !== match.score[1])).toBe(true);
  await expect(page.locator('[data-next]')).not.toContainText('下一轮');
  await page.reload(); await expect(page.locator('[data-resume-tournament]')).toHaveCount(0);
  await page.locator('button[data-mode="championship"]').click();
  await page.locator('[data-bracket]').click(); await expect(page.locator('.bracket-match')).toHaveCount(15);
  expect(errors).toEqual([]);
});

test('a cup win advances to the real bracket winner and the next round survives reload', async ({ page }) => {
  test.setTimeout(90000);
  // Fix only the external clock used to seed games; the simulation remains observable and unmodified.
  await page.addInitScript(() => { Date.now = () => 4001; });
  await ready(page); await page.locator('#team-home').selectOption('gsw'); await page.locator('#team-away').selectOption('was');
  await page.locator('#difficulty').selectOption('rookie'); await page.locator('button[data-mode="championship"]').click();
  const played = await playByInputs(page, 380, 60, true);
  const cupBefore = played.initialTournament, completed = played.state;
  expect(completed.phase).toBe('finished'); expect(completed.winner, `seeded score: ${completed.score.join('–')}`).toBe(0);
  await page.waitForFunction(() => (window as any).__NBA.status().resultShown);
  await expect(page.locator('[data-next]')).toContainText('下一轮');
  const cupAfter = await readSaved(page, TOURNAMENT_KEY); expect(cupAfter.id).toBe(cupBefore.id); expect(cupAfter.round).toBe(2);
  expect(cupAfter.bracket[0].every((match: any) => match.score)).toBe(true);
  const fixture = cupAfter.bracket[1].find((match: any) => match.homeId === 'gsw' || match.awayId === 'gsw');
  const opponent = fixture.homeId === 'gsw' ? fixture.awayId : fixture.homeId;
  await page.locator('[data-next]').click(); await waitForPlay(page); expect((await state(page)).config.away.id).toBe(opponent);
  await page.reload(); await page.locator('[data-resume-tournament]').click(); await waitForPlay(page);
  expect((await state(page)).config.away.id).toBe(opponent); expect((await readSaved(page, TOURNAMENT_KEY)).round).toBe(2);
  await test.info().attach('cup-win-evidence', { body: JSON.stringify({ seed: completed.config.seed, score: completed.score, winner: completed.winner, nextRound: cupAfter.round, nextOpponent: opponent, restoredRound: (await readSaved(page, TOURNAMENT_KEY)).round }), contentType: 'application/json' });
});

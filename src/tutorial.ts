import type { GameState, Locale, PlayerState } from './types';
import { t, type TranslationKey } from './i18n';

export const TUTORIAL_STEPS = ['move', 'sprint', 'shoot', 'green', 'three'] as const;
export type TutorialStep = typeof TUTORIAL_STEPS[number];
interface Sample {
  elapsed: number; phase: GameState['phase']; id: number; x: number; z: number;
  stamina: number; attempts: number; made: number; threes: number; score: number;
}
interface PendingGreen { attempts: number; made: number; score: number; }
export interface TutorialTracker {
  step: number; distance: number; previous: Sample; baseline: Sample;
  pendingGreen: PendingGreen | null;
}

function player(state: GameState): PlayerState | undefined {
  return state.players.find(item => item.id === state.controlled && item.side === 0) ?? state.players.find(item => item.side === 0);
}
function sample(state: GameState): Sample {
  const p = player(state), own = state.players.filter(item => item.side === 0);
  return {
    elapsed: state.elapsed, phase: state.phase, id: p?.id ?? -1, x: p?.x ?? 0, z: p?.z ?? 0, stamina: p?.stamina ?? 100,
    attempts: own.reduce((sum, item) => sum + item.stats.fga, 0), made: own.reduce((sum, item) => sum + item.stats.fgm, 0),
    threes: own.reduce((sum, item) => sum + item.stats.tpm, 0), score: state.score[0],
  };
}
export function createTutorialTracker(state: GameState): TutorialTracker {
  const initial = sample(state);
  return {step: 0, distance: 0, previous: initial, baseline: initial, pendingGreen: null};
}

/** Observe actual gameplay. This function never changes the simulation or shot outcomes. */
export function advanceTutorial(tracker: TutorialTracker, state: GameState): TutorialTracker {
  const current = sample(state), previous = tracker.previous;
  const next: TutorialTracker = {...tracker, previous: current};
  if (tracker.step >= TUTORIAL_STEPS.length || state.config.mode !== 'practice') return next;
  const p = player(state), dt = current.elapsed - previous.elapsed;
  const travel = Math.hypot(current.x - previous.x, current.z - previous.z);
  const speed = p ? Math.hypot(p.vx, p.vz) : 0;
  const moving = p && previous.phase === 'playing' && current.phase === 'playing' && previous.id === current.id &&
    dt > 0 && dt <= .5 && travel > .001 && travel <= Math.max(.12, speed * dt * 1.6 + .06);
  let complete = false;
  if (tracker.step === 0 && moving) {
    next.distance = Math.min(5, tracker.distance + travel);
    complete = next.distance >= 5;
  } else if (tracker.step === 1 && moving) {
    const fatigue = .78 + Math.min(p.stamina, 45) / 45 * .22;
    const runningSpeed = (4.1 + p.athlete.speed * .022) * fatigue;
    if ((p.action === 'run' || p.action === 'idle') && p.stamina < previous.stamina && speed > runningSpeed * 1.12) {
      next.distance = Math.min(4, tracker.distance + travel);
      complete = next.distance >= 4;
    }
  } else if (tracker.step === 2) {
    complete = current.attempts > tracker.baseline.attempts;
  } else if (tracker.step === 3) {
    if (current.attempts > previous.attempts) next.pendingGreen = null;
    if (current.attempts > previous.attempts && state.ball.state === 'shot' && state.shotFeedback?.perfect &&
      state.players.find(item => item.id === state.ball.from)?.side === 0) {
      next.pendingGreen = {attempts: current.attempts, made: current.made, score: current.score};
    }
    const pending = next.pendingGreen;
    if (pending && current.attempts === pending.attempts) {
      complete = current.made > pending.made && current.score > pending.score;
      if (!complete && state.ball.state !== 'shot') next.pendingGreen = null;
    }
  } else if (tracker.step === 4) {
    complete = current.threes > tracker.baseline.threes && current.score > tracker.baseline.score;
  }
  if (complete) {
    next.step = tracker.step + 1; next.distance = 0; next.baseline = current; next.pendingGreen = null;
    // The first attempt may itself be a perfect release. Credit its later make, never its prediction.
    if (next.step === 3 && state.ball.state === 'shot' && state.shotFeedback?.perfect &&
      state.players.find(item => item.id === state.ball.from)?.side === 0) {
      next.pendingGreen = {attempts: current.attempts, made: current.made, score: current.score};
    }
  }
  return next;
}

const COMPLETED_KEY = 'nba-after-hours.tutorial.completed.v1';
let sessionCompleted = false;
export function hasCompletedTutorial(): boolean {
  if (sessionCompleted) return true;
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(COMPLETED_KEY) ?? 'null');
    return stored?.version === 1 && stored?.completed === true;
  } catch { return false; }
}
function saveCompletion(): void {
  sessionCompleted = true;
  try { globalThis.localStorage?.setItem(COMPLETED_KEY, JSON.stringify({version: 1, completed: true, completedAt: new Date().toISOString()})); } catch { /* Progress remains available for this session. */ }
}

export interface TutorialController {
  start(state: GameState, locale: Locale): void;
  update(state: GameState, locale: Locale): void;
  hide(): void;
  setVisible(visible: boolean): void;
  readonly active: boolean;
}
const stepTitle: TranslationKey[] = ['tutorialMove', 'tutorialSprint', 'tutorialShoot', 'tutorialGreen', 'tutorialThree'];
const stepDescription: TranslationKey[] = ['tutorialMoveHint', 'tutorialSprintHint', 'tutorialShootHint', 'tutorialGreenHint', 'tutorialThreeHint'];
const stepKeys = ['W A S D / ↑ ↓ ← →', 'SHIFT + W A S D', 'SPACE', 'SPACE · 0.7 s', 'A / ←  +  SPACE'];

export function createTutorial(root: HTMLElement = document.body): TutorialController {
  const panel = document.createElement('aside');
  panel.className = 'tutorial-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Tutorial');
  root.append(panel);
  let tracker: TutorialTracker | null = null, locale: Locale = 'zh', visible = false, signature = '', compact = false;
  const syncVisibility = (): void => {
    panel.hidden = !tracker || !visible;
    document.body.classList.toggle('tutorial-active', Boolean(tracker && visible));
  };
  const hide = (): void => { tracker = null; visible = false; signature = ''; syncVisibility(); };
  const render = (): void => {
    if (!tracker) return;
    const completed = tracker.step === TUTORIAL_STEPS.length;
    const nextSignature = `${tracker.step}:${locale}:${compact}`;
    if (signature !== nextSignature) {
      signature = nextSignature;
      const tr = (key: TranslationKey, vars?: Record<string, string | number>) => t(locale, key, vars);
      panel.setAttribute('aria-label', tr('tutorialTitle'));
      panel.classList.toggle('is-complete', completed); panel.classList.toggle('is-compact', compact);
      panel.innerHTML = `<div class="tutorial-top"><span>${tr('tutorialTitle')}</span><button type="button" data-compact aria-expanded="${!compact}" aria-label="${tr(compact ? 'tutorialExpand' : 'tutorialCollapse')}">${compact ? '+' : '−'}</button></div>
        <div class="tutorial-steps" aria-label="${tr('tutorialProgress', {n: Math.min(5, tracker.step + 1)})}">${TUTORIAL_STEPS.map((_, index) => `<span class="${index < tracker!.step ? 'done' : index === tracker!.step ? 'current' : ''}">${index < tracker!.step ? '✓' : index + 1}</span>`).join('')}</div>
        <div class="tutorial-detail"><p class="tutorial-counter">${completed ? tr('tutorialAllDone') : tr('tutorialProgress', {n: tracker.step + 1})}</p><h2 aria-live="polite">${tr(completed ? 'tutorialComplete' : stepTitle[tracker.step])}</h2><p class="tutorial-description">${tr(completed ? 'tutorialCompleteHint' : stepDescription[tracker.step])}</p>
        ${completed ? '<div class="tutorial-complete-mark" aria-hidden="true">✓</div>' : `<div class="tutorial-input"><kbd>${stepKeys[tracker.step]}</kbd><small>${tr(tracker.step === 1 ? 'tutorialPadSprint' : tracker.step === 0 ? 'tutorialPadMove' : 'tutorialPadShoot')}</small><strong class="tutorial-touch-hint">${tr(tracker.step === 1 ? 'tutorialTouchSprint' : tracker.step === 0 ? 'tutorialTouchMove' : 'tutorialTouchShoot')}</strong></div><div class="tutorial-task-progress"><span data-progress-label></span><div><i data-progress-bar></i></div></div>`}</div>
        <button type="button" class="tutorial-exit" data-exit>${tr(completed ? 'tutorialContinue' : 'tutorialSkip')}<span>↗</span></button>`;
      panel.querySelector('[data-compact]')?.addEventListener('click', event => { (event.currentTarget as HTMLButtonElement).blur(); compact = !compact; render(); });
      panel.querySelector('[data-exit]')?.addEventListener('click', event => { (event.currentTarget as HTMLButtonElement).blur(); hide(); });
    }
    if (!completed) {
      const movement = tracker.step < 2, goal = tracker.step === 0 ? 5 : 4;
      const progress = movement ? tracker.distance / goal : 0;
      const label = panel.querySelector<HTMLElement>('[data-progress-label]');
      if (label) label.textContent = movement ? t(locale, 'tutorialDistance', {n: tracker.distance.toFixed(1), goal}) : t(locale, tracker.pendingGreen ? 'tutorialWatchShot' : 'tutorialTryIt');
      panel.querySelector<HTMLElement>('[data-progress-bar]')?.style.setProperty('width', `${progress * 100}%`);
    }
  };
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.code === 'Space') && event.target instanceof HTMLButtonElement) event.stopPropagation(); });
  window.addEventListener('keydown', event => {
    if (!tracker || !visible || event.code !== 'Tab') return;
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault(); event.stopImmediatePropagation();
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }, true);
  return {
    get active() { return tracker !== null; },
    start(state, nextLocale) { tracker = createTutorialTracker(state); locale = nextLocale; visible = true; compact = false; signature = ''; render(); syncVisibility(); },
    update(state, nextLocale) {
      if (!tracker) return;
      const before = tracker.step;
      tracker = advanceTutorial(tracker, state); locale = nextLocale;
      if (before < 5 && tracker.step === 5) saveCompletion();
      render();
    },
    hide,
    setVisible(value) { visible = value; syncVisibility(); },
  };
}

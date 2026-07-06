(function(){
// FSRS-6 (Free Spaced Repetition Scheduler) — cœur pur, déterministe, number-only.
// Aucune I/O, aucun `Date` : les temps sont des ms epoch, les durées des jours.
// Réf. algo : open-spaced-repetition/ts-fsrs (packages/fsrs/src/algorithm.ts). Cf. ADR 0006/0007.

const FSRS6_DEFAULT_WEIGHTS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
  0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
  0.0912, 0.0658, 0.1542,
]);
const DEFAULT_RETENTION = 0.9;
const DAY_MS = 86400000;
const S_MIN = 0.001;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

function decayFactor(w) {
  const decay = -w[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return { decay, factor };
}

// Courbe d'oubli : rétention après `t` jours pour une stabilité `s`.
function forgettingCurve(w, t, s) {
  const { decay, factor } = decayFactor(w);
  return Math.pow(1 + (factor * t) / s, decay);
}

function intervalModifier(w, retention) {
  const { decay, factor } = decayFactor(w);
  return (Math.pow(retention, 1 / decay) - 1) / factor;
}

// Prochain intervalle en jours entiers, borné [1, 36500].
function nextInterval(w, s, retention = DEFAULT_RETENTION) {
  return clamp(Math.round(s * intervalModifier(w, retention)), 1, 36500);
}

function initStability(w, g) { return Math.max(w[g - 1], 0.1); }
function initDifficulty(w, g) { return w[4] - Math.exp((g - 1) * w[5]) + 1; }
function linearDamping(deltaD, d) { return (deltaD * (10 - d)) / 9; }
function meanReversion(w, init, current) { return w[7] * init + (1 - w[7]) * current; }

function nextDifficulty(w, d, g) {
  const deltaD = -w[6] * (g - 3);
  const nextD = d + linearDamping(deltaD, d);
  // init_difficulty(4) NON borné dans la réversion (fidèle à la réf.).
  return clamp(meanReversion(w, initDifficulty(w, 4), nextD), 1, 10);
}

function nextRecallStability(w, d, s, r, g) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return clamp(
    s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard * easy),
    S_MIN, 36500,
  );
}

function nextForgetStability(w, d, s, r) {
  return clamp(
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
    S_MIN, 36500,
  );
}

function nextShortTermStability(w, s, g) {
  const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
  const masked = g >= 2 ? Math.max(sinc, 1) : sinc;
  return clamp(s * masked, S_MIN, 36500);
}

// Transition mémoire FSRS-6. `mem` = {stability, difficulty} ou null (carte neuve).
// `elapsedDays` = jours depuis la dernière révision. `g` = 1..4.
function nextState(w, mem, elapsedDays, g, enableShortTerm = true) {
  if (!mem) {
    return { difficulty: clamp(initDifficulty(w, g), 1, 10), stability: initStability(w, g) };
  }
  const { difficulty: d, stability: s } = mem;
  const r = forgettingCurve(w, elapsedDays, s);
  let newS;
  if (elapsedDays === 0 && enableShortTerm) {
    newS = nextShortTermStability(w, s, g);
  } else if (g === 1) {
    const sAfterFail = nextForgetStability(w, d, s, r);
    const w17 = enableShortTerm ? w[17] : 0;
    const w18 = enableShortTerm ? w[18] : 0;
    newS = clamp(s / Math.exp(w17 * w18), S_MIN, sAfterFail);
  } else {
    newS = nextRecallStability(w, d, s, r, g);
  }
  return { difficulty: nextDifficulty(w, d, g), stability: newS };
}

// Ordonnanceur orienté renderer. Pur : `nowMs` injecté.
// `prev` = état stocké précédent ; null OU sans `stability` numérique ⇒ carte neuve (couvre les stubs migrés).
function schedule(prev, grade, nowMs) {
  const w = FSRS6_DEFAULT_WEIGHTS;
  const retention = DEFAULT_RETENTION;
  const enableShortTerm = true;
  const hasMemory = prev && typeof prev.stability === 'number' && prev.stability >= S_MIN
    && typeof prev.difficulty === 'number' && prev.difficulty >= 1;
  let t = 0;
  if (hasMemory && typeof prev.last_review === 'number') {
    t = Math.max(0, (nowMs - prev.last_review) / DAY_MS);
  }
  const mem = hasMemory ? { stability: prev.stability, difficulty: prev.difficulty } : null;
  const next = nextState(w, mem, t, grade, enableShortTerm);
  const interval = nextInterval(w, next.stability, retention);
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    reps: ((prev && prev.reps) || 0) + 1,
    lapses: ((prev && prev.lapses) || 0) + (hasMemory && grade === 1 ? 1 : 0),
    last_review: nowMs,
    due: nowMs + interval * DAY_MS,
    interval,
  };
}

// Une carte est due s'il n'y a pas d'état, pas d'échéance numérique, ou échéance dépassée.
function isDue(state, nowMs) {
  return !state || typeof state.due !== 'number' || state.due <= nowMs;
}

window.FSRS={schedule,isDue};
})();

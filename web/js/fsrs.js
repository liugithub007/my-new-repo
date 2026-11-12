// FSRS-5 记忆模型 + 复习日期的“削峰填谷”。纯函数，无 DOM 依赖。
export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const F = 19 / 81, C = -0.5;
export const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const retrievability = (t, S) => S > 0 ? Math.pow(1 + F * t / S, C) : 0;
const D0 = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
const nextD = (D, g) => { const dp = D - W[6] * (g - 3) * (10 - D) / 9; return clamp(W[7] * D0(4) + (1 - W[7]) * dp, 1, 10); };
const sRecall = (D, S, R, g) => S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
const sForget = (D, S, R) => Math.min(S, W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
const sShort = (S, g) => S * Math.exp(W[17] * (g - 3 + W[18]));
export const idealInterval = (S, retention) => S / F * (Math.pow(retention, 1 / C) - 1);

export const newCard = () => ({ st: 0, s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0 });
// st: 0 新词  1 学习中  2 复习  3 重学

/**
 * 计算四个评分（1 忘了 2 模糊 3 记得 4 简单）各自的下一状态。
 * ctx: { retention, maxIvl, pickDay?(idealDays, minDays, maxDays) -> days }
 * pickDay 用于削峰：在允许范围内挑负载最小的一天。
 */
export function outcomes(card, now, ctx) {
  const ret = ctx.retention || 0.9, maxIvl = ctx.maxIvl || 3650;
  const base = Object.assign({}, card, { last: now, reps: card.reps + 1 });
  const ivl = S => clamp(Math.round(idealInterval(S, ret)), 1, maxIvl);
  const out = [];
  if (card.st === 0) {
    for (let g = 1; g <= 4; g++) {
      const c = Object.assign({}, base, { s: W[g - 1], d: D0(g) });
      if (g < 4) { c.st = 1; c.due = now + [1, 5, 10][g - 1] * MIN; c.ivl = 0; }
      else { c.st = 2; c.ivl = ivl(c.s); }
      out.push(c);
    }
  } else {
    const elapsed = Math.max(0, (now - card.last) / DAY);
    const learning = card.st === 1 || card.st === 3;
    if (learning || elapsed < 1) {
      for (let g = 1; g <= 4; g++) {
        const c = Object.assign({}, base, { s: Math.max(0.1, sShort(card.s, g)), d: nextD(card.d, g), ivl: 0 });
        if (g === 1) { c.due = now + (learning ? 5 : 10) * MIN; if (!learning) { c.st = 3; c.lapses = card.lapses + 1; } }
        else if (g === 2 && learning) c.due = now + 10 * MIN;
        else { c.st = 2; c.ivl = ivl(c.s); }
        out.push(c);
      }
    } else {
      const R = retrievability(elapsed, card.s);
      out.push(Object.assign({}, base, { s: sForget(card.d, card.s, R), d: nextD(card.d, 1), st: 3, due: now + 10 * MIN, lapses: card.lapses + 1, ivl: 0 }));
      for (let g = 2; g <= 4; g++) {
        const c = Object.assign({}, base, { s: sRecall(card.d, card.s, R, g), d: nextD(card.d, g), st: 2 });
        c.ivl = ivl(c.s); out.push(c);
      }
    }
  }
  // 保证 模糊 ≤ 记得 < 简单
  const rv = out.map(c => c.ivl || 0);
  if (rv[1] && rv[2] && rv[1] > rv[2]) out[1].ivl = rv[2];
  if (rv[2] && rv[3] && rv[3] <= rv[2]) out[3].ivl = Math.min(maxIvl, rv[2] + 1);
  for (const c of out) {
    if (c.ivl) {
      let days = c.ivl;
      if (ctx.pickDay && days >= 3) {
        const spread = days < 8 ? 1 : Math.max(1, Math.round(days * 0.06));
        days = ctx.pickDay(days, Math.max(2, days - spread), Math.min(maxIvl, days + spread));
      }
      c.ivl = days;
      c.due = now + days * DAY;
    }
  }
  return out;
}

/** 预计一个新词在接下来一年里平均要复习几次（蒙特卡洛，用于计算可持续的新词速度）。 */
const expCache = new Map();
export function expectedReviewsPerNewWord(retention, horizonDays = 365) {
  const key = retention.toFixed(3) + ':' + horizonDays;
  if (expCache.has(key)) return expCache.get(key);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const N = 1500; let total = 0, t0 = 0;
  for (let i = 0; i < N; i++) {
    let card = newCard(), now = t0;
    // 第一次见：多数人先“不认识”，走学习步骤
    let g = rnd() < 0.6 ? 1 : 3;
    card = outcomes(card, now, { retention })[g - 1];
    let reviews = 0, guard = 0;
    while (guard++ < 60) {
      now = card.due; if (now - t0 > horizonDays * DAY) break;
      const elapsed = (now - card.last) / DAY;
      const r = card.st === 2 ? retrievability(elapsed, card.s) : 0.85;
      g = rnd() < r ? 3 : 1;
      card = outcomes(card, now, { retention })[g - 1];
      if (now - t0 >= DAY * 0.9) reviews++;   // 当天的学习步骤算在新词本身的时间里
    }
    total += reviews;
  }
  const v = total / N;
  expCache.set(key, v);
  return v;
}

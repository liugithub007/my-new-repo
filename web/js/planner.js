// 每日学习计划：按时间预算安排复习，按“可持续速度”放新词，积压时自动分摊。纯逻辑，无 DOM。
import { outcomes, retrievability, expectedReviewsPerNewWord, newCard, clamp, DAY, HOUR, MIN } from './fsrs.js';

export const ROLL = 4 * HOUR;                      // 每天从凌晨 4 点算起
export function dayIdx(ts) { const d = new Date(ts - ROLL); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
export function dayKey(ts) { const d = new Date(ts - ROLL); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function dayEnd(ts) { const d = new Date(ts - ROLL); d.setHours(0, 0, 0, 0); return d.getTime() + DAY + ROLL; }
export function dayStart(ts) { return dayEnd(ts) - DAY; }

export const DEFAULT_TIMING = { rev: 8, nw: 28 };   // 秒：复习一张卡、学会一个新词（含当天的重复）

function segs(zh) {
  return new Set(String(zh || '').split('\n')[0].replace(/^[a-z]+\.\s*/i, '').split(/[，,；;、\s]+/).map(s => s.trim()).filter(s => s.length >= 2));
}
function similarForm(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4)) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0, j = 0, diff = 0;          // 编辑距离是否 ≤ 1
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
/** 两个词是否容易互相干扰（形近或意思相同），这种词不放在同一天学。 */
export function interferes(a, zhA, b, zhB) {
  if (similarForm(a, b)) return true;
  const sa = segs(zhA), sb = segs(zhB);
  for (const x of sa) if (sb.has(x)) return true;
  return false;
}

export class Planner {
  /**
   * state: { cards:{word:{r,s}}, known:{word:ts}, settings, timing, log }
   * env:   { order(): 新词候选（按学习顺序的词数组）, zh(word): 中文释义 }
   */
  constructor(state, env) { this.state = state; this.env = env; this.rebuildLoad(); }

  get S() { return this.state.settings; }
  timing() { return Object.assign({}, DEFAULT_TIMING, this.state.timing || {}); }
  todayLog(now) { const k = dayKey(now); const L = this.state.log; return L[k] || (L[k] = { rev: 0, ok: 0, rv: 0, nw: 0, ms: 0, extra: 0, words: [] }); }
  kinds() { return ['r']; }   // 不做拼写练习

  rebuildLoad() {
    const load = new Map();
    for (const w in this.state.cards) for (const k of this.kinds()) {
      const c = this.state.cards[w][k];
      if (c && c.st === 2) { const d = dayIdx(c.due); load.set(d, (load.get(d) || 0) + 1); }
    }
    this.load = load;
  }
  addLoad(ts, n) { const d = dayIdx(ts); this.load.set(d, Math.max(0, (this.load.get(d) || 0) + n)); }

  /** 每天能做的复习卡数（按时间预算和实际答题速度）。 */
  capacity() { const t = this.timing(); return Math.max(10, Math.floor(this.S.minutes * 60 / t.rev)); }
  /** 可持续的新词速度：长期每天学这么多，复习量刚好填满时间预算。 */
  sustainableNew() {
    const t = this.timing(), k = expectedReviewsPerNewWord(this.S.retention);
    return this.S.minutes * 60 / (k * t.rev + t.nw);
  }
  forecast(now, days = 14) {
    const t0 = dayIdx(now), out = [];
    for (let i = 0; i < days; i++) out.push(this.load.get(t0 + i) || 0);
    return out;
  }

  pickDayFn(now) {
    const t0 = dayIdx(now);
    return (ideal, lo, hi) => {
      let best = ideal, bestLoad = Infinity;
      for (let d = lo; d <= hi; d++) {
        const l = (this.load.get(t0 + d) || 0) + Math.abs(d - ideal) * 0.5;   // 轻微偏向理想日期
        if (l < bestLoad) { bestLoad = l; best = d; }
      }
      return best;
    };
  }

  /** 今天的完整计划。 */
  plan(now) {
    const S = this.S, lg = this.todayLog(now), end = dayEnd(now), start = end - DAY;
    const learnNow = [], learnSoon = [], due = [], spellNew = [];
    for (const w in this.state.cards) for (const k of this.kinds()) {
      const c = this.state.cards[w][k]; if (!c) continue;
      const it = { w, k, c };
      if (c.st === 1 || c.st === 3) { if (c.due <= now) learnNow.push(it); else if (c.due <= now + 20 * MIN) learnSoon.push(it); }
      else if (c.st === 2) { if (c.due < end) due.push(it); }
      else if (k === 's') spellNew.push(it);
    }
    learnNow.sort((a, b) => a.c.due - b.c.due); learnSoon.sort((a, b) => a.c.due - b.c.due);
    const cap = this.capacity();
    const capLeft = Math.max(0, cap - lg.rv);
    const R = it => retrievability((now - it.c.last) / DAY, it.c.s);
    const overloaded = due.length > capLeft;
    // 积压时优先复习还没忘的词（每次复习收获最大）；不积压时先复习最容易忘的
    due.sort(overloaded ? (a, b) => R(b) - R(a) : (a, b) => R(a) - R(b));
    const reviews = due.slice(0, capLeft), deferred = due.length - reviews.length;
    const overdue = due.filter(it => it.c.due < start).length;

    // 新词配额
    const sustain = this.sustainableNew();
    const fc = this.forecast(now + DAY, 7), avg7 = fc.reduce((a, b) => a + b, 0) / fc.length;
    const ratio = avg7 / cap;
    let base = S.newMode === 'fixed' ? S.newPerDay : Math.round(sustain);
    let factor = 1, reason = '';
    if (deferred > 0) { factor = 0; reason = 'backlog'; }
    else if (ratio > 1) { factor = 0; reason = 'heavy'; }
    else if (ratio > 0.85) { factor = 0.5; reason = 'busy'; }
    else if (S.newMode !== 'fixed' && ratio < 0.4) factor = 1.25;
    let quota = Math.round(base * factor) + (lg.extra || 0) - lg.nw;
    if (S.newMode !== 'fixed') {
      const t = this.timing();
      const leftSec = S.minutes * 60 - (reviews.length + learnNow.length + learnSoon.length) * t.rev - lg.nw * t.nw;
      quota = Math.min(quota, Math.floor(leftSec / t.nw) + (lg.extra || 0));
    }
    quota = Math.max(0, quota);
    const newWords = quota ? this.pickNew(quota, lg.words || []) : [];
    const spell = spellNew.slice(0, Math.max(0, Math.round(base) - (lg.sp || 0)));
    const t = this.timing();
    const estMin = Math.max(0, Math.round(((reviews.length + learnNow.length + learnSoon.length + spell.length) * t.rev + newWords.length * t.nw) / 60));
    return { learnNow, learnSoon, reviews, deferred, overdue, newWords, spell, quota, sustain, cap, capLeft, ratio, reason, estMin, done: lg };
  }

  /** 从词书里挑新词：跳过已学、已认识的词，同一天避开形近或意思相同的词。 */
  pickNew(n, todayWords) {
    const out = [], recent = todayWords.slice(-40).map(w => [w, this.env.zh(w)]);
    const skipped = [];
    for (const w of this.env.order()) {
      if (out.length >= n) break;
      if (this.state.cards[w] || this.state.known[w]) continue;
      const zh = this.env.zh(w);
      if (!zh) continue;   // 词典里没有释义的词不出题
      if ([...recent, ...out.map(x => [x, this.env.zh(x)])].some(([o, oz]) => interferes(w, zh, o, oz))) { skipped.push(w); if (skipped.length > 60) break; continue; }
      out.push(w);
    }
    return out;
  }

  /** 一次答题。返回撤销记录。 */
  grade(w, k, g, now, ms) {
    const cards = this.state.cards, lg = this.todayLog(now), S = this.S;
    const before = { entry: cards[w] && cards[w].r ? JSON.parse(JSON.stringify(cards[w])) : null, log: JSON.parse(JSON.stringify(lg)), timing: Object.assign({}, this.state.timing) };
    const entry = cards[w] || (cards[w] = {});
    const card = entry[k] || newCard();
    const nc = outcomes(card, now, { retention: S.retention, maxIvl: S.maxIvl || 3650, pickDay: this.pickDayFn(now) })[g - 1];
    delete nc.ivl;
    if (card.st === 2) this.addLoad(card.due, -1);
    if (nc.st === 2) this.addLoad(nc.due, +1);
    entry[k] = nc;
    if (!entry.t) entry.t = now;
    lg.rev++; if (g > 1 || card.st === 0) lg.ok++; lg.ms += Math.min(ms || 0, 60000);
    const sec = clamp((ms || 8000) / 1000, 2, 60), tm = this.state.timing || (this.state.timing = {});
    if (card.st === 0) {
      if (k === 'r') { lg.nw++; (lg.words || (lg.words = [])).push(w); tm.nw = (tm.nw || DEFAULT_TIMING.nw) * 0.9 + clamp(sec * 2.5, 10, 120) * 0.1; }
      else lg.sp = (lg.sp || 0) + 1;
    } else if (card.st === 2) { lg.rv++; tm.rev = (tm.rev || DEFAULT_TIMING.rev) * 0.95 + sec * 0.05; }
    if (nc.lapses >= 8) entry.leech = 1;
    return { w, before, day: dayKey(now) };
  }
  markKnown(w, now) {
    const before = { entry: this.state.cards[w] ? JSON.parse(JSON.stringify(this.state.cards[w])) : null, known: this.state.known[w] || 0 };
    const e = this.state.cards[w];
    if (e) { for (const k of ['r', 's']) if (e[k] && e[k].st === 2) this.addLoad(e[k].due, -1); delete this.state.cards[w]; }
    this.state.known[w] = now;
    return { w, before, known: true };
  }
  undo(rec) {
    const { w, before } = rec;
    const cur = this.state.cards[w];
    if (cur) for (const k of ['r', 's']) if (cur[k] && cur[k].st === 2) this.addLoad(cur[k].due, -1);
    if (rec.known) { if (before.known) this.state.known[w] = before.known; else delete this.state.known[w]; }
    if (before.entry) { this.state.cards[w] = before.entry; for (const k of ['r', 's']) { const c = before.entry[k]; if (c && c.st === 2) this.addLoad(c.due, +1); } }
    else delete this.state.cards[w];
    if (before.log && rec.day) this.state.log[rec.day] = before.log;
    if (before.timing) this.state.timing = before.timing;
  }
}

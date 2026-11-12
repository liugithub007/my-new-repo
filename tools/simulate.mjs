// 模拟用户长期使用，检验复习量是否稳定在时间预算内（不产生“单词债”）。
// 用法：node tools/simulate.mjs [auto|fixed30] [minutes]
import { readFileSync } from 'node:fs';
import { Planner, dayKey } from '../web/js/planner.js';
import { retrievability, DAY, HOUR } from '../web/js/fsrs.js';

const mode = process.argv[2] || 'auto', minutes = +(process.argv[3] || 20);
const dict = JSON.parse(readFileSync(new URL('../web/data/dict.json', import.meta.url)));
const CET4 = 1 << 2;
const words = dict.words.filter(w => w[4] & CET4).map(w => w[0]);
const zh = new Map(dict.words.map(w => [w[0], w[2]]));
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const state = { cards: {}, known: {}, log: {}, timing: {},
  settings: { minutes, retention: 0.9, newMode: mode === 'auto' ? 'auto' : 'fixed', newPerDay: 30, spelling: false } };
if (mode === 'naive') state.settings.newMode = 'naive';
const P = new Planner(state, { order: () => words, zh: w => zh.get(w) });
if (mode === 'naive') {   // 对照组：传统做法，每天固定 30 个新词，到期的全部要复习
  P.plan = function (now) {
    const p = Planner.prototype.plan.call(this, now);
    const all = [];
    for (const w in this.state.cards) { const c = this.state.cards[w].r; if (c && c.st === 2 && c.due < now + 12 * HOUR) all.push({ w, k: 'r', c }); }
    p.reviews = all; p.deferred = 0;
    const lg = this.todayLog(now); p.newWords = this.pickNew(Math.max(0, 30 - lg.nw), lg.words || []);
    return p;
  };
}
const t0 = new Date(2026, 0, 1, 20, 0, 0).getTime();
const rows = [];
for (let day = 0; day < 180; day++) {
  let now = t0 + day * DAY;
  const away = day >= 60 && day < 67;
  if (away) { rows.push({ day, away: true }); continue; }
  let sec = 0, answers = 0, guard = 0, first = null;
  while (guard++ < 3000) {
    const p = P.plan(now);
    if (!first) first = p;
    let it = p.learnNow[0] || p.reviews[0] || (p.newWords[0] && { w: p.newWords[0], k: 'r', c: null }) || p.learnSoon[0];
    if (!it) break;
    if (it === p.learnSoon[0]) now = it.c.due;
    const c = it.c;
    let ok;
    if (!c || c.st === 0) ok = rnd() < 0.35;                       // 第一次见能认出来的概率
    else if (c.st === 2) ok = rnd() < retrievability((now - c.last) / DAY, c.s);
    else ok = rnd() < 0.8;
    const ms = (!c || c.st === 0) ? 15000 : 8000;
    P.grade(it.w, it.k, ok ? 3 : 1, now, ms);
    now += ms; sec += ms / 1000; answers++;
  }
  const lg = state.log[dayKey(t0 + day * DAY)] || {};
  rows.push({ day, min: +(sec / 60).toFixed(1), rv: lg.rv || 0, nw: lg.nw || 0, deferred: first ? first.deferred : 0, cards: Object.keys(state.cards).length });
}
const act = rows.filter(r => !r.away);
const pick = d => rows[d];
console.log(`模式=${mode} 每天=${minutes}分钟`);
for (const d of [0, 7, 14, 30, 45, 59, 67, 68, 70, 75, 90, 120, 150, 179]) console.log(JSON.stringify(pick(d)));
const mins = act.map(r => r.min);
console.log('平均每天分钟', (mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(1), '最多', Math.max(...mins), '超过预算1.5倍的天数', mins.filter(m => m > minutes * 1.5).length);
console.log('180天后已学词数', act[act.length - 1].cards);
let retained = 0; const end = t0 + 180 * DAY;
for (const w in state.cards) { const c = state.cards[w].r; if (c.st === 2) retained += retrievability((end - c.last) / DAY, c.s); }
console.log('180天末预计还记得的词', Math.round(retained));

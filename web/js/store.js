// 学习进度的本地存储（localStorage），含旧版本迁移。
export const LS_KEY = 'shici.v3';
export const DEFAULT_SETTINGS = {
  book: 'cet4',          // 当前词书
  minutes: 20,           // 每天学习时间预算
  newMode: 'auto',       // auto：按可持续速度；fixed：固定数量
  newPerDay: 15,
  retention: 0.9,        // 目标记忆保持率
  spelling: false,       // 拼写练习（会增加复习量）
  listenFront: false,    // 复习时正面只放发音
  askKnown: true,        // 新词先问“认识吗”
  autoSpeak: true,
  accent: 'en-US',
  rate: 0.95,
  reminder: { on: false, h: 20, m: 30 },
  theme: 'system',
};

export function freshState() {
  return { v: 3, created: Date.now(), updatedAt: 0, onboarded: false,
    settings: Object.assign({}, DEFAULT_SETTINGS), cards: {}, known: {}, mine: [], notes: {},
    log: {}, timing: {}, read: {}, papers: {}, examDone: {}, vocabEst: 0, lastExport: 0 };
}

export function normalize(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.v !== 3) s = migrate(s);
  if (!s) return null;
  const f = freshState();
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
  s.settings.spelling = false;
  s.settings.reminder = Object.assign({}, DEFAULT_SETTINGS.reminder, s.settings.reminder || {});
  if (!Array.isArray(s.mine)) s.mine = [];
  for (const w of Object.keys(s.cards)) { const e = s.cards[w]; if (!e || !e.r || typeof e.r.due !== 'number') delete s.cards[w]; }
  return s;
}

/** 1.x 版本（shici.v2）的进度迁移到 2.0：保留每个词的复习记录、笔记和学习日志。 */
export function migrate(old) {
  if (!old || !Array.isArray(old.words)) return null;
  const s = freshState();
  s.created = old.created || Date.now();
  s.onboarded = true;
  s.settings.book = 'cet6';
  if (old.settings) {
    s.settings.retention = old.settings.retention || 0.9;
    s.settings.autoSpeak = old.settings.autoSpeak !== false;
    s.settings.accent = old.settings.accent || 'en-US';
    s.settings.rate = old.settings.rate || 0.95;
  }
  for (const w of old.words) {
    if (!w || !w.w) continue;
    if (w.r && w.r.reps > 0) {
      const e = { r: pick(w.r) };
      if (w.s && w.s.reps > 0) e.s = pick(w.s);
      if (w.leech) e.leech = 1;
      e.t = w.r.last || Date.now();
      s.cards[w.w] = e;
    }
    if (w.note) s.notes[w.w] = w.note;
  }
  for (const [day, l] of Object.entries(old.log || {})) {
    s.log[day] = { rev: l.rev || 0, ok: l.ok || 0, rv: Math.max(0, (l.rev || 0) - (l.newc || 0)), nw: l.newc || 0, ms: l.ms || 0, extra: 0, words: [] };
  }
  s.read = {};
  for (const k of Object.keys(old.unitRead || {})) s.read[k] = old.unitRead[k];
  s.updatedAt = old.updatedAt || Date.now();
  return s;
}
const pick = c => ({ st: c.st, s: c.s, d: c.d, due: c.due, last: c.last, reps: c.reps, lapses: c.lapses || 0 });

export function load() {
  let s = null;
  try { s = normalize(JSON.parse(localStorage.getItem(LS_KEY) || 'null')); } catch (e) {}
  if (!s) {
    try { s = normalize(JSON.parse(localStorage.getItem('shici.v2') || 'null')); } catch (e) {}
    if (s) s.migratedFrom = 'v2';
  }
  return s || freshState();
}

let saveOK = true;
export function save(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); saveOK = true; }
  catch (e) { saveOK = false; }
  return saveOK;
}
export const lastSaveOK = () => saveOK;

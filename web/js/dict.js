// 词典与词书：ECDICT 打底（释义、音标、词频、考试标签），手写内容（记忆法、例句）叠加。
export const BOOKS = [
  { id: 'zk', name: '中考', full: '中考英语', desc: '初中课标核心词汇', base: null },
  { id: 'gk', name: '高考', full: '高考英语', desc: '高中课标词汇', base: ['zk'] },
  { id: 'cet4', name: '四级', full: '大学英语四级', desc: '大学英语四级考试词汇', base: ['zk', 'gk'] },
  { id: 'cet6', name: '六级', full: '大学英语六级', desc: '大学英语六级考试词汇', base: ['zk', 'gk', 'cet4'] },
  { id: 'ky', name: '考研', full: '考研英语', desc: '全国硕士研究生招生考试英语大纲词汇', base: ['zk', 'gk', 'cet4'] },
  { id: 'ielts', name: '雅思', full: '雅思 IELTS', desc: '雅思考试常见词汇', base: ['zk', 'gk', 'cet4'] },
  { id: 'toefl', name: '托福', full: '托福 TOEFL', desc: '托福考试常见词汇', base: ['zk', 'gk', 'cet4'] },
  { id: 'gre', name: 'GRE', full: 'GRE', desc: '美国研究生入学考试高阶词汇', base: ['zk', 'gk', 'cet4', 'cet6'] },
];
export const bookById = id => BOOKS.find(b => b.id === id) || BOOKS[2];

let D = null;                 // 原始数据
const idx = new Map();        // 小写词 → 条目
const extra = new Map();      // 小写词 → 简短释义（阅读用）
let content = { words: {}, stories: [], articles: [], phrases: {}, gloss: {} };
const bookCache = new Map();
let BIT = {};

const cleanPh = p => String(p || '').replace(/'/g, 'ˈ').replace(/:/g, 'ː').replace(/ә/g, 'ə').replace(/є/g, 'e').replace(/[\\^]/g, '');
export async function loadDict(base = 'data/') {
  const [d, c] = await Promise.all([
    fetch(base + 'dict.json').then(r => { if (!r.ok) throw new Error('词典加载失败'); return r.json(); }),
    fetch(base + 'content.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  D = d; if (c) content = c;
  BIT = Object.fromEntries(D.tags.map((t, i) => [t, 1 << i]));
  D.words.forEach((a, i) => idx.set(a[0].toLowerCase(), { w: a[0], ph: cleanPh(a[1]), zh: a[2], rank: a[3], mask: a[4], star: a[5], i }));
  for (const [w, zh] of D.extra) if (!idx.has(w)) extra.set(w, zh);
  // 手写内容里有、词典里没有的词，补成条目
  for (const [w, c2] of Object.entries(content.words || {})) {
    if (!idx.has(w.toLowerCase())) idx.set(w.toLowerCase(), { w, ph: cleanPh(c2.ipa), zh: c2.zh || '', rank: 99999, mask: 0, star: 0, i: 1e6 });
  }
  return true;
}
export const ready = () => !!D;
export const getContent = () => content;

/** 条目：{ w, ph, zh, rank, mask, star, c(手写内容) } */
export function entry(w) {
  if (!w) return null;
  const e = idx.get(String(w).toLowerCase());
  if (!e) return null;
  const c = content.words[e.w];
  if (c) return Object.assign({}, e, { c, ph: c.ipa ? cleanPh(c.ipa) : e.ph });
  return e;
}
export const zhOf = w => { const e = entry(w); return e ? e.zh : ''; };
export const inBook = (e, bookId) => !!(e && (e.mask & (BIT[bookId] || 0)));
export function tagsOf(e) { return BOOKS.filter(b => e && (e.mask & (BIT[b.id] || 0))).map(b => b.name); }

/** 词书的学习顺序：本级新增的词按词频在前，与下一级重叠的基础词放最后。 */
export function bookWords(bookId) {
  if (bookCache.has(bookId)) return bookCache.get(bookId);
  const bit = BIT[bookId] || 0, b = bookById(bookId), baseBit = (b.base || []).reduce((m, t) => m | (BIT[t] || 0), 0);
  const all = D.words.filter(a => (a[4] & bit) && /^[a-z]/.test(a[0]));   // 去掉人名、地名、缩写
  // 词典的考试标签不全（如 best、center 没标中考），所以最常用的 1500 词也算基础词
  const isBasic = a => baseBit && ((a[4] & baseBit) || a[3] <= 1500);
  const fresh = all.filter(a => !isBasic(a)).map(a => a[0]);
  const basic = all.filter(isBasic).map(a => a[0]);
  const out = { order: all.map(a => a[0]), byRank: all.map(a => a[0]), freshCount: fresh.length, total: all.length };
  bookCache.set(bookId, out);
  return out;
}

/** 全部考试词汇按词频排序（词汇量测试用） */
let examCache = null;
export function examWordsByRank() {
  if (!examCache) examCache = D.words.filter(a => a[4] && /^[a-z]/.test(a[0])).map(a => a[0]);
  return examCache;
}

const SUF_RULES = [['ies', 'y'], ['ied', 'y'], ['ier', 'y'], ['iest', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['d', ''], ['ing', ''], ['ing', 'e'], ['er', ''], ['est', ''], ['ly', ''], ["'s", ''], ["'", '']];
/** 文中词形 → 词典里的原形（went→go, studies→study）。 */
export function lemma(tok) {
  const l = String(tok).toLowerCase().replace(/’/g, "'");
  if (idx.has(l)) return idx.get(l).w;
  if (D && D.forms[l]) return D.forms[l];
  for (const [a, b] of SUF_RULES) {
    if (l.endsWith(a) && l.length > a.length + 2) {
      let base = l.slice(0, -a.length) + b;
      if (idx.has(base)) return idx.get(base).w;
      if (/(.)\1$/.test(base) && idx.has(base.slice(0, -1))) return idx.get(base.slice(0, -1)).w;
    }
  }
  return null;
}
export function glossOf(tok) {
  const l = String(tok).toLowerCase().replace(/’/g, "'");
  const lw = lemma(l);
  if (lw) { const e = entry(lw); return { w: e.w, ph: e.ph, zh: e.zh, e }; }
  const ex = extra.get(l) || extra.get(l.replace(/(s|es|ed|ing|'s)$/, ''));
  if (ex) return { w: l, ph: '', zh: ex };
  const g = content.gloss && (content.gloss[l] || content.gloss[l.replace(/'s$/, '')]);
  if (g) return { w: l, ph: '', zh: g };
  return null;
}
export const phraseGloss = key => (content.phrases || {})[key] || '';

export function search(q, limit = 30) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const out = [], seen = new Set();
  const push = e => { if (e && !seen.has(e.w)) { seen.add(e.w); out.push(e); } };
  if (/^[a-z' -]+$/.test(q)) {
    push(idx.get(q));
    const lw = lemma(q); if (lw) push(entry(lw));
    for (const [k, e] of idx) { if (out.length >= limit) break; if (k.startsWith(q)) push(e); }
    for (const [k, zh] of extra) { if (out.length >= limit) break; if (k.startsWith(q) && !seen.has(k)) { seen.add(k); out.push({ w: k, ph: '', zh, rank: 99999, mask: 0, star: 0, extraOnly: true }); } }
  } else {
    for (const e of idx.values()) { if (out.length >= limit) break; if (e.zh.includes(q)) push(e); }
  }
  return out.map(e => e.extraOnly ? e : entry(e.w));
}

// ---------- 构词分析（只在派生词和原词意思相关时才显示，避免牵强附会） ----------
const PREFIX = [['un', '不；相反'], ['non', '非'], ['dis', '不；相反'], ['mis', '错误地'], ['in', '不；向内'], ['im', '不；向内'], ['il', '不'], ['ir', '不'],
  ['re', '再；回'], ['pre', '预先'], ['post', '之后'], ['over', '过度；在上'], ['under', '不足；在下'], ['inter', '在…之间'], ['super', '超'], ['sub', '在下；次'],
  ['anti', '反对'], ['co', '共同'], ['de', '去除；向下'], ['en', '使'], ['em', '使'], ['ex', '向外；前任'], ['fore', '预先；前'], ['out', '超过；向外'],
  ['semi', '半'], ['multi', '多'], ['micro', '微'], ['tele', '远'], ['auto', '自己；自动'], ['trans', '跨越'], ['self', '自己']];
const SUFFIX = [['ness', 'n.', '性质、状态'], ['ment', 'n.', '行为、结果'], ['tion', 'n.', '行为、结果'], ['ation', 'n.', '行为、结果'], ['sion', 'n.', '行为、结果'],
  ['ity', 'n.', '性质'], ['ance', 'n.', '性质、行为'], ['ence', 'n.', '性质、行为'], ['er', 'n.', '做…的人/物'], ['or', 'n.', '做…的人/物'], ['ist', 'n.', '…者'],
  ['ism', 'n.', '主义、行为'], ['ship', 'n.', '关系、身份'], ['hood', 'n.', '时期、状态'], ['dom', 'n.', '领域、状态'], ['ful', 'adj.', '充满…的'], ['less', 'adj.', '没有…的'],
  ['able', 'adj.', '能…的'], ['ible', 'adj.', '能…的'], ['ous', 'adj.', '具有…的'], ['ive', 'adj.', '有…性质的'], ['al', 'adj.', '…的'], ['ic', 'adj.', '…的'],
  ['ical', 'adj.', '…的'], ['ly', 'adv.', '…地'], ['ize', 'v.', '使…化'], ['ise', 'v.', '使…化'], ['ify', 'v.', '使…化'], ['en', 'v.', '使变得'], ['ward', 'adv.', '向…'], ['y', 'adj.', '有…的']];
const COMMON = new Set('的地使者性人化了是一不有于为可能物等之以和或与在被把对向从出入进上下来去中大小多少好成行发生开关动作用事时方面心力法气分部定品所口'.split(''));
function related(zhA, zhB) {
  const a = new Set([...zhA.split('\n')[0].replace(/[a-z.]+/gi, '')].filter(c => /[一-鿿]/.test(c) && !COMMON.has(c)));
  for (const c of zhB.split('\n')[0].replace(/[a-z.]+/gi, '')) if (a.has(c)) return true;
  return false;
}
function baseEntry(b) { const e = idx.get(b); return e && b.length >= 3 ? e : null; }
export function morph(word) {
  const w = String(word).toLowerCase(), e = idx.get(w);
  if (!e || !/^[a-z]+$/.test(w) || w.length < 6) return null;
  const zh = e.zh;
  for (const [s, pos, m] of SUFFIX.slice().sort((a, b) => b[0].length - a[0].length)) {
    if (!w.endsWith(s) || w.length - s.length < 3) continue;
    const stem = w.slice(0, -s.length);
    for (const cand of [stem, stem + 'e', stem.replace(/i$/, 'y'), /(.)\1$/.test(stem) ? stem.slice(0, -1) : null, stem.replace(/at$/, 'ate')].filter(Boolean)) {
      const be = baseEntry(cand);
      if (be && be.w.toLowerCase() !== w && related(zh, be.zh)) return [{ t: 'b', w: be.w, zh: firstSense(be.zh) }, { t: 's', a: '-' + s, m: pos + ' ' + m }];
    }
  }
  for (const [p, m] of PREFIX.slice().sort((a, b) => b[0].length - a[0].length)) {
    if (!w.startsWith(p) || w.length - p.length < 4) continue;
    const be = baseEntry(w.slice(p.length));
    if (be && related(zh, be.zh)) return [{ t: 'p', a: p + '-', m }, { t: 'b', w: be.w, zh: firstSense(be.zh) }];
  }
  return null;
}
export function firstSense(zh) {
  const line = String(zh || '').split('\n')[0];
  const m = line.match(/^([a-z]+\.\s*)?(.*)$/i);
  const parts = (m ? m[2] : line).split(/[,，；;]/).map(s => s.trim()).filter(Boolean);
  return (m && m[1] ? m[1] : '') + parts.slice(0, 2).join('，');
}

/** 假词（用于词汇量测试，检测“全都点认识”） */
export const PSEUDO = ['brastic', 'clombery', 'fendrous', 'tolmanate', 'glarvish', 'morbance', 'quintrel', 'vandimous', 'drompet', 'harbinous', 'plemish', 'sorvent'];
export const isRealWord = w => idx.has(w) || extra.has(w);

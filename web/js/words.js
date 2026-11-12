// 单词信息展示、点读、查词弹层
import * as dict from './dict.js';
import { app, commit, speak, openSheet, closeSheet } from './app.js';
import { esc, ICON, toast, fmtIvl } from './util.js';
import { DAY } from './fsrs.js';

const MT = { '谐音': 'mt-a', '词根': 'mt-b', '拆分': 'mt-c', '联想': 'mt-d', '形近': 'mt-e', '发音': 'mt-e', '构词': 'mt-b', '我的': 'mt-f' };

export function statusOf(w) {
  const s = app.state, e = s.cards[w];
  if (s.known[w]) return { k: 'known', t: '认识' };
  if (!e) return { k: 'new', t: '未学' };
  const c = e.r;
  if (e.leech) return { k: 'leech', t: '顽固词' };
  if (c.st === 2 && c.s >= 21) return { k: 'done', t: '已掌握' };
  if (c.st === 2) return { k: 'rev', t: '复习中' };
  return { k: 'learn', t: '学习中' };
}
export const inMine = w => app.state.mine.includes(w);

/** 一个词的完整信息块（卡片背面、查词弹层共用） */
export function wordInfoHTML(w, opts = {}) {
  const e = dict.entry(w) || { w, ph: '', zh: '' };
  const c = e.c || {}, note = app.state.notes[e.w] || '';
  const tags = dict.tagsOf(e);
  let h = '';
  if (!opts.noHead) {
    h += `<div class="whead"><span class="hw">${esc(e.w)}</span>
      <button class="spk" data-say="${esc(e.w)}" aria-label="朗读">${ICON.speaker}</button>
      <button class="star${inMine(e.w) ? ' on' : ''}" data-star="${esc(e.w)}" aria-label="生词本">${ICON.star}</button></div>`;
    h += `<div class="wsub">${e.ph ? `<span class="ipa">/${esc(e.ph)}/</span>` : ''}${tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>`;
  }
  if (opts.status) { const st = statusOf(e.w); h += `<div class="wsub"><span class="chip st-${st.k}">${st.t}</span>${dueText(e.w)}</div>`; }
  h += `<div class="mean">${(c.zh ? [c.zh] : e.zh.split('\n')).map(l => `<div>${posFmt(l)}</div>`).join('')}</div>`;
  const parts = [];
  const mo = dict.morph(e.w);
  if (mo) parts.push(['构词', mo.map(x => x.t === 'b' ? `<b>${esc(x.w)}</b>（${esc(x.zh)}）` : `<b>${esc(x.a)}</b>（${esc(x.m)}）`).join(' + ')]);
  for (const m of c.mn || []) parts.push([m[0], esc(m[1])]);
  if (note) parts.push(['我的', esc(note)]);
  if (parts.length) h += `<div class="mnbox">${parts.map(([t, x]) => `<div class="mnrow"><span class="mt ${MT[t] || 'mt-e'}">${esc(t)}</span><span>${x}</span></div>`).join('')}</div>`;
  if (c.ex) h += `<div class="ex"><span class="t">${readerHTML([[c.ex, c.exZh || '']], new Set([e.w]))}</span><button class="spk sm" data-say="${esc(c.ex)}" aria-label="朗读例句">${ICON.speaker}</button></div>${c.exZh ? `<div class="exzh">${esc(c.exZh)}</div>` : ''}`;
  const facts = [];
  if (c.col) facts.push(['搭配', c.col]); if (c.fam) facts.push(['派生', c.fam]); if (c.cf) facts.push(['易混', c.cf]);
  if (facts.length) h += `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if (app.state.cards[e.w] && app.state.cards[e.w].leech) h += `<div class="tip">这个词已经忘了很多次。多刷没用，试试给它写一个你自己的记忆点：越离谱越好记。</div>`;
  if (!opts.noNote) h += `<button class="linkbtn" data-note="${esc(e.w)}">${note ? '改我的记忆点' : '+ 写我自己的记忆点'}</button>`;
  return h;
}
function posFmt(l) {
  const m = String(l).match(/^([a-z]+\.(?:\s*&\s*[a-z]+\.)?)\s*(.*)$/i);
  return m ? `<span class="pos">${esc(m[1])}</span>${esc(m[2])}` : esc(l);
}
function dueText(w) {
  const e = app.state.cards[w]; if (!e || !e.r || e.r.st !== 2) return '';
  const d = e.r.due - Date.now();
  return `<span class="muted">${d <= 0 ? '今天复习' : fmtIvl(d) + '后复习'}</span>`;
}

// ---------- 点读 ----------
const SENTS = [];
export function readerHTML(pairs, hl) {
  return pairs.map(([en, zh]) => { const sid = SENTS.push({ en, zh }) - 1; return tokenize(en, sid, hl); }).join(' ');
}
const PHR_MAX = 5;
function tokenize(text, sid, hl) {
  const toks = [...text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map(m => ({ s: m[0], i: m.index, e: m.index + m[0].length }));
  let out = '', p = 0, k = 0;
  while (k < toks.length) {
    let span = 1, key = toks[k].s.toLowerCase(), kind = 'w';
    for (let n = Math.min(PHR_MAX, toks.length - k); n >= 2; n--) {
      const c = toks.slice(k, k + n); let ok = true;
      for (let j = 0; j < n - 1; j++) if (!/^ +$/.test(text.slice(c[j].e, c[j + 1].i))) { ok = false; break; }
      if (!ok) continue;
      const kk = c.map(t => t.s.toLowerCase().replace(/’/g, "'")).join(' ');
      if (dict.phraseGloss(kk)) { span = n; key = kk; kind = 'p'; break; }
    }
    const a = toks[k], b = toks[k + span - 1];
    out += esc(text.slice(p, a.i));
    let cls = 'tk';
    if (kind === 'w') {
      const lw = dict.lemma(a.s);
      if (lw && hl && (hl.has(lw) || hl.has(a.s))) cls += ' hl';
      else if (lw && app.state.cards[lw]) cls += ' lw';
    } else cls += ' ph';
    out += `<span class="${cls}" data-k="${esc(key)}" data-s="${sid}" data-t="${kind}">${esc(text.slice(a.i, b.e))}</span>`;
    p = b.e; k += span;
  }
  return out + esc(text.slice(p));
}
export function sentenceOf(sid) { return SENTS[sid] || {}; }

export function showGloss(el) {
  document.querySelectorAll('.tk.on').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  const sent = SENTS[+el.dataset.s] || {}, surface = el.textContent;
  speak(surface);
  if (el.dataset.t === 'p') {
    openSheet(`<div class="whead"><span class="hw sm">${esc(surface)}</span><span class="chip">词组</span></div>
      <div class="mean"><div>${esc(dict.phraseGloss(el.dataset.k))}</div></div>${sentBlock(sent)}${sheetBtns(surface, sent, null)}`);
    return;
  }
  const g = dict.glossOf(surface);
  if (g && g.e) {
    const w = g.e.w;
    openSheet(`${surface.toLowerCase() !== w.toLowerCase() ? `<div class="muted small">文中是 ${esc(surface)}，原形 ${esc(w)}</div>` : ''}
      ${wordInfoHTML(w, { status: true, noNote: true })}${sentBlock(sent)}${sheetBtns(surface, sent, w)}`);
  } else {
    openSheet(`<div class="whead"><span class="hw sm">${esc(surface)}</span></div>
      <div class="mean"><div>${g ? esc(g.zh) : '<span class="muted">词典里没有这个词，可以听一下发音</span>'}</div></div>${sentBlock(sent)}${sheetBtns(surface, sent, null)}`);
  }
}
const sentBlock = s => s.zh ? `<div class="sent"><span class="muted small">整句</span><div>${esc(s.zh)}</div></div>` : '';
function sheetBtns(surface, sent, w) {
  return `<div class="row">${sent.en ? `<button class="btn sm" data-say="${esc(sent.en)}">${ICON.speaker} 朗读整句</button>` : ''}
    ${w ? `<button class="btn sm" data-detail="${esc(w)}">查看完整释义</button>` : ''}
    <button class="btn ghost sm" data-close>关闭</button></div>`;
}

export function openWord(w) {
  const e = dict.entry(w);
  if (!e) { toast('词典里没有这个词'); return; }
  const st = statusOf(e.w);
  openSheet(`${wordInfoHTML(e.w, { status: true })}
    <div class="row">
      <button class="btn sm" data-mine="${esc(e.w)}">${inMine(e.w) ? '移出生词本' : '加入生词本（优先学）'}</button>
      ${st.k === 'known' ? `<button class="btn sm" data-unknown="${esc(e.w)}">其实不认识，要学</button>` : st.k === 'new' ? `<button class="btn sm" data-known="${esc(e.w)}">我认识，不用学</button>` : ''}
      <button class="btn ghost sm" data-close>关闭</button></div>`);
}

/** 全局点击：发音、点读、生词本、笔记等 */
export function handleWordClicks(e) {
  const t = e.target;
  const tk = t.closest('.tk'); if (tk) { showGloss(tk); return true; }
  const say = t.closest('[data-say]'); if (say) { speak(say.dataset.say); return true; }
  const star = t.closest('[data-star]'); if (star) { toggleMine(star.dataset.star); star.classList.toggle('on', inMine(star.dataset.star)); return true; }
  const mine = t.closest('[data-mine]'); if (mine) { toggleMine(mine.dataset.mine); closeSheet(); return true; }
  const kn = t.closest('[data-known]'); if (kn) { app.planner.markKnown(kn.dataset.known, Date.now()); commit(); closeSheet(); toast('已标记为认识，不会再出现'); return true; }
  const uk = t.closest('[data-unknown]'); if (uk) { delete app.state.known[uk.dataset.unknown]; if (!inMine(uk.dataset.unknown)) app.state.mine.unshift(uk.dataset.unknown); commit(); closeSheet(); toast('已加入生词本，会优先学'); return true; }
  const det = t.closest('[data-detail]'); if (det) { openWord(det.dataset.detail); return true; }
  const note = t.closest('[data-note]'); if (note) { editNote(note.dataset.note, note); return true; }
  if (t.closest('[data-close]')) { closeSheet(); return true; }
  return false;
}
export function toggleMine(w) {
  const m = app.state.mine, i = m.indexOf(w);
  if (i >= 0) { m.splice(i, 1); toast('已移出生词本'); }
  else { m.unshift(w); delete app.state.known[w]; toast('已加入生词本，会优先出现在新词里'); }
  commit();
}
function editNote(w, btn) {
  const box = document.createElement('div');
  box.className = 'noteedit';
  box.innerHTML = `<textarea maxlength="300" placeholder="自己编的谐音、画面或联想，越离谱越好记">${esc(app.state.notes[w] || '')}</textarea>
    <div class="row"><button class="btn primary sm" data-ns>保存</button><button class="btn ghost sm" data-nc>取消</button></div>`;
  btn.replaceWith(box);
  const ta = box.querySelector('textarea'); ta.focus();
  box.addEventListener('click', ev => {
    ev.stopPropagation();
    if (ev.target.closest('[data-ns]')) {
      const v = ta.value.trim();
      if (v) app.state.notes[w] = v; else delete app.state.notes[w];
      commit(); toast('记忆点已保存');
      const fresh = document.createElement('button'); fresh.className = 'linkbtn'; fresh.dataset.note = w; fresh.textContent = v ? '改我的记忆点' : '+ 写我自己的记忆点';
      box.replaceWith(fresh);
      const mn = fresh.parentElement && fresh.parentElement.querySelector('.mnbox');
      if (mn && v) { const old = mn.querySelector('.mt-f'); if (old) old.nextElementSibling.textContent = v; else mn.insertAdjacentHTML('beforeend', `<div class="mnrow"><span class="mt mt-f">我的</span><span>${esc(v)}</span></div>`); }
    }
    if (ev.target.closest('[data-nc]')) { const fresh = document.createElement('button'); fresh.className = 'linkbtn'; fresh.dataset.note = w; fresh.textContent = app.state.notes[w] ? '改我的记忆点' : '+ 写我自己的记忆点'; box.replaceWith(fresh); }
  });
}

// 首页、学习过程、首次引导、词汇量测试、熟词快筛
import * as dict from './dict.js';
import { app, register, go, back, commit, speak, todayLog, refresh, resetPlannerIndex, RELEASES_URL } from './app.js';
import { dayKey } from './planner.js';
import { outcomes, DAY, retrievability } from './fsrs.js';
import { esc, ICON, toast, fmtIvl, shuffle, $, fitWords } from './util.js';
import { wordInfoHTML, statusOf } from './words.js';
import { auth, sync } from './sync.js';
import { openUrl, setReminderText, isApp } from './native.js';

const BOOK = () => dict.bookById(app.state.settings.book);

export function streak() {
  let n = 0, t = Date.now();
  if (!(app.state.log[dayKey(t)] || {}).rev) t -= DAY;
  while ((app.state.log[dayKey(t)] || {}).rev) { n++; t -= DAY; }
  return n;
}
export function bookProgress(bookId) {
  const bw = dict.bookWords(bookId);
  let learned = 0, known = 0, mastered = 0;
  for (const w of bw.byRank) {
    if (app.state.known[w]) known++;
    const e = app.state.cards[w];
    if (e) { learned++; if (e.r.st === 2 && e.r.s >= 21) mastered++; }
  }
  return { total: bw.total, learned, known, mastered, left: bw.total - learned - known };
}
function greeting() { const h = new Date().getHours(); return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'; }

// ---------------- 首页 ----------------
register('home', {
  tab: 'home',
  render(el) {
    const s = app.state;
    if (!s.onboarded) { go('welcome', {}, { replace: true }); return; }
    const now = Date.now(), p = app.planner.plan(now), lg = p.done;
    const left = p.reviews.length + p.learnNow.length + p.learnSoon.length + p.spell.length + p.newWords.length;
    const doneToday = lg.rev || 0;
    const bp = bookProgress(s.settings.book), b = BOOK();
    const fc = app.planner.forecast(now + DAY, 7), cap = p.cap, maxv = Math.max(cap, ...fc, 1);
    const st = streak();
    setReminderText(left ? `今天有 ${p.reviews.length + p.learnNow.length} 个复习、${p.newWords.length} 个新词，大约 ${Math.max(1, p.estMin)} 分钟` : '今天的任务已完成，明天继续');
    let notice = '';
    if (p.deferred > 0) notice = `<div class="notice warn">积压了 ${p.deferred + p.reviews.length} 张卡。今天先复习最要紧的 ${p.reviews.length} 张，其余会自动分摊到接下来几天。清完之前暂停新词，这样每天都不会超过 ${s.settings.minutes} 分钟。</div>`;
    else if (p.reason === 'heavy' || p.reason === 'busy') notice = `<div class="notice">接下来几天复习比较多，${p.reason === 'heavy' ? '今天先不加新词' : '今天新词减半'}，避免以后欠下复习债。</div>`;
    const upd = app.update ? `<button class="notice link" id="updBanner">发现新版本 ${esc(app.update.tag)}，点这里更新 ›</button>` : '';
    const syncTip = !auth && doneToday + Object.keys(s.cards).length > 20 && !s.hideSyncTip ? `<div class="notice">登录账号后，手机和电脑的进度会自动同步。<button class="linkbtn" data-goto="account">去登录</button><button class="linkbtn muted" id="hideSyncTip">不再提示</button></div>` : '';
    el.innerHTML = `
      <div class="hello"><div><div class="muted small">${greeting()}${auth ? '，' + esc(auth.username) : ''}</div><h1 class="ptitle">今天学什么</h1></div>
        <div class="streak" title="连续学习天数"><b>${st}</b><span>天连续</span></div></div>
      ${upd}${notice}
      <section class="today card">
        ${left ? `
        <div class="nums">
          <div><b>${p.reviews.length + p.learnNow.length + p.learnSoon.length + p.spell.length}</b><span>复习</span></div>
          <div><b>${p.newWords.length}</b><span>新词</span></div>
          <div><b>${Math.max(1, p.estMin)}</b><span>分钟</span></div>
        </div>
        <button class="btn primary big" id="start">${doneToday ? '继续学习' : '开始学习'}</button>
        <div class="muted small center">${doneToday ? `今天已答 ${doneToday} 张 · ` : ''}按每天 ${s.settings.minutes} 分钟安排${s.settings.newMode === 'auto' ? `，可持续速度约每天 ${Math.round(p.sustain)} 个新词` : ''}</div>`
        : `<div class="donebox"><h2>今天的任务完成了</h2>
          <p class="muted">答了 ${doneToday} 张，正确率 ${lg.rev ? Math.round(lg.ok / lg.rev * 100) : 0}%。明天大约 ${fc[0]} 张复习。</p>
          ${bp.left > 0 && p.deferred === 0 ? `<button class="btn" id="more5">再学 5 个新词</button>` : ''}</div>`}
      </section>
      <button class="goalline" data-goto="progress"><span>目标 <b>${esc(b.full)}</b></span><span class="pbar sm"><i class="k" style="width:${bp.known / bp.total * 100}%"></i><i class="l" style="width:${bp.learned / bp.total * 100}%"></i></span><span class="muted small">${Math.floor((bp.learned + bp.known) / bp.total * 100)}% ›</span></button>
      <section class="tools">
        <button data-goto="search">${ICON.search}<span>查词</span></button>
        <button data-goto="mine">${ICON.star}<span>生词本</span></button>
        <button data-goto="screen">${ICON.filter}<span>熟词快筛</span></button>
        <button data-goto="placement">${ICON.chart}<span>词汇量测试</span></button>
      </section>
      <section class="card">
        <div class="row between"><b>未来 7 天的复习量</b><span class="muted small">虚线是你每天的时间能完成的量</span></div>
        <div class="fc">${fc.map((n, i) => `<div class="fcb"><span class="n">${n || ''}</span><span class="tr"><i style="height:${n / maxv * 100}%"></i></span><span class="d">${i === 0 ? '明天' : '周' + '日一二三四五六'[new Date(now + (i + 1) * DAY).getDay()]}</span></div>`).join('')}
          <div class="capline" style="bottom:calc(${cap / maxv} * (100% - 34px) + 18px)"></div></div>
      </section>`;
    el.onclick = e => {
      const t = e.target;
      if (t.closest('#start')) { go('session'); return; }
      if (t.closest('#more5')) { todayLog().extra = (todayLog().extra || 0) + 5; commit(); go('session'); return; }
      if (t.closest('#updBanner')) { openUrl(app.update.url || RELEASES_URL); return; }
      if (t.closest('#hideSyncTip')) { app.state.hideSyncTip = true; commit(); refresh(); return; }
      const g = t.closest('[data-goto]'); if (g) go(g.dataset.goto);
    };
  },
});

// ---------------- 学习过程 ----------------
const sess = { cur: null, stage: 'front', shownAt: 0, undo: [], sinceNew: 0, lastKey: '', startDone: 0, typed: '', hints: 0, sugg: 3, newChoice: '' };
function nextItem(p) {
  const key = it => it.w + it.k, notLast = arr => arr.find(it => key(it) !== sess.lastKey) || arr[0];
  if (p.learnNow.length) { const it = notLast(p.learnNow); if (key(it) !== sess.lastKey || !(p.reviews.length || p.newWords.length || p.spell.length)) return it; }
  const wantNew = p.newWords.length && (!p.reviews.length || sess.sinceNew >= 3);
  if (wantNew) return { w: p.newWords[0], k: 'r', c: null, isNew: true };
  if (p.reviews.length) return notLast(p.reviews);
  if (p.spell.length) return p.spell[0];
  if (p.newWords.length) return { w: p.newWords[0], k: 'r', c: null, isNew: true };
  if (p.learnNow.length) return p.learnNow[0];
  if (p.learnSoon.length) return p.learnSoon[0];
  return null;
}
let sessEl = null;
register('session', {
  tab: 'home', focus: true,
  render(el) {
    sessEl = el;
    sess.undo = []; sess.startDone = todayLog().rev || 0;
    el.innerHTML = `<div class="sbar"><button class="iconbtn" id="sx" aria-label="退出">${ICON.close}</button>
      <div class="sprog"><i id="sprog"></i></div><span class="muted small" id="scount"></span>
      <button class="iconbtn" id="sundo" aria-label="撤销" disabled>${ICON.undo}</button></div>
      <article class="scard" id="scard" aria-live="polite"></article><div class="actbar" id="actbar"></div>`;
    el.onclick = onSessionClick;
    showNext();
  },
  leave() { sessEl = null; commit(); },
});
function progress(p) {
  const left = p.reviews.length + p.learnNow.length + p.learnSoon.length + p.spell.length + p.newWords.length;
  const done = (todayLog().rev || 0) - sess.startDone;
  $('#sprog').style.width = (done + left ? done / (done + left) * 100 : 100) + '%';
  $('#scount').textContent = left ? `剩 ${left}` : '';
  $('#sundo').disabled = !sess.undo.length;
}
function showNext() {
  if (!sessEl) return;
  const p = app.planner.plan(Date.now());
  progress(p);
  const it = nextItem(p);
  Object.assign(sess, { cur: it, stage: 'front', shownAt: Date.now(), typed: '', hints: 0, newChoice: '', heard: false });
  if (!it) return renderDone();
  if (it.isNew) renderNewFront(); else if (it.k === 's') renderSpell(); else renderReviewFront();
}
const S = () => app.state.settings;
function headHTML(w, hide) {
  const e = dict.entry(w) || { w, ph: '' };
  return `<div class="whead center"><span class="hw big">${hide ? '' : esc(e.w)}</span></div>
    <div class="wsub center">${!hide && e.ph ? `<span class="ipa">/${esc(e.ph)}/</span>` : ''}<button class="spk" data-say="${esc(e.w)}" aria-label="朗读">${ICON.speaker}</button></div>`;
}
function setCard(html, bar) { $('#scard').innerHTML = html; $('#actbar').innerHTML = bar; $('#scard').scrollTop = 0; fitWords($('#scard')); }
function chips(it) {
  const st = it.c ? it.c.st : 0, e = app.state.cards[it.w];
  return `<div class="kind">${it.isNew ? '<span class="chip new">新词</span>' : st === 1 || st === 3 ? `<span class="chip learn">${st === 3 ? '重学' : '学习中'}</span>` : '<span class="chip">复习</span>'}${it.k === 's' ? '<span class="chip">拼写</span>' : ''}${e && e.leech ? '<span class="chip leech">顽固词</span>' : ''}</div>`;
}
// 新词三个选项：认识 / 模糊 / 不认识。选完都会看到释义，确认后再进入下一个。
const NEW_G = { known: 4, fuzzy: 2, unknown: 1 };
function renderNewFront() {
  const it = sess.cur;
  if (S().autoSpeak) speak(it.w);
  setCard(`${chips(it)}<div class="front">${headHTML(it.w)}<p class="muted center">认识这个词吗？</p></div>`,
    `<div class="stack3"><button class="btn big primary" data-n="known">认识 <kbd>1</kbd></button><button class="btn big" data-n="fuzzy">模糊 <kbd>2</kbd></button><button class="btn big" data-n="unknown">不认识 <kbd>3</kbd></button></div>`);
}
function renderNewBack(choice) {
  const it = sess.cur; sess.stage = 'back'; sess.newChoice = choice;
  const tip = { known: '认识的词大约两周后再考你一次，答对就算掌握了', fuzzy: '这个词几分钟后会再出现，帮你记牢', unknown: '这个词一会儿还会再出现几次，帮你记牢' }[choice];
  setCard(`${chips(it)}${wordInfoHTML(it.w)}`,
    `<button class="btn primary big" data-g="${NEW_G[choice]}">下一个 <kbd>空格</kbd></button>
     <div class="muted small center">${tip}${choice === 'known' ? '　<button class="linkbtn" data-g="1">认错了</button>' : ''}</div>`);
}
function renderReviewFront() {
  const it = sess.cur, hide = S().listenFront;
  if (S().autoSpeak || hide) speak(it.w);
  setCard(`${chips(it)}<div class="front">${headHTML(it.w, hide)}<p class="muted center">${hide ? '听发音，回想这个词和它的意思' : '先在心里说出意思，再看答案'}</p></div>`,
    `<button class="btn primary big" data-a="reveal">显示答案 <kbd>空格</kbd></button>`);
}
function gradeBar(sugg) {
  const it = sess.cur, now = Date.now();
  const outs = outcomes(it.c, now, { retention: S().retention });
  const names = ['忘了', '模糊', '记得', '简单'];
  return `<div class="grades">${outs.map((o, i) => `<button class="grade g${i + 1}${sugg === i + 1 ? ' sug' : ''}" data-g="${i + 1}"><b>${names[i]}</b><span>${fmtIvl(o.due - now)}</span></button>`).join('')}</div>`;
}
function renderReviewBack() {
  sess.stage = 'back';
  setCard(`${chips(sess.cur)}${wordInfoHTML(sess.cur.w)}`, gradeBar(0));
}
function findInEx(w, ex) {
  if (!ex) return null;
  const re = /[A-Za-z][A-Za-z'-]*/g; let m;
  while ((m = re.exec(ex))) if (dict.lemma(m[0]) === w || m[0].toLowerCase() === w.toLowerCase()) return { i: m.index, len: m[0].length };
  return null;
}
function renderSpell() {
  const it = sess.cur, e = dict.entry(it.w) || { w: it.w, zh: '' }, c = e.c || {};
  const pos = findInEx(e.w, c.ex), n = e.w.length;
  const hint = sess.hints ? e.w.slice(0, sess.hints) + '·'.repeat(Math.max(0, n - sess.hints)) : '';
  const sent = pos ? `<div class="ex">${esc(c.ex.slice(0, pos.i))}<span class="blank">${esc(hint) || '&nbsp;'}</span>${esc(c.ex.slice(pos.i + pos.len))}</div>${c.exZh ? `<div class="exzh">${esc(c.exZh)}</div>` : ''}` : '';
  setCard(`${chips(it)}<div class="mean big">${(c.zh ? [c.zh] : e.zh.split('\n')).slice(0, 2).map(l => `<div>${esc(l)}</div>`).join('')}</div>${sent}
    <p class="muted small">写出这个单词（${n} 个字母）${!pos && hint ? '：' + esc(hint) : ''}</p>
    <input id="spellIn" class="spellin" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="拼写" value="${esc(sess.typed)}">`,
    `<div class="three"><button class="btn" data-a="hint">提示字母</button><button class="btn" data-a="hear">听发音</button><button class="btn primary" data-a="check">检查 <kbd>Enter</kbd></button></div>`);
  const inp = $('#spellIn'); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
}
function checkSpell() {
  const it = sess.cur, w = it.w, val = (sess.typed || '').trim();
  const ok = val.toLowerCase() === w.toLowerCase();
  sess.sugg = ok ? (sess.hints || sess.heard ? 2 : 3) : 1; sess.stage = 'back';
  const diff = ok ? '' : [...w].map((ch, i) => `<span class="${(val[i] || '').toLowerCase() === ch.toLowerCase() ? 'y' : 'x'}">${esc(ch)}</span>`).join('');
  setCard(`${chips(it)}<div class="spellres ${ok ? 'ok' : 'bad'}">${ok ? '拼对了' : `你写的是 <b class="mono">${esc(val) || '（空）'}</b>，正确：<b class="mono">${diff}</b>`}</div>${wordInfoHTML(w)}`, gradeBar(sess.sugg));
  speak(w);
}
function doGrade(g) {
  const it = sess.cur; if (!it) return;
  const rec = app.planner.grade(it.w, it.k, g, Date.now(), Date.now() - sess.shownAt);
  sess.undo.push(rec); if (sess.undo.length > 30) sess.undo.shift();
  if (it.isNew) sess.sinceNew = 0; else sess.sinceNew++;
  sess.lastKey = it.w + it.k;
  commit(); showNext();
}
function onSessionClick(e) {
  const t = e.target;
  if (t.closest('#sx')) { back() || go('home', {}, { tab: true }); return; }
  if (t.closest('#sundo')) {
    const rec = sess.undo.pop(); if (!rec) return;
    app.planner.undo(rec); commit(); toast('已撤销上一步');
    const w = rec.w, e2 = app.state.cards[w];
    const c = e2 && e2.r;
    sess.cur = !c || c.st === 0 && !c.reps ? { w, k: 'r', c: null, isNew: true } : { w, k: 'r', c };
    sess.shownAt = Date.now(); progress(app.planner.plan(Date.now()));
    if (sess.cur.isNew) renderNewFront(); else renderReviewFront();
    return;
  }
  const g = t.closest('[data-g]'); if (g) { doGrade(+g.dataset.g); return; }
  const n = t.closest('[data-n]'); if (n) { renderNewBack(n.dataset.n); return; }
  const a = t.closest('[data-a]'); if (!a) return;
  const act = a.dataset.a;
  if (act === 'reveal') renderReviewBack();
  else if (act === 'hint') { sess.typed = $('#spellIn').value; sess.hints = Math.min(sess.cur.w.length, sess.hints + 1); renderSpell(); }
  else if (act === 'hear') { sess.heard = true; speak(sess.cur.w); $('#spellIn').focus(); }
  else if (act === 'check') { sess.typed = $('#spellIn').value; checkSpell(); }
  else if (act === 'done') { go('home', {}, { tab: true }); }
  else if (act === 'more') { todayLog().extra = (todayLog().extra || 0) + 5; commit(); showNext(); }
}
function renderDone() {
  const lg = todayLog(), p = app.planner.plan(Date.now()), fc = app.planner.forecast(Date.now() + DAY, 1)[0];
  const bp = bookProgress(app.state.settings.book);
  setCard(`<div class="donebox"><h2>今天的任务完成了</h2>
    <p>答了 ${lg.rev || 0} 张，正确率 ${lg.rev ? Math.round(lg.ok / lg.rev * 100) : 0}%，学了 ${lg.nw || 0} 个新词，用时约 ${Math.max(1, Math.round((lg.ms || 0) / 60000))} 分钟。</p>
    <p class="muted">明天大约 ${fc} 张复习。每天按时来一会儿，比隔几天补一大堆轻松得多。</p></div>`,
    `<div class="two">${bp.left > 0 && p.deferred === 0 ? '<button class="btn" data-a="more">再学 5 个新词</button>' : ''}<button class="btn primary" data-a="done">完成</button></div>`);
  $('#scount').textContent = '';
}
document.addEventListener('keydown', e => {
  if (!sessEl || !sess.cur || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.id === 'spellIn') { if (e.key === 'Enter') { e.preventDefault(); if (sess.stage === 'front') { sess.typed = e.target.value; checkSpell(); } } return; }
  if (/input|textarea/i.test(e.target.tagName)) return;
  const it = sess.cur, k = e.key, space = k === ' ' || k === 'Enter';
  const click = sel => { const b = document.querySelector('#actbar ' + sel); if (b) { e.preventDefault(); b.click(); } };
  if (k === 'z' || k === 'Z') return click && document.getElementById('sundo').click();
  if (k === 'p' || k === 'P') return speak(it.w);
  if (it.isNew && sess.stage === 'front') { const m = { 1: 'known', 2: 'fuzzy', 3: 'unknown' }[k]; if (m) click(`[data-n=${m}]`); return; }
  if (it.isNew && sess.stage === 'back') { if (space) click('.btn[data-g]'); return; }
  if (sess.stage === 'front' && space) return click('[data-a=reveal]');
  if (sess.stage === 'back') { if (/^[1-4]$/.test(k)) click(`[data-g="${k}"]`); else if (space) click(sess.cur.k === 's' ? `[data-g="${sess.sugg}"]` : '[data-g="3"]'); }
});

// ---------------- 首次引导：词汇量测试 → 选目标 → 开始 ----------------
const MINUTES = [10, 15, 20, 30, 45, 60];
register('welcome', {
  tab: 'home', focus: true,
  render(el) {
    el.innerHTML = `<div class="onb">
      <div class="logo big">拾词</div>
      <h1>每天一点，不欠单词债</h1>
      <ul class="vp">
        <li><b>先测词汇量</b>1 分钟测出你大概认识多少词，认识的直接跳过。</li>
        <li><b>再选目标</b>中考、高考、四六级、考研、雅思、托福，按词频从高到低学。</li>
        <li><b>按你的时间安排</b>每天学多久由你定，复习量不会越欠越多。</li>
      </ul>
      <button class="btn primary big" id="ob1">开始测试词汇量</button>
      <button class="btn ghost" data-goto="account">我已有账号，登录</button>
      <p class="muted small center">开始使用即表示你同意<button class="linkbtn" data-goto="terms">用户协议</button>和<button class="linkbtn" data-goto="privacy">隐私政策</button></p></div>`;
    el.onclick = e => { if (e.target.closest('#ob1')) go('placement', { onboarding: true }); const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); };
  },
});

/** 根据估计的词汇量推荐目标 */
export function recommendBook(est) {
  return est < 1200 ? 'zk' : est < 2600 ? 'gk' : est < 3900 ? 'cet4' : est < 5200 ? 'cet6' : est < 6800 ? 'ky' : est < 8500 ? 'toefl' : 'gre';
}

register('pickbook', {
  tab: 'more',
  render(el, prm) {
    const onb = !!prm.onboarding;
    document.body.classList.toggle('focus', onb);
    const est = app.state.vocabEst || 0, rec = est ? recommendBook(est) : '';
    const draw = () => {
      const cur = app.state.settings.book, m = app.state.settings.minutes;
      el.innerHTML = `${onb ? '<h1 class="ptitle">选择你的目标</h1>' : `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><h1 class="ptitle">学习目标</h1></div>`}
        <p class="muted">${est ? `你的词汇量约 <b>${est}</b>，推荐从<b>${esc(dict.bookById(rec).name)}</b>开始。` : ''}同一个词在不同词书里只学一次，换目标不会丢进度。</p>
        <div class="books">${dict.BOOKS.map(b => { const bp = bookProgress(b.id); return `<button class="bookbtn${b.id === cur ? ' on' : ''}" data-book="${b.id}">
          <span class="row between"><b>${esc(b.full)}</b>${b.id === rec ? '<span class="chip new">推荐</span>' : ''}</span>
          <span class="muted small">${esc(b.desc)} · ${bp.total} 词${bp.learned + bp.known ? ` · 还剩 ${bp.left}` : ''}</span>
          ${bp.learned + bp.known ? `<span class="pbar sm"><i class="k" style="width:${bp.known / bp.total * 100}%"></i><i class="l" style="width:${bp.learned / bp.total * 100}%"></i></span>` : ''}</button>`; }).join('')}</div>
        ${onb ? `<div class="card"><b>每天学多久？</b><div class="seg">${MINUTES.map(x => `<button data-min="${x}" class="${x === m ? 'on' : ''}">${x}<small>分钟</small></button>`).join('')}</div>
          <p class="muted small">按这个时间，长期每天能学约 <b>${Math.round(app.planner.sustainableNew())}</b> 个新词，复习也跟得上。之后可以在设置里改。</p></div>
          <div class="stickgo"><button class="btn primary big" id="obGo">开始学习 · ${esc(dict.bookById(cur).name)}</button></div>` : ''}`;
    };
    if (onb && !prm.picked) { app.state.settings.book = rec || app.state.settings.book; }
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      const mb = e.target.closest('[data-min]'); if (mb) { app.state.settings.minutes = +mb.dataset.min; commit(); draw(); return; }
      if (e.target.closest('#obGo')) { app.state.onboarded = true; commit(); resetPlannerIndex(); go('home', {}, { tab: true }); return; }
      const b = e.target.closest('[data-book]'); if (!b) return;
      app.state.settings.book = b.dataset.book; prm.picked = true; commit(); resetPlannerIndex();
      if (onb) draw(); else { toast('目标已换成 ' + dict.bookById(b.dataset.book).full); back(); }
    };
  },
});

// ---------------- 词汇量测试（和词书无关：按全部考试词汇的词频分 10 档抽查） ----------------
const BANDS = [1000, 2000, 3000, 4000, 5000, 6500, 8000, 10000, 12500, 15000];
register('placement', {
  tab: 'home', focus: true,
  render(el, prm) {
    const all = dict.examWordsByRank(), DEC = BANDS.length;
    const lo = d => d ? BANDS[d - 1] : 0, hi = d => Math.min(BANDS[d], all.length);
    const items = [];
    for (let d = 0; d < DEC; d++) shuffle(all.slice(lo(d), hi(d))).slice(0, 4).forEach(w => items.push({ w, d }));
    shuffle(dict.PSEUDO).slice(0, 5).forEach(w => items.push({ w, d: -1 }));
    // 从高频到低频出题，前面简单、后面难，更像真实的测试
    const qs = items.filter(x => x.d >= 0).sort((a, b) => a.d - b.d);
    items.filter(x => x.d < 0).forEach((x, i) => qs.splice(6 + i * 8, 0, x));
    const ans = [];
    let i = 0;
    const draw = () => {
      if (i >= qs.length) return result();
      el.innerHTML = `<div class="sbar"><button class="iconbtn" data-x aria-label="退出">${ICON.close}</button><div class="sprog"><i style="width:${i / qs.length * 100}%"></i></div><span class="muted small">${i + 1}/${qs.length}</span></div>
        <div class="ptest"><p class="muted center">词汇量测试 · 一眼能说出中文意思的才算认识<br>里面混了几个编造的词</p>
        <div class="hw big center">${esc(qs[i].w)}</div></div>
        <div class="actbar"><div class="two"><button class="btn big" data-y="0">不认识</button><button class="btn big primary" data-y="1">认识</button></div></div>`;
      fitWords(el);
    };
    const result = () => {
      const known = Array(DEC).fill(0), tot = Array(DEC).fill(0); let fake = 0;
      ans.forEach(a => { if (a.d < 0) fake += a.y; else { tot[a.d]++; known[a.d] += a.y; } });
      const pen = fake >= 3 ? 0.5 : fake === 2 ? 0.75 : fake === 1 ? 0.9 : 1;   // 点了编造词，估计打折
      const est = Math.round(known.reduce((s, k, d) => s + (tot[d] ? k / tot[d] : 0) * (hi(d) - lo(d)), 0) * pen / 50) * 50;
      let upto = -1;
      if (fake < 2) for (let d = 0; d < DEC; d++) { if (tot[d] && known[d] / tot[d] >= 0.75 - 1e-9) upto = d; else break; }
      const mark = upto >= 0 ? all.slice(0, hi(upto)).filter(w => !app.state.cards[w] && !app.state.known[w]) : [];
      el.innerHTML = `<div class="onb"><h1>你的词汇量约</h1>
        <div class="bignum">${est}</div>
        <p class="muted center">${est < 1200 ? '基础还在打，从最常用的词学起，进步会很快。' : est < 2600 ? '大约是高中水平。' : est < 3900 ? '大约是四级水平。' : est < 5200 ? '大约是六级水平。' : '词汇量很不错。'}推荐目标：<b>${esc(dict.bookById(recommendBook(est)).full)}</b></p>
        ${fake >= 2 ? '<div class="notice warn">你把几个编造的词也点成了认识，结果可能偏高，所以先不跳过任何词。学习时遇到认识的词点“认识”就好。</div>'
          : mark.length ? `<div class="notice">最常用的 <b>${mark.length}</b> 个词你基本都认识，学习时会直接跳过。</div>` : ''}
        <button class="btn primary big" id="pdone">${prm.onboarding ? '下一步：选择目标' : '好的'}</button>
        ${mark.length ? '<button class="btn ghost" id="pnone">不要跳过，从最常用的词学起</button>' : ''}</div>`;
      el.onclick = e => {
        const ok = e.target.closest('#pdone'), no = e.target.closest('#pnone');
        if (!ok && !no) return;
        if (ok) for (const w of mark) app.state.known[w] = 'p';
        app.state.vocabEst = est; commit(); resetPlannerIndex();
        if (prm.onboarding) go('pickbook', { onboarding: true }, { replace: true }); else { toast('已更新'); back(); }
      };
    };
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-x]')) { if (prm.onboarding) go('pickbook', { onboarding: true }, { replace: true }); else back(); return; }
      const y = e.target.closest('[data-y]'); if (!y) return;
      ans.push({ d: qs[i].d, y: +y.dataset.y }); i++; draw();
    };
  },
});

// ---------------- 熟词快筛 ----------------
register('screen', {
  tab: 'home', focus: true,
  render(el) {
    const list = app.planner.pickNew(30, []);
    let i = 0, known = 0;
    const draw = () => {
      if (i >= list.length) {
        el.innerHTML = `<div class="onb"><h1>筛完了</h1><p>${known ? `标记了 ${known} 个认识的词，它们不会再出现，不占复习时间。` : '这一批都要学，挺好。'}</p>
          <button class="btn primary big" data-goto="home">回首页</button>${list.length ? '<button class="btn ghost" id="again">再筛一批</button>' : ''}</div>`;
        return;
      }
      const e = dict.entry(list[i]) || { w: list[i], ph: '', zh: '' };
      el.innerHTML = `<div class="sbar"><button class="iconbtn" data-x>${ICON.close}</button><div class="sprog"><i style="width:${i / list.length * 100}%"></i></div><span class="muted small">${i + 1}/${list.length}</span></div>
        <div class="ptest"><p class="muted center">快速过一遍接下来要学的新词，一眼就认识的点“认识”，以后不再出现。</p>
        <div class="hw big center">${esc(e.w)}</div><div class="center"><button class="spk" data-say="${esc(e.w)}">${ICON.speaker}</button></div>
        <details class="peek"><summary>看一下释义</summary><div class="mean">${esc(e.zh).replace(/\n/g, '<br>')}</div></details></div>
        <div class="actbar"><div class="two"><button class="btn big" data-y="0">不认识，要学</button><button class="btn big primary" data-y="1">认识</button></div></div>`;
      fitWords(el);
    };
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-x]')) { commit(); back(); return; }
      if (e.target.closest('#again')) { go('screen', {}, { replace: true }); return; }
      const g = e.target.closest('[data-goto]'); if (g) { go(g.dataset.goto, {}, { tab: true }); return; }
      const y = e.target.closest('[data-y]'); if (!y) return;
      if (+y.dataset.y) { app.planner.markKnown(list[i], Date.now()); known++; }
      i++; if (i % 5 === 0 || i >= list.length) commit(); draw();
    };
  },
});

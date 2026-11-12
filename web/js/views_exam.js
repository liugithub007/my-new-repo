// 真题阅读：按目标考试显示阅读文章和题目；也可以导入自己手里的真题
import * as dict from './dict.js';
import { app, register, go, back, commit, speak } from './app.js';
import { esc, ICON, toast, twoStep } from './util.js';
import { readerHTML, statusOf, openWord } from './words.js';
import { splitEn } from './views_read.js';

export const EXAMS = [['zk', '中考'], ['gk', '高考'], ['cet4', '四级'], ['cet6', '六级'], ['ky', '考研'], ['ielts', '雅思'], ['toefl', '托福'], ['gre', 'GRE']];
const examName = id => (EXAMS.find(x => x[0] === id) || [, ''])[1];

let DATA = null, loading = null;
async function loadExams() {
  if (DATA) return DATA;
  if (!loading) loading = fetch('data/exams.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => (DATA = j)).catch(e => { loading = null; throw e; });
  return loading;
}
const words = text => [...String(text).matchAll(/[A-Za-z][A-Za-z'’-]*/g)].length;
function userPapers() { return Object.entries(app.state.papers || {}).filter(([, p]) => p && !p.del).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)); }
function importedParas(p) {
  return String(p.text).split(/\n\s*\n|\r?\n(?=\s{2,}|\t)/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map(x => splitEn(x).map(t => [t, '']));
}

register('exam', {
  tab: 'exam',
  async render(el, prm) {
    const ex = prm.ex || app.state.examPick || app.state.settings.book;
    el.innerHTML = `<h1 class="ptitle">真题阅读</h1>
      <div class="chips" role="tablist">${EXAMS.map(([id, n]) => `<button role="tab" data-ex="${id}" class="${id === ex ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="elist"><div class="empty">加载中…</div></div>`;
    el.onclick = e => {
      const c = e.target.closest('[data-ex]'); if (c) { app.state.examPick = c.dataset.ex; go('exam', { ex: c.dataset.ex }, { replace: true }); return; }
      const p = e.target.closest('[data-paper]'); if (p) { go('paper', { id: p.dataset.paper }); return; }
      const u = e.target.closest('[data-upaper]'); if (u) { go('paper', { uid: u.dataset.upaper }); return; }
      if (e.target.closest('#imp')) go('importPaper', { ex });
    };
    let list = [];
    try { const d = await loadExams(); list = d.papers.filter(p => p.exam === ex); }
    catch (err) { el.querySelector('#elist').innerHTML = `<div class="empty">文章加载失败，请检查网络后重试</div>`; return; }
    const box = el.querySelector('#elist'); if (!box) return;
    const done = app.state.examDone || {};
    const mine = userPapers().filter(([, p]) => !p.exam || p.exam === ex);
    box.innerHTML = `<p class="muted small">${examName(ex)}阅读题型：读文章，做选择题，看解析。文中每个词都能点，看释义和整句翻译。</p>
      ${list.map(p => { const d = done[p.id]; return `<button class="card post exam" data-paper="${p.id}">
        <div class="row between"><span class="muted small">${esc(p.label)}</span>${d ? `<span class="chip ${d.c === d.t ? 'st-done' : 'st-learn'}">做过 ${d.c}/${d.t}</span>` : `<span class="chip">${p.qs.length} 题</span>`}</div>
        <b class="ptl">${esc(p.title)}</b><span class="muted small">${p.paras.reduce((n, para) => n + para.reduce((m, s) => m + words(s[0]), 0), 0)} 词 · ${esc(p.topic || '')}</span></button>`; }).join('') || '<div class="empty">这个考试的文章正在整理中</div>'}
      <h3 class="sec">我导入的真题</h3>
      ${mine.map(([id, p]) => `<button class="card post exam" data-upaper="${id}"><b class="ptl">${esc(p.title || '未命名文章')}</b><span class="muted small">${words(p.text)} 词 · ${new Date(p.at).toLocaleDateString()} 导入</span></button>`).join('')}
      <button class="card post imp" id="imp"><b>+ 导入一篇真题</b><span class="muted small">把你手里真题试卷的阅读文章粘贴进来，就能全文点读、查词、加生词本。</span></button>
      <p class="muted small center">以上文章是拾词按${examName(ex)}阅读的题型、难度和常见话题原创编写的练习，不是历年考试原文。</p>`;
  },
});

register('importPaper', {
  tab: 'exam',
  render(el, prm) {
    el.innerHTML = `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><h1 class="ptitle">导入真题</h1></div>
      <div class="card form"><label>标题<input id="it" maxlength="80" placeholder="例如：2021 考研英语一 Text 2"></label>
      <label>文章（英文原文，段落之间空一行）<textarea id="ix" rows="12" maxlength="12000" placeholder="把阅读文章粘贴到这里"></textarea></label>
      <button class="btn primary big" id="isave">保存</button><div class="msg" id="im"></div>
      <p class="muted small">只保存在你自己的账号里，用来阅读和查词，其他人看不到。</p></div>`;
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      if (!e.target.closest('#isave')) return;
      const t = el.querySelector('#it').value.trim(), x = el.querySelector('#ix').value.trim(), m = el.querySelector('#im');
      if (words(x) < 30) { m.textContent = '文章太短了，至少要 30 个英文单词'; return; }
      if (userPapers().length >= 50) { m.textContent = '最多导入 50 篇，先删掉一些旧的'; return; }
      const id = 'p' + Date.now().toString(36);
      app.state.papers[id] = { title: t || x.slice(0, 40), text: x, exam: prm.ex || '', at: Date.now() };
      commit(); toast('已导入'); go('paper', { uid: id }, { replace: true });
    };
  },
});

register('paper', {
  tab: 'exam',
  async render(el, prm) {
    let P, user = false;
    if (prm.uid) { P = app.state.papers[prm.uid]; user = true; if (!P || P.del) { el.innerHTML = '<div class="empty">文章不存在</div>'; return; } }
    else { try { P = (await loadExams()).papers.find(p => p.id === prm.id); } catch (e) {} if (!P) { el.innerHTML = '<div class="empty">文章不存在</div>'; return; } }
    const paras = user ? importedParas(P) : P.paras, qs = user ? [] : P.qs;
    const book = app.state.settings.book, bset = new Set();
    for (const para of paras) for (const [en] of para) for (const m of en.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
      const lw = dict.lemma(m[0]); const e = lw && dict.entry(lw);
      if (e && dict.inBook(e, book) && !app.state.cards[e.w] && !app.state.known[e.w] && e.w.length > 2) bset.add(e.w);
    }
    const unk = [...bset].sort((a, b) => (dict.entry(a).rank || 0) - (dict.entry(b).rank || 0));
    const prev = (app.state.examDone || {})[prm.id];
    el.innerHTML = `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><span class="muted small">${user ? '我导入的真题' : esc(P.label)}</span></div>
      <article class="reader">
        <h1 class="atitle">${esc(P.title)}</h1>
        <p class="muted small">点任意单词看释义、听发音；点开后能看整句翻译。浅黄底是你学过的词。</p>
        ${paras.map((p, i) => `<div class="para"><p class="story">${readerHTML(p, null)}</p>
          <div class="ptools"><button class="btn sm ghost" data-pread="${i}">${ICON.speaker} 朗读</button>${p.some(x => x[1]) ? '<button class="btn sm ghost" data-pzh>中文</button>' : ''}</div>
          <div class="storyzh" hidden>${p.map(x => esc(x[1])).join('')}</div></div>`).join('')}
      </article>
      ${qs.length ? `<h3 class="sec">阅读理解 · ${qs.length} 题${prev ? `<span class="muted small">　上次 ${prev.c}/${prev.t}</span>` : ''}</h3>
      <div class="qs">${qs.map((q, i) => `<div class="card q" data-q="${i}"><p class="qq"><b>${i + 1}.</b> ${esc(q.q)}</p>
        ${q.o.map((o, j) => `<button class="opt" data-o="${j}"><span class="ol">${'ABCD'[j]}</span><span>${esc(o)}</span></button>`).join('')}
        <div class="why" hidden></div></div>`).join('')}</div>
      <button class="btn primary big" id="submit" disabled>提交答案</button>` : ''}
      ${unk.length ? `<h3 class="sec">文中的${esc(dict.bookById(book).name)}词汇（还没学）</h3>
        <div class="wchips">${unk.slice(0, 60).map(w => `<button class="wchip st-${statusOf(w).k}" data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div>
        <div class="row"><button class="btn" id="addAll">全部加入生词本（${Math.min(unk.length, 60)} 个）</button></div>` : ''}
      ${user ? `<div class="row"><button class="btn danger sm" id="del">删除这篇</button></div>` : ''}`;
    const pick = {};
    el.onclick = e => {
      const t = e.target;
      if (t.closest('[data-back]')) return back();
      const pr = t.closest('[data-pread]'); if (pr) { speak(paras[+pr.dataset.pread].map(x => x[0]).join(' ')); return; }
      const pz = t.closest('[data-pzh]'); if (pz) { const z = pz.parentElement.nextElementSibling; z.hidden = !z.hidden; pz.textContent = z.hidden ? '中文' : '收起中文'; return; }
      const wc = t.closest('[data-word]'); if (wc) { openWord(wc.dataset.word); return; }
      const o = t.closest('[data-o]');
      if (o && !el.querySelector('.qs.done')) {
        const qi = +o.closest('[data-q]').dataset.q; pick[qi] = +o.dataset.o;
        o.parentElement.querySelectorAll('.opt').forEach(b => b.classList.toggle('on', b === o));
        el.querySelector('#submit').disabled = Object.keys(pick).length < qs.length;
        return;
      }
      if (t.closest('#submit')) {
        let c = 0;
        qs.forEach((q, i) => {
          const card = el.querySelector(`[data-q="${i}"]`), right = pick[i] === q.a; if (right) c++;
          card.classList.add(right ? 'right' : 'wrong');
          card.querySelectorAll('.opt').forEach((b, j) => { b.classList.toggle('ok', j === q.a); b.classList.toggle('bad', j === pick[i] && !right); });
          const w = card.querySelector('.why'); w.hidden = false; w.innerHTML = `<b>${right ? '答对了' : '正确答案 ' + 'ABCD'[q.a]}</b>　${esc(q.why)}`;
        });
        el.querySelector('.qs').classList.add('done');
        const sb = el.querySelector('#submit'); sb.textContent = `答对 ${c}/${qs.length}`; sb.disabled = true;
        app.state.examDone[prm.id] = { c, t: qs.length, at: Date.now() }; commit();
        toast(c === qs.length ? '全对，漂亮！' : `答对 ${c} 题，看看解析`);
        return;
      }
      if (t.closest('#addAll')) {
        let n = 0; for (const w of unk.slice(0, 60)) if (!app.state.mine.includes(w)) { app.state.mine.push(w); n++; }
        commit(); t.closest('#addAll').textContent = n ? `已加入 ${n} 个，会优先出现在新词里` : '都已经在生词本里了';
        return;
      }
      const d = t.closest('#del'); if (d) twoStep(d, () => { app.state.papers[prm.uid] = { del: 1, at: Date.now() }; commit(); toast('已删除'); back(); });
    };
  },
});

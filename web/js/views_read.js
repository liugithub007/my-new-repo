// 推文（阅读）、查词、生词本
import * as dict from './dict.js';
import { app, register, go, back, commit, speak } from './app.js';
import { esc, ICON, debounce, fmtIvl } from './util.js';
import { readerHTML, openWord, statusOf } from './words.js';

function splitEn(s) { return s.replace(/\b(Mr|Mrs|Dr|Prof)\./g, '$1§').split(/(?<=[.!?]["”]?)\s+(?=["“A-Z])/).map(x => x.replace(/§/g, '.')); }
function splitZh(s) { return String(s || '').split(/(?<=[。！？][”"]?)/).filter(x => x.trim()); }
function storyPairs(st) { const en = splitEn(st.story), zh = splitZh(st.storyZh); return en.map((x, i) => [x, en.length === zh.length ? zh[i] : '']); }
function learnedCount(words) { return words.filter(w => app.state.cards[w] || app.state.known[w]).length; }

register('read', {
  tab: 'read',
  render(el) {
    const C = dict.getContent();
    const arts = C.articles || [], stories = C.stories || [];
    el.innerHTML = `<h1 class="ptitle">推文</h1><p class="muted">读故事复习单词。文中任何一个词、词组都能点，看释义、听发音、看整句翻译。黄色高亮是你学过的词。</p>
      <h3 class="sec">长篇故事</h3>
      ${arts.map(a => { const n = learnedCount(a.words); return `<article class="card post" data-art="${a.id}">
        <div class="muted small">${a.words.length} 个核心词 · 你已学 ${n}</div><b class="ptl it">${esc(a.title)}</b><div class="muted">${esc(a.titleZh)}</div>
        <p class="hook">${esc(a.hook)}</p><div class="pbar sm"><i class="l" style="width:${n / a.words.length * 100}%"></i></div></article>`; }).join('')}
      <h3 class="sec">小故事</h3>
      ${stories.map(st => { const n = learnedCount(st.words); return `<article class="card post" data-story="${st.id}">
        <div class="row between"><b class="ptl">${esc(st.title)}</b><span class="muted small">${st.words.length} 词 · 已学 ${n}</span></div>
        <p class="hook en">${esc(st.story.slice(0, 110))}…</p></article>`; }).join('')}
      <p class="muted small center">更多文章持续更新中</p>`;
    el.onclick = e => {
      const a = e.target.closest('[data-art]'); if (a) { go('article', { id: a.dataset.art }); return; }
      const s = e.target.closest('[data-story]'); if (s) go('article', { id: s.dataset.story });
    };
  },
});

register('article', {
  tab: 'read',
  render(el, prm) {
    const C = dict.getContent();
    const art = (C.articles || []).find(a => a.id === prm.id), st = (C.stories || []).find(s => s.id === prm.id);
    if (!art && !st) { el.innerHTML = '<div class="empty">文章不存在</div>'; return; }
    const words = (art || st).words, hl = new Set(words);
    const paras = art ? art.paras : [storyPairs(st)];
    app.state.read[prm.id] = app.state.read[prm.id] || Date.now(); commit();
    el.innerHTML = `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><span class="muted small">推文</span></div>
      <article class="reader">
        <h1 class="atitle">${esc(art ? art.title : st.title)}</h1>${art ? `<div class="muted">${esc(art.titleZh)}</div>` : ''}
        ${paras.map((p, i) => `<div class="para"><p class="story">${readerHTML(p, hl)}</p>
          <div class="ptools"><button class="btn sm ghost" data-pread="${i}">${ICON.speaker} 朗读</button><button class="btn sm ghost" data-pzh>中文</button></div>
          <div class="storyzh" hidden>${p.map(x => esc(x[1])).join('')}</div></div>`).join('')}
      </article>
      <h3 class="sec">本文核心词</h3>
      <div class="wchips">${words.map(w => { const s = statusOf(w); return `<button class="wchip st-${s.k}" data-word="${esc(w)}">${esc(w)}</button>`; }).join('')}</div>
      <div class="row"><button class="btn" id="addAll">把没学过的词加入生词本</button></div>`;
    el.onclick = e => {
      const t = e.target;
      if (t.closest('[data-back]')) return back();
      const pr = t.closest('[data-pread]'); if (pr) { speak(paras[+pr.dataset.pread].map(x => x[0]).join(' ')); return; }
      const pz = t.closest('[data-pzh]'); if (pz) { const z = pz.parentElement.nextElementSibling; z.hidden = !z.hidden; pz.textContent = z.hidden ? '中文' : '收起中文'; return; }
      const wc = t.closest('[data-word]'); if (wc) { openWord(wc.dataset.word); return; }
      if (t.closest('#addAll')) {
        let n = 0; for (const w of words) if (!app.state.cards[w] && !app.state.known[w] && !app.state.mine.includes(w) && dict.entry(w)) { app.state.mine.push(w); n++; }
        commit(); t.closest('#addAll').textContent = n ? `已加入 ${n} 个词，会优先出现在新词里` : '这些词你都学过了';
      }
    };
  },
});

register('search', {
  tab: 'home',
  render(el) {
    el.innerHTML = `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><h1 class="ptitle">查词</h1></div>
      <input id="q" class="search" type="search" placeholder="输入英文单词或中文意思" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="list" id="res"></div>`;
    const q = el.querySelector('#q'), res = el.querySelector('#res');
    const run = debounce(() => {
      const r = dict.search(q.value, 40);
      res.innerHTML = r.length ? r.map(e => { const s = statusOf(e.w); return `<button class="item" data-word="${esc(e.w)}"><span class="w">${esc(e.w)}${e.ph ? `<small>/${esc(e.ph)}/</small>` : ''}</span><span class="m">${esc(dict.firstSense(e.zh))}</span><span class="chip st-${s.k}">${s.t}</span></button>`; }).join('')
        : q.value.trim() ? '<div class="empty">没有找到</div>' : '';
    }, 150);
    q.addEventListener('input', run); setTimeout(() => q.focus(), 50);
    el.onclick = e => { if (e.target.closest('[data-back]')) return back(); const w = e.target.closest('[data-word]'); if (w) openWord(w.dataset.word); };
  },
});

register('mine', {
  tab: 'home',
  render(el, prm) {
    const tab = prm.tab || 'mine', s = app.state;
    let list = [];
    if (tab === 'mine') list = s.mine.slice();
    else if (tab === 'leech') list = Object.keys(s.cards).filter(w => s.cards[w].leech);
    else if (tab === 'recent') list = Object.keys(s.cards).sort((a, b) => (s.cards[b].r.last || 0) - (s.cards[a].r.last || 0)).slice(0, 200);
    else if (tab === 'known') list = Object.keys(s.known).filter(w => s.known[w] !== 'p').slice(-300).reverse();
    const tabs = [['mine', '生词本'], ['recent', '最近学的'], ['leech', '顽固词'], ['known', '标记认识']];
    el.innerHTML = `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><h1 class="ptitle">我的单词</h1></div>
      <div class="segtabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="muted small">${tab === 'mine' ? '生词本里还没学的词会排在最前面，优先学。在查词、阅读时点 ☆ 加入。' : tab === 'leech' ? '忘了 8 次以上的词。给它们写个自己的记忆点，比多刷几遍管用。' : tab === 'known' ? '你标记为认识的词，不会出现在学习里。点开可以改回来。' : '最近复习或学习过的词。'}</p>
      <div class="list">${list.length ? list.map(w => { const e = dict.entry(w) || { w, zh: '' }, st = statusOf(w), c = s.cards[w];
        return `<button class="item" data-word="${esc(w)}"><span class="w">${esc(w)}</span><span class="m">${esc(dict.firstSense(e.zh))}</span><span class="meta"><span class="chip st-${st.k}">${st.t}</span>${c && c.r.st === 2 ? `<span class="muted small">${c.r.due <= Date.now() ? '今天' : fmtIvl(c.r.due - Date.now()) + '后'}</span>` : ''}</span></button>`; }).join('') : '<div class="empty">这里还是空的</div>'}</div>`;
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      const t = e.target.closest('[data-tab]'); if (t) { go('mine', { tab: t.dataset.tab }, { replace: true }); return; }
      const w = e.target.closest('[data-word]'); if (w) openWord(w.dataset.word);
    };
  },
});

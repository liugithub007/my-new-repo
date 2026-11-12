// 进度（底部导航单独一栏）：目标词书进度、词汇量、复习预测、学习日历、各词书进度
import * as dict from './dict.js';
import { app, register, go } from './app.js';
import { dayKey } from './planner.js';
import { DAY } from './fsrs.js';
import { esc, ICON } from './util.js';
import { bookProgress, streak } from './study.js';

function fmtDate(ts) { const d = new Date(ts); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }

register('progress', {
  tab: 'progress',
  render(el) {
    const s = app.state, now = Date.now(), L = s.log, b = dict.bookById(s.settings.book);
    const bp = bookProgress(b.id), pct = (bp.learned + bp.known) / bp.total;
    const sus = Math.max(1, Math.round(app.planner.sustainableNew()));
    const daysLeft = Math.ceil(bp.left / sus);
    let mastered = 0, learning = 0;
    for (const w in s.cards) { const c = s.cards[w].r; if (c.st === 2 && c.s >= 21) mastered++; else learning++; }
    const knownAll = Object.keys(s.known).length;
    const vocab = Math.max(s.vocabEst || 0, knownAll) + Object.keys(s.cards).length;
    let rv = 0, ok = 0, mins = 0, days = 0;
    for (let i = 0; i < 30; i++) { const l = L[dayKey(now - i * DAY)]; if (l && l.rev) { rv += l.rev; ok += l.ok; mins += (l.ms || 0) / 60000; days++; } }
    const today = L[dayKey(now)] || {};
    const fc = app.planner.forecast(now + DAY, 30), cap = app.planner.capacity(), maxv = Math.max(cap, ...fc, 1);
    const weeks = 15, start = now - (weeks * 7 - 1) * DAY, cells = [];
    for (let i = 0; i < weeks * 7; i++) { const l = L[dayKey(start + i * DAY)]; cells.push(l ? l.rev || 0 : 0); }
    const lvl = n => n === 0 ? 0 : n < 20 ? 1 : n < 50 ? 2 : n < 100 ? 3 : 4;
    const R = 52, C = 2 * Math.PI * R;
    el.innerHTML = `<h1 class="ptitle">进度</h1>
      <section class="card goal" data-goto="pickbook">
        <div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="rbg"/><circle cx="60" cy="60" r="${R}" class="rk" stroke-dasharray="${C * pct} ${C}"/><circle cx="60" cy="60" r="${R}" class="rl" stroke-dasharray="${C * bp.learned / bp.total} ${C}"/></svg>
          <div class="rtx"><b>${Math.floor(pct * 100)}<small>%</small></b><span>${esc(b.name)}</span></div></div>
        <div class="gside">
          <div class="muted small">当前目标 <span class="linkbtn">更换 ›</span></div><b class="bname">${esc(b.full)}</b>
          <dl class="gnum"><dt>已学</dt><dd>${bp.learned}</dd><dt>认识</dt><dd>${bp.known}</dd><dt>还剩</dt><dd>${bp.left}</dd><dt>总词数</dt><dd>${bp.total}</dd></dl>
        </div>
      </section>
      <p class="muted small center">${bp.left ? `按每天约 ${sus} 个新词，大约 <b>${daysLeft}</b> 天后（${fmtDate(now + daysLeft * DAY)}）学完${esc(b.name)}` : `${esc(b.name)}已经全部学过了，可以换一个更高的目标`}</p>
      <div class="tiles">
        <div class="tile"><span>今天</span><b>${today.rev || 0}<small> 张 · 新词 ${today.nw || 0}</small></b></div>
        <div class="tile"><span>连续学习</span><b>${streak()}<small> 天</small></b></div>
        <div class="tile"><span>估计词汇量</span><b>${vocab}<small> 词</small></b></div>
        <div class="tile"><span>已掌握</span><b>${mastered}<small> 词 · 学习中 ${learning}</small></b></div>
      </div>
      <div class="card"><div class="row between"><b>未来 30 天的复习量</b><span class="muted small">虚线：每天 ${s.settings.minutes} 分钟能完成约 ${cap} 张</span></div>
        <div class="fc wide">${fc.map((n, i) => `<div class="fcb${n > cap ? ' over' : ''}"><span class="tr"><i style="height:${n / maxv * 100}%"></i></span><span class="d">${i % 7 === 0 ? (i === 0 ? '明天' : i + '天后') : ''}</span></div>`).join('')}
        <div class="capline" style="bottom:calc(${cap / maxv} * (100% - 18px) + 18px)"></div></div>
        <p class="muted small">复习量一直在虚线以下，说明没有欠单词债。</p></div>
      <div class="card"><b>学习日历</b><span class="muted small">最近 ${weeks} 周 · 近 30 天学了 ${days} 天，共 ${Math.round(mins)} 分钟，正确率 ${rv ? Math.round(ok / rv * 100) + '%' : '–'}</span>
        <div class="heat">${cells.map(n => `<i class="h${lvl(n)}" title="${n}"></i>`).join('')}</div></div>
      <div class="card"><b>各词书进度</b>${dict.BOOKS.map(x => { const p = bookProgress(x.id);
        return `<div class="bprow${x.id === b.id ? ' cur' : ''}"><span>${esc(x.full)}</span><span class="pbar sm"><i class="k" style="width:${p.known / p.total * 100}%"></i><i class="l" style="width:${p.learned / p.total * 100}%"></i></span><span class="muted small">${Math.floor((p.learned + p.known) / p.total * 100)}%</span></div>`; }).join('')}
        <div class="legend"><span><i class="l"></i>已学</span><span><i class="k"></i>认识（测试或标记）</span></div></div>
      <div class="menu"><button class="mitem" data-goto="mine"><span class="mi">${ICON.star}</span><span class="mtx"><b>我的单词</b><small>生词本、最近学的、顽固词、标记认识</small></span><span class="chev">›</span></button>
        <button class="mitem" data-goto="placement"><span class="mi">${ICON.chart}</span><span class="mtx"><b>重新测词汇量</b><small>${s.vocabEst ? '上次约 ' + s.vocabEst + ' 词' : '测一测，认识的词直接跳过'}</small></span><span class="chev">›</span></button></div>`;
    el.onclick = e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); };
  },
});
register('stats', { tab: 'progress', render(el) { go('progress', {}, { tab: true }); } });

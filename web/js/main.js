// 启动：加载词典 → 读取进度 → 同步 → 进入首页
import * as dict from './dict.js';
import { app, initApp, go, back, refresh, closeSheet, resetPlannerIndex, current, APP_VERSION, REPO } from './app.js';
import { initSync, syncNow, auth } from './sync.js';
import { save } from './store.js';
import { handleWordClicks } from './words.js';
import { isApp } from './native.js';
import { $, ICON, fitWords, debounce } from './util.js';
import './study.js';
import './views_read.js';
import './views_exam.js';
import './views_progress.js';
import { applyTheme } from './views_more.js';

function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

// 只有 App 需要检查更新（网页版刷新就是最新）
window.__checkUpdate = async function (force) {
  if (!isApp) return null;
  try {
    const last = +localStorage.getItem('shici.updChecked') || 0;
    if (!force && Date.now() - last < 6 * 3600e3) { const c = JSON.parse(localStorage.getItem('shici.updInfo') || 'null'); if (c && cmpVer(c.tag, APP_VERSION) > 0) app.update = c; return app.update; }
  } catch (e) {}
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    const info = { tag: j.tag_name, url: apk ? apk.browser_download_url : j.html_url, notes: j.body || '' };
    try { localStorage.setItem('shici.updChecked', String(Date.now())); localStorage.setItem('shici.updInfo', JSON.stringify(info)); } catch (e) {}
    app.update = cmpVer(info.tag, APP_VERSION) > 0 ? info : null;
    return app.update;
  } catch (e) { return null; }
};

// 安卓返回键：先关弹层，再返回上一页；到底了交给系统
window.__shiciBack = function () {
  if (closeSheet()) return true;
  if (app.stack.length > 1) { back(); return true; }
  const top = current();
  if (top.name && top.name !== 'home' && app.state && app.state.onboarded) { go('home', {}, { tab: true }); return true; }
  return false;
};

function wireNav() {
  const nav = $('#bnav');
  nav.innerHTML = [['home', 'words', '单词'], ['read', 'read', '推文'], ['exam', 'paper', '真题'], ['progress', 'chart', '进度'], ['more', 'gear', '设置']]
    .map(([t, i, n]) => `<button data-tab="${t}">${ICON[i]}<span>${n}</span></button>`).join('');
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    if (current().name === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go(b.dataset.tab, {}, { tab: true });
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#backdrop')) { closeSheet(); return; }
    const sh = e.target.closest('#sheet');
    if (sh && sh._onClick && sh._onClick(e)) return;
    handleWordClicks(e);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('resize', debounce(() => fitWords(document), 150));
}

async function boot() {
  const v = $('#view');
  v.innerHTML = `<div class="boot"><div class="logo big">拾词</div><p class="muted">正在加载词典…</p></div>`;
  try { await dict.loadDict('data/'); }
  catch (e) {
    console.error(e);
    v.innerHTML = `<div class="boot"><div class="logo big">拾词</div><p>词典加载失败</p><p class="muted small">${String(e.message || e)}</p><button class="btn primary" onclick="location.reload()">重试</button></div>`;
    return;
  }
  initApp();
  applyTheme(app.state.settings.theme);
  wireNav();
  initSync(() => app.state, () => { save(app.state); resetPlannerIndex(); applyTheme(app.state.settings.theme); refresh(); });
  go('home', {}, { tab: true });
  if (auth) syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (auth) syncNow(); refresh(); } });
  // 跨过凌晨 4 点时刷新首页任务
  let day = new Date(Date.now() - 4 * 3600e3).toDateString();
  setInterval(() => { const d = new Date(Date.now() - 4 * 3600e3).toDateString(); if (d !== day) { day = d; if (current().name === 'home') refresh(); } }, 60e3);
  window.__checkUpdate(false).then(u => { if (u && ['home', 'more', 'about'].includes(current().name)) refresh(); });
  if (!isApp && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

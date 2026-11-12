// 应用共享上下文：状态、计划器、页面切换、保存
import * as store from './store.js';
import { Planner, dayKey } from './planner.js';
import * as dict from './dict.js';
import { speak as nativeSpeak, NATIVE, saveFile } from './native.js';
import { scheduleSync } from './sync.js';
import { $, fitWords } from './util.js';

export const APP_VERSION = '2.1.1';
export const REPO = 'liugithub007/my-new-repo';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const WEB_URL = 'https://liugithub007.github.io/my-new-repo/';

export const app = { state: null, planner: null, views: {}, stack: [], listeners: {}, update: null };

let orderCache = { key: '', list: [] };
function learningOrder() {
  const s = app.state, key = s.settings.book + '|' + s.mine.join(',');
  if (orderCache.key !== key) {
    const seen = new Set(), list = [];
    for (const w of s.mine.concat(dict.bookWords(s.settings.book).order)) if (!seen.has(w)) { seen.add(w); list.push(w); }
    orderCache = { key, list };
  }
  return orderCache.list;
}

export function initApp() {
  app.state = store.load();
  app.planner = new Planner(app.state, { order: learningOrder, zh: w => dict.zhOf(w) });
  if (app.state.migratedFrom) { delete app.state.migratedFrom; store.save(app.state); }
}
export function replaceState(s) {
  app.state = s;
  app.planner = new Planner(app.state, { order: learningOrder, zh: w => dict.zhOf(w) });
  orderCache.key = '';
}
export function resetPlannerIndex() { app.planner.rebuildLoad(); orderCache.key = ''; }

export function on(evt, fn) { (app.listeners[evt] || (app.listeners[evt] = [])).push(fn); }
export function emit(evt, data) { (app.listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

let backupTimer = null;
export function commit() {
  app.state.updatedAt = Date.now();
  const ok = store.save(app.state);
  scheduleSync();
  if (NATIVE) { clearTimeout(backupTimer); backupTimer = setTimeout(nativeBackup, 3000); }
  emit('commit', ok);
}
export function nativeBackup() {
  if (!NATIVE) return;
  try { saveFile('拾词进度备份.json', JSON.stringify(app.state)); app.lastBackup = Date.now(); } catch (e) { app.backupErr = e.message; }
}
export const speak = (t, rate) => nativeSpeak(t, app.state.settings, rate);
export const todayLog = () => app.planner.todayLog(Date.now());

// ---------- 页面切换 ----------
const TABS = { home: 'home', read: 'read', exam: 'exam', progress: 'progress', more: 'more' };
export function register(name, view) { app.views[name] = view; }
function render() {
  const top = app.stack[app.stack.length - 1];
  const v = app.views[top.name];
  if (!v) return;
  document.body.dataset.view = top.name;
  document.body.classList.toggle('focus', !!v.focus);
  const tab = v.tab || 'more';
  document.querySelectorAll('#bnav button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === tab));
  const el = $('#view');
  el.innerHTML = '';
  window.scrollTo(0, 0);
  try { const r = v.render(el, top.params || {}); fitWords(el); if (r && r.then) r.then(() => fitWords(el)).catch(() => {}); }
  catch (e) { console.error(e); el.innerHTML = `<div class="empty">页面出错了：${String(e.message || e)}</div>`; }
}
export function go(name, params = {}, opts = {}) {
  const cur = app.stack[app.stack.length - 1];
  if (cur && app.views[cur.name] && app.views[cur.name].leave) app.views[cur.name].leave();
  if (opts.tab || TABS[name]) app.stack = [];
  if (opts.replace && app.stack.length) app.stack.pop();
  app.stack.push({ name, params });
  try { history.pushState({ n: app.stack.length }, ''); } catch (e) {}
  render();
}
export function refresh() { if (app.stack.length) render(); }
export function back() {
  if (app.stack.length <= 1) return false;
  const cur = app.stack[app.stack.length - 1];
  if (app.views[cur.name] && app.views[cur.name].leave) app.views[cur.name].leave();
  app.stack.pop();
  render();
  return true;
}
export const current = () => app.stack[app.stack.length - 1] || {};
window.addEventListener('popstate', () => { if (!closeSheet()) back(); });

// ---------- 底部弹层 ----------
export function openSheet(html, onClick) {
  const sh = $('#sheet'), bd = $('#backdrop');
  sh.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  sh.hidden = false; bd.hidden = false; fitWords(sh);
  sh._onClick = onClick || null;
  requestAnimationFrame(() => { sh.classList.add('on'); bd.classList.add('on'); });
}
export function closeSheet() {
  const sh = $('#sheet'); if (!sh || sh.hidden) return false;
  sh.classList.remove('on'); $('#backdrop').classList.remove('on');
  sh.hidden = true; $('#backdrop').hidden = true; sh._onClick = null;
  document.querySelectorAll('.tk.on').forEach(x => x.classList.remove('on'));
  return true;
}

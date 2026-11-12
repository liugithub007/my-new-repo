// 账号与云同步（Supabase，沿用 1.x 的 progress 表）
import { normalize } from './store.js';

export const SUPA_URL = 'https://mtbfddycnihdwyotyjwq.supabase.co';
export const SUPA_KEY = 'sb_publishable_Z2glcTsGDbd0o6ehlMc3AQ_3Qg5R6nv';
const EMAIL_DOMAIN = 'users.shici.app';
const AUTH_KEY = 'shici.auth';

export let auth = null;
try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) {}
export const sync = { busy: false, last: 0, err: '', timer: null, again: false };
const listeners = new Set();
export const onSyncChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

function saveAuth() { try { if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); else localStorage.removeItem(AUTH_KEY); } catch (e) {} }
export const unameOk = u => /^[a-z0-9_]{3,20}$/.test(u);
const emailOf = u => u + '@' + EMAIL_DOMAIN;

async function supa(path, opts = {}) {
  const headers = Object.assign({ apikey: SUPA_KEY, 'Content-Type': 'application/json' }, opts.headers || {});
  if (opts.auth) headers.Authorization = 'Bearer ' + auth.access_token;
  let r;
  try { r = await fetch(SUPA_URL + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }); }
  catch (e) { const err = new Error('network'); err.net = true; throw err; }
  const txt = await r.text(); let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error_code || data.error)) || ('HTTP ' + r.status);
    const err = new Error(String(msg)); err.status = r.status; throw err;
  }
  return data;
}
export function errText(e) {
  const m = (e && e.message) || String(e);
  if (e && e.net || /Failed to fetch|NetworkError|Load failed|network/i.test(m)) return '连不上同步服务器，请检查网络';
  if (/Invalid login credentials|invalid_credentials/i.test(m)) return '用户名或密码不对';
  if (/already registered|already exists|user_already_exists/i.test(m)) return '这个用户名已经有人用了，换一个试试';
  if (/Password should|at least 6|weak_password/i.test(m)) return '密码太简单了，至少 6 位';
  if (/Email not confirmed|email_not_confirmed/i.test(m)) return '服务器开着邮箱验证，暂时无法登录';
  if (/rate limit|too many|over_request_rate_limit|over_email_send_rate_limit/i.test(m)) return '操作太频繁，请过一会儿再试';
  if (/JWT|expired|refresh_token|invalid_grant|session_not_found/i.test(m)) return '登录已过期，请重新登录';
  if (/email.*invalid|invalid.*email|email_address_invalid/i.test(m)) return '服务器不接受这个用户名，请换一个';
  return m;
}
function setSession(d, username) {
  auth = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, uid: d.user && d.user.id, username };
  saveAuth();
}
async function ensureToken() {
  if (!auth) throw new Error('未登录');
  if (Date.now() < auth.expires_at - 60000) return;
  try { setSession(await supa('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } }), auth.username); }
  catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) { auth = null; saveAuth(); emit(); throw new Error('登录已过期，请重新登录'); } throw e; }
}
export async function signUp(u, p) {
  const d = await supa('/auth/v1/signup', { method: 'POST', body: { email: emailOf(u), password: p, data: { username: u } } });
  if (!d || !d.access_token) throw new Error('注册成功，但服务器开着邮箱验证，暂时无法登录');
  setSession(d, u);
}
export async function signIn(u, p) { setSession(await supa('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: emailOf(u), password: p } }), u); }
export async function changePassword(p) { await ensureToken(); await supa('/auth/v1/user', { method: 'PUT', auth: true, body: { password: p } }); }
export function signOut() {
  const a = auth; auth = null; saveAuth(); sync.last = 0; sync.err = '';
  if (a) fetch(SUPA_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + a.access_token } }).catch(() => {});
  emit();
}
export async function deleteAccount() {
  await ensureToken();
  await supa('/rest/v1/rpc/delete_my_account', { method: 'POST', auth: true, body: {} });
  auth = null; saveAuth(); sync.last = 0; emit();
}

/** 合并两份进度：同一个词以最近一次复习为准，两台设备各学各的也不会互相覆盖。返回本地是否有变化。 */
export function merge(local, remote) {
  let changed = false;
  const newer = (remote.updatedAt || 0) > (local.updatedAt || 0);
  for (const [w, re] of Object.entries(remote.cards || {})) {
    const le = local.cards[w];
    if (!le) { local.cards[w] = JSON.parse(JSON.stringify(re)); changed = true; continue; }
    for (const k of ['r', 's']) {
      const rc = re[k], lc = le[k];
      if (rc && (!lc || (rc.last || 0) > (lc.last || 0))) { le[k] = Object.assign({}, rc); changed = true; }
    }
    if (re.leech && !le.leech) { le.leech = 1; changed = true; }
    if (re.t && (!le.t || re.t < le.t)) le.t = re.t;
  }
  for (const [w, v] of Object.entries(remote.known || {})) if (!local.known[w]) { local.known[w] = v; changed = true; }
  for (const w of Object.keys(local.known)) {
    const e = local.cards[w]; if (!e) continue;
    const t = local.known[w], last = Math.max(e.r ? e.r.last : 0, e.s ? e.s.last : 0);
    if (typeof t === 'number' && t > last) delete local.cards[w]; else delete local.known[w];
    changed = true;
  }
  const mine = new Set(local.mine);
  for (const w of remote.mine || []) if (!mine.has(w)) { local.mine.push(w); mine.add(w); changed = true; }
  for (const [w, n] of Object.entries(remote.notes || {})) if (n && n !== local.notes[w] && (newer || !local.notes[w])) { local.notes[w] = n; changed = true; }
  for (const [day, rl] of Object.entries(remote.log || {})) {
    const ll = local.log[day] || (local.log[day] = {});
    for (const [f, v] of Object.entries(rl || {})) {
      if (typeof v === 'number' && v > (ll[f] || 0)) { ll[f] = v; changed = true; }
      else if (Array.isArray(v)) { const s = new Set(ll[f] || []); const before = s.size; v.forEach(x => s.add(x)); if (s.size !== before) { ll[f] = [...s]; changed = true; } }
    }
  }
  for (const [k, v] of Object.entries(remote.read || {})) if (v && !local.read[k]) { local.read[k] = v; changed = true; }
  for (const [k, v] of Object.entries(remote.papers || {})) { const l = local.papers[k]; if (v && (!l || (v.del && !l.del && (v.at || 0) >= (l.at || 0)))) { local.papers[k] = v; changed = true; } }
  for (const [k, v] of Object.entries(remote.examDone || {})) if (v && (!local.examDone[k] || (v.at || 0) > (local.examDone[k].at || 0))) { local.examDone[k] = v; changed = true; }
  if ((remote.vocabEst || 0) && (!local.vocabEst || newer)) { if (local.vocabEst !== remote.vocabEst) changed = true; local.vocabEst = remote.vocabEst; }
  const fresh = remote.onboarded && !local.onboarded;
  if (fresh) { local.onboarded = true; changed = true; }
  if ((newer || fresh) && remote.settings) { local.settings = Object.assign({}, local.settings, remote.settings); changed = true; }
  local.lastExport = Math.max(local.lastExport || 0, remote.lastExport || 0);
  local.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
  return changed;
}

let getState = () => null, onMerged = () => {};
export function initSync(getStateFn, onMergedFn) { getState = getStateFn; onMerged = onMergedFn; }

export async function syncNow() {
  if (!auth) return;
  if (sync.busy) { sync.again = true; return; }
  sync.busy = true; emit();
  const state = getState();
  try {
    await ensureToken();
    const rows = await supa('/rest/v1/progress?select=data&user_id=eq.' + encodeURIComponent(auth.uid), { auth: true });
    const remote = rows && rows[0] && rows[0].data;
    let changed = false;
    if (remote) { const r = normalize(JSON.parse(JSON.stringify(remote))); if (r) changed = merge(state, r); }
    await supa('/rest/v1/progress?on_conflict=user_id', { method: 'POST', auth: true,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: auth.uid, username: auth.username, data: state, updated_at: new Date().toISOString() } });
    sync.last = Date.now(); sync.err = '';
    if (changed) onMerged();
  } catch (e) { sync.err = errText(e); }
  finally {
    sync.busy = false; emit();
    if (sync.again) { sync.again = false; scheduleSync(3000); }
  }
}
export function scheduleSync(delay) {
  if (!auth) return;
  clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, delay == null ? 6000 : delay);
}

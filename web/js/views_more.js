// 设置菜单与各子页面：账号、学习计划、发音、提醒、统计、数据、关于、隐私政策、用户协议
import * as dict from './dict.js';
import { app, register, go, back, commit, refresh, speak, replaceState, resetPlannerIndex, APP_VERSION, RELEASES_URL, WEB_URL, REPO } from './app.js';
import { dayKey } from './planner.js';
import { DAY, expectedReviewsPerNewWord } from './fsrs.js';
import { esc, ICON, toast, twoStep, hhmm } from './util.js';
import { auth, sync, unameOk, signIn, signUp, signOut, deleteAccount, changePassword, syncNow, errText, merge, onSyncChange } from './sync.js';
import { isApp, appVersion, saveFile, openUrl, hasReminder, setReminder } from './native.js';
import { normalize, freshState } from './store.js';

const sub = (title) => `<div class="subhead"><button class="iconbtn" data-back>${ICON.back}</button><h1 class="ptitle">${title}</h1></div>`;
const item = (go, icon, title, desc, id = '') => `<button class="mitem" data-goto="${go}"><span class="mi">${ICON[icon]}</span><span class="mtx"><b>${title}</b><small${id ? ` id="${id}"` : ''}>${desc}</small></span><span class="chev">›</span></button>`;

register('more', {
  tab: 'more',
  render(el) {
    const s = app.state.settings, b = dict.bookById(s.book);
    el.innerHTML = `<h1 class="ptitle">设置</h1>
      <div class="menu">
        ${item('account', 'user', '账号与同步', auth ? `已登录：${esc(auth.username)}${sync.last ? ' · 上次同步 ' + hhmm(sync.last) : ''}` : '登录后，手机和电脑同步学习进度')}
        ${item('pickbook', 'book', '学习目标', b.full)}
        ${item('placement', 'chart', '词汇量测试', app.state.vocabEst ? '上次测试约 ' + app.state.vocabEst + ' 词' : '测一测，认识的词直接跳过')}
        ${item('plan', 'clock', '学习计划', `每天 ${s.minutes} 分钟 · 新词${s.newMode === 'auto' ? '自动' : '每天 ' + s.newPerDay + ' 个'}`)}
        ${item('mine', 'star', '我的单词', '生词本、顽固词、标记认识的词')}
      </div>
      <div class="menu">
        ${item('look', 'moon', '外观', ({ system: '跟随系统', light: '浅色', dark: '深色' })[s.theme] || '跟随系统')}
        ${item('voice', 'sound', '发音', `${s.accent === 'en-GB' ? '英音' : '美音'} · ${s.autoSpeak ? '自动朗读' : '手动朗读'}`)}
        ${hasReminder() ? item('reminder', 'bell', '每日提醒', s.reminder.on ? `每天 ${String(s.reminder.h).padStart(2, '0')}:${String(s.reminder.m).padStart(2, '0')}` : '未开启') : ''}
        ${item('data', 'data', '数据与备份', '导出、导入、重置')}
        ${item('about', 'info', '关于拾词', `版本 ${APP_VERSION}${app.update ? ' · 有新版本' : ''}`)}
      </div>
      ${!isApp ? `<div class="menu"><button class="mitem" id="getApp"><span class="mi">${ICON.words}</span><span class="mtx"><b>下载安卓 App</b><small>和网页版用同一个账号同步</small></span><span class="chev">›</span></button></div>` : ''}`;
    el.onclick = e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); if (e.target.closest('#getApp')) openUrl(RELEASES_URL); };
  },
});

// ---------------- 账号 ----------------
let accountRedraw = null;
onSyncChange(() => { const top = app.stack[app.stack.length - 1]; if (accountRedraw && top && top.name === 'account') accountRedraw(); });
register('account', {
  tab: 'more',
  render(el) {
    const draw = () => {
      if (!auth) {
        el.innerHTML = `${sub('账号与同步')}<div class="card form">
          <p class="muted">登录后，你在手机 App 和网页版上的进度会自动同步。没有账号就填好用户名和密码，点“注册”。</p>
          <label>用户名<input id="au" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="3–20 位小写字母、数字或下划线"></label>
          <label>密码<input id="ap" type="password" autocomplete="current-password" placeholder="至少 6 位"></label>
          <div class="two"><button class="btn" id="aUp">注册</button><button class="btn primary" id="aIn">登录</button></div>
          <div class="msg" id="am"></div>
          <p class="muted small">只保存你的用户名和学习进度，密码加密存储。暂不支持找回密码，请记好。注册即表示同意<button class="linkbtn" data-goto="terms">用户协议</button>和<button class="linkbtn" data-goto="privacy">隐私政策</button>。</p></div>`;
        return;
      }
      el.innerHTML = `${sub('账号与同步')}<div class="card">
        <div class="muted small">已登录</div><div class="hw sm">${esc(auth.username)}</div>
        <p class="muted">${sync.busy ? '正在同步…' : sync.err ? '上次同步失败：' + esc(sync.err) : sync.last ? '上次同步：' + new Date(sync.last).toLocaleString() : '还没有同步过'}</p>
        <p class="muted small">每次答题后自动同步。在另一台设备用同一个账号登录，进度会自动合并：同一个词以最近一次复习为准，不会互相覆盖。</p>
        <div class="row"><button class="btn primary" id="aSync">立即同步</button><button class="btn" id="aOut">退出登录</button></div></div>
        <div class="card form"><b>修改密码</b><label>新密码<input id="np" type="password" autocomplete="new-password" placeholder="至少 6 位"></label><button class="btn" id="aPw">修改</button><div class="msg" id="pm"></div></div>
        <div class="card"><b>删除账号</b><p class="muted small">删除账号和云端的全部学习进度，无法恢复。这台设备上的进度会保留。</p><button class="btn danger" id="aDel">删除账号和云端数据</button></div>`;
    };
    draw();
    accountRedraw = draw;
    el.onclick = async e => {
      const t = e.target;
      if (t.closest('[data-back]')) return back();
      const g = t.closest('[data-goto]'); if (g) return go(g.dataset.goto);
      const msg = el.querySelector('#am');
      if (t.closest('#aIn') || t.closest('#aUp')) {
        const up = !!t.closest('#aUp');
        const u = el.querySelector('#au').value.trim().toLowerCase(), p = el.querySelector('#ap').value;
        if (!unameOk(u)) { msg.textContent = '用户名用 3–20 位小写英文字母、数字或下划线'; return; }
        if (p.length < 6) { msg.textContent = '密码至少 6 位'; return; }
        msg.textContent = up ? '正在注册…' : '正在登录…'; t.disabled = true;
        try { if (up) await signUp(u, p); else await signIn(u, p); await syncNow(); toast(up ? '注册成功，进度已开始同步' : '登录成功，进度已同步'); if (app.stack.some(x => x.name === 'welcome')) { if (app.state.onboarded) go('home', {}, { tab: true }); else go('pickbook', { onboarding: true }); } else draw(); }
        catch (err) { msg.textContent = errText(err); t.disabled = false; }
        return;
      }
      if (t.closest('#aSync')) { await syncNow(); toast(sync.err ? '同步失败：' + sync.err : '已同步'); draw(); return; }
      if (t.closest('#aOut')) { signOut(); toast('已退出登录，这台设备上的进度仍然保留'); draw(); return; }
      if (t.closest('#aPw')) {
        const p = el.querySelector('#np').value, pm = el.querySelector('#pm');
        if (p.length < 6) { pm.textContent = '密码至少 6 位'; return; }
        try { await changePassword(p); pm.textContent = '密码已修改'; } catch (err) { pm.textContent = errText(err); }
        return;
      }
      const del = t.closest('#aDel'); if (del) twoStep(del, async () => { try { await deleteAccount(); toast('账号和云端数据已删除'); draw(); } catch (err) { toast('删除失败：' + errText(err)); } });
    };
  },
});

// ---------------- 学习计划 ----------------
register('plan', {
  tab: 'more',
  render(el) {
    const draw = () => {
      const s = app.state.settings, sus = app.planner.sustainableNew(), k = expectedReviewsPerNewWord(s.retention);
      const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      el.innerHTML = `${sub('学习计划')}
        <div class="card"><b>每天学习时间</b><p class="muted small">复习量会控制在这个时间内。宁少勿多，能坚持下来才有用。</p>
          ${seg('minutes', [10, 15, 20, 30, 45, 60].map(x => [x, x + '<small>分钟</small>']), s.minutes)}</div>
        <div class="card"><b>每天新词</b>
          ${seg('newMode', [['auto', '自动（推荐）'], ['fixed', '固定数量']], s.newMode)}
          ${s.newMode === 'auto' ? `<p class="muted small">按你的时间和答题速度，长期可持续的速度约<b>每天 ${Math.round(sus)} 个</b>。复习多的日子会自动少给，积压时暂停，保证不欠单词债。</p>`
            : `<div class="stepper"><button data-step="-5">−5</button><b>${s.newPerDay}</b><button data-step="5">+5</button></div>
               ${s.newPerDay > sus * 1.3 ? `<div class="notice warn">按每天 ${s.minutes} 分钟，长期只能消化约 ${Math.round(sus)} 个新词。每天 ${s.newPerDay} 个，几周后复习量会超出你的时间。</div>` : '<p class="muted small">积压时仍会自动暂停新词。</p>'}`}</div>
        <div class="card"><b>记忆目标</b><p class="muted small">复习时希望能想起来的概率。越高复习越频繁。</p>
          ${seg('retention', [[0.85, '轻松 85%'], [0.9, '标准 90%'], [0.95, '冲刺 95%']], s.retention)}
          <p class="muted small">在这个目标下，一个新词第一年平均要复习约 ${k.toFixed(1)} 次。</p></div>
        <div class="card toggles">
          <label class="tg"><span><b>拼写练习</b><small>学会的词再练一次拼写。复习量会增加约一倍</small></span><input type="checkbox" data-tg="spelling" ${s.spelling ? 'checked' : ''}></label>
          <label class="tg"><span><b>听音模式</b><small>复习时只放发音，不显示单词，练听力</small></span><input type="checkbox" data-tg="listenFront" ${s.listenFront ? 'checked' : ''}></label>
        </div>`;
    };
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      const b = e.target.closest('[data-seg] [data-v]');
      if (b) { const k = b.parentElement.dataset.seg, v = b.dataset.v; app.state.settings[k] = k === 'newMode' ? v : +v; commit(); draw(); return; }
      const st = e.target.closest('[data-step]');
      if (st) { const s = app.state.settings; s.newPerDay = Math.max(0, Math.min(200, s.newPerDay + +st.dataset.step)); commit(); draw(); }
    };
    el.onchange = e => { const t = e.target.closest('[data-tg]'); if (t) { app.state.settings[t.dataset.tg] = t.checked; commit(); resetPlannerIndex(); } };
  },
});

// ---------------- 发音 ----------------
register('voice', {
  tab: 'more',
  render(el) {
    const draw = () => {
      const s = app.state.settings;
      el.innerHTML = `${sub('发音')}<div class="card toggles">
        <label class="tg"><span><b>出题时自动朗读</b></span><input type="checkbox" data-tg="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label></div>
        <div class="card"><b>口音</b><div class="seg" data-seg="accent"><button data-v="en-US" class="${s.accent === 'en-US' ? 'on' : ''}">美音</button><button data-v="en-GB" class="${s.accent === 'en-GB' ? 'on' : ''}">英音</button></div>
        <b>语速</b><div class="seg" data-seg="rate">${[[0.7, '慢'], [0.85, '较慢'], [0.95, '正常'], [1.1, '较快']].map(([v, l]) => `<button data-v="${v}" class="${s.rate === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn" data-say="The quick brown fox jumps over the lazy dog.">${ICON.speaker} 试听</button>
        <p class="muted small">${isApp ? '使用手机系统自带的朗读引擎。没有声音的话，请在手机“设置 → 无障碍 → 文字转语音”里安装或选择英语语音。' : '使用浏览器自带的朗读功能，不同浏览器音色不同。'}</p></div>`;
    };
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      const b = e.target.closest('[data-seg] [data-v]');
      if (b) { const k = b.parentElement.dataset.seg; app.state.settings[k] = k === 'rate' ? +b.dataset.v : b.dataset.v; commit(); draw(); speak('pronunciation'); }
    };
    el.onchange = e => { const t = e.target.closest('[data-tg]'); if (t) { app.state.settings[t.dataset.tg] = t.checked; commit(); } };
  },
});

// ---------------- 外观 ----------------
export function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  try { if (window.ShiciNative && window.ShiciNative.setDark) window.ShiciNative.setDark(dark); } catch (e) {}
}
register('look', {
  tab: 'more',
  render(el) {
    const draw = () => {
      const t = app.state.settings.theme || 'system';
      el.innerHTML = `${sub('外观')}<div class="card"><b>主题</b><div class="seg">${[['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => `<button data-v="${v}" class="${t === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    };
    draw();
    el.onclick = e => {
      if (e.target.closest('[data-back]')) return back();
      const b = e.target.closest('[data-v]'); if (b) { app.state.settings.theme = b.dataset.v; applyTheme(b.dataset.v); commit(); draw(); }
    };
  },
});

// ---------------- 提醒 ----------------
register('reminder', {
  tab: 'more',
  render(el) {
    const r = app.state.settings.reminder;
    el.innerHTML = `${sub('每日提醒')}<div class="card toggles">
      <label class="tg"><span><b>每天提醒我学习</b><small>到点发一条通知，告诉你今天要复习多少</small></span><input type="checkbox" id="ron" ${r.on ? 'checked' : ''}></label>
      <label class="tg"><span><b>提醒时间</b></span><input type="time" id="rt" value="${String(r.h).padStart(2, '0')}:${String(r.m).padStart(2, '0')}"></label></div>
      <p class="muted small">第一次开启时，手机会询问是否允许通知，请选“允许”。部分手机还需要在系统设置里允许拾词后台运行，提醒才准时。</p>`;
    const apply = () => {
      const [h, m] = el.querySelector('#rt').value.split(':').map(Number);
      Object.assign(r, { on: el.querySelector('#ron').checked, h: h || 0, m: m || 0 });
      commit();
      const ok = setReminder(r.on, r.h, r.m, '');
      toast(r.on ? (ok ? `已设置每天 ${el.querySelector('#rt').value} 提醒` : '设置失败，请检查通知权限') : '已关闭提醒');
    };
    el.onchange = apply;
    el.onclick = e => { if (e.target.closest('[data-back]')) back(); };
  },
});

// ---------------- 数据 ----------------
register('data', {
  tab: 'more',
  render(el) {
    el.innerHTML = `${sub('数据与备份')}
      <div class="card"><b>导出备份</b><p class="muted small">把全部学习进度存成一个文件。${isApp ? '保存在手机的“下载/拾词”文件夹。App 每次答题后也会自动备份到同一位置，卸载 App 也不会删除。' : '会下载到电脑的下载文件夹。'}</p><button class="btn" id="dExp">导出</button></div>
      <div class="card"><b>从备份恢复</b><p class="muted small">选择之前导出的文件。会和当前进度合并，不会丢掉现在的记录。1.x 版本的备份也能导入。</p>
        <label class="btn" for="dImp">选择文件</label><input type="file" id="dImp" accept=".json,application/json" hidden></div>
      <div class="card"><b>撤销词汇量测试的结果</b><p class="muted small">把测试时自动跳过的词放回学习队列。</p><button class="btn" id="dPl">撤销</button></div>
      <div class="card"><b>重置学习进度</b><p class="muted small">清空这台设备上的全部学习记录。已登录的话，下次同步会从云端恢复；想彻底清空请先删除账号。</p><button class="btn danger" id="dReset">重置</button></div>
      <div class="msg" id="dm"></div>`;
    const dm = el.querySelector('#dm');
    el.onclick = e => {
      const t = e.target;
      if (t.closest('[data-back]')) return back();
      if (t.closest('#dExp')) { try { app.state.lastExport = Date.now(); commit(); const where = saveFile('拾词备份-' + dayKey(Date.now()) + '.json', JSON.stringify(app.state)); dm.textContent = '已导出到：' + where; } catch (err) { dm.textContent = '导出失败：' + err.message; } return; }
      if (t.closest('#dPl')) { let n = 0; for (const w of Object.keys(app.state.known)) if (app.state.known[w] === 'p') { delete app.state.known[w]; n++; } commit(); dm.textContent = n ? `已放回 ${n} 个词` : '没有需要撤销的'; return; }
      const r = t.closest('#dReset'); if (r) twoStep(r, () => { const f = freshState(); f.onboarded = true; f.settings = app.state.settings; replaceState(f); commit(); dm.textContent = '学习进度已清空'; });
    };
    el.onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { const s = normalize(JSON.parse(String(rd.result))); if (!s) throw 0; merge(app.state, s); app.state.onboarded = true; resetPlannerIndex(); commit(); dm.textContent = `已合并导入：现在共 ${Object.keys(app.state.cards).length} 个学过的词`; }
        catch (err) { dm.textContent = '这个文件不是拾词的备份'; }
      };
      rd.readAsText(f); e.target.value = '';
    };
  },
});

// ---------------- 关于 ----------------
register('about', {
  tab: 'more',
  render(el) {
    const av = appVersion();
    el.innerHTML = `${sub('关于拾词')}
      <div class="card center"><div class="logo big">拾词</div><p class="muted">科学背单词，每天一点，不欠单词债</p>
        <p class="muted small">${av ? `App ${esc(av.name)} · ` : '网页版 · '}内容版本 ${APP_VERSION}</p>
        ${isApp ? `<button class="btn" id="chk">${app.update ? '下载新版本 ' + esc(app.update.tag) : '检查更新'}</button>` : `<p class="muted small">网页版地址：${WEB_URL}</p>`}</div>
      <div class="menu">${item('privacy', 'shield', '隐私政策', '我们收集什么、怎么保存')}${item('terms', 'info', '用户协议', '使用条款')}</div>
      <div class="card"><b>开源与致谢</b><ul class="small muted">
        <li>词典数据：ECDICT（MIT 协议）github.com/skywind3000/ECDICT</li>
        <li>记忆算法：FSRS（Free Spaced Repetition Scheduler）</li>
        <li>记忆法、例句、故事：拾词原创</li></ul></div>
      <div class="card"><b>意见反馈</b><p class="muted small">遇到问题或有建议，欢迎在 GitHub 上提出：github.com/${REPO}/issues</p><button class="btn" id="fb">去反馈</button></div>`;
    el.onclick = async e => {
      if (e.target.closest('[data-back]')) return back();
      const g = e.target.closest('[data-goto]'); if (g) return go(g.dataset.goto);
      if (e.target.closest('#fb')) return openUrl(`https://github.com/${REPO}/issues`);
      if (e.target.closest('#chk')) {
        if (app.update) return openUrl(app.update.url || RELEASES_URL);
        const u = await window.__checkUpdate(true);
        if (u) refresh(); else toast('已经是最新版本');
      }
    };
  },
});

const PRIVACY = `<h2>隐私政策</h2><p class="muted small">更新日期：2026 年 11 月</p>
<p>拾词（以下简称“我们”）重视你的隐私。本政策说明我们收集哪些信息、如何使用和保存。</p>
<h3>我们收集的信息</h3><ul>
<li><b>不登录时</b>：不收集任何信息。学习进度只保存在你的设备上。</li>
<li><b>登录后</b>：用户名、密码（以加密形式存储，任何人都无法看到明文）和学习进度（学过哪些词、复习记录、设置、笔记）。</li>
<li>我们不收集手机号、通讯录、位置、设备标识等信息，也不使用任何广告或统计追踪工具。</li></ul>
<h3>信息的用途</h3><p>仅用于在你的多台设备之间同步学习进度。不会出售、出租或提供给任何第三方，也不会用于广告。</p>
<h3>存储地点</h3><p>登录后的数据存储在 Supabase 提供的云数据库中（服务器位于中国大陆以外）。数据传输全程加密（HTTPS）。</p>
<h3>你的权利</h3><ul><li>随时在“设置 → 账号与同步”中删除账号，云端数据会被永久删除。</li><li>随时导出全部学习数据。</li><li>不登录也能使用全部学习功能。</li></ul>
<h3>未成年人</h3><p>如果你未满 14 周岁，请在监护人同意和指导下注册账号。</p>
<h3>安卓 App 的权限</h3><ul><li>网络：同步进度、加载网页字体、检查更新。</li><li>通知：仅在你开启“每日提醒”后发送学习提醒。</li><li>文件：只把备份文件写入“下载/拾词”文件夹。</li></ul>
<h3>联系我们</h3><p>如有疑问，请在 github.com/${REPO}/issues 联系我们。</p>`;
const TERMS = `<h2>用户协议</h2><p class="muted small">更新日期：2026 年 11 月</p>
<p>欢迎使用拾词。使用本软件即表示你同意以下条款。</p>
<h3>服务内容</h3><p>拾词是一款免费的英语单词学习工具，提供词书、间隔复习、阅读等功能。我们会持续改进，功能可能调整。</p>
<h3>账号</h3><ul><li>请妥善保管用户名和密码。目前不支持找回密码。</li><li>不得用于违法用途，不得干扰或攻击服务。</li><li>每人每个账号仅供个人使用。</li></ul>
<h3>内容与知识产权</h3><ul><li>词典释义来自开源项目 ECDICT（MIT 协议）。</li><li>记忆法、例句、故事等原创内容版权归拾词所有，仅供个人学习使用。</li></ul>
<h3>免责声明</h3><p>我们尽力保证内容准确，但不对释义、例句的完全准确性和学习效果作保证。因设备、网络等原因造成的数据丢失，请通过导出备份或登录同步来防范。</p>
<h3>协议变更</h3><p>协议如有重大变更，会在 App 内提示。</p>`;
register('privacy', { tab: 'more', render(el) { el.innerHTML = `${sub('隐私政策')}<div class="card doc">${PRIVACY}</div>`; el.onclick = e => { if (e.target.closest('[data-back]')) back(); }; } });
register('terms', { tab: 'more', render(el) { el.innerHTML = `${sub('用户协议')}<div class="card doc">${TERMS}</div>`; el.onclick = e => { if (e.target.closest('[data-back]')) back(); }; } });

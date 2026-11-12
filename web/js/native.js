// 安卓 App 外壳提供的能力（网页版里这些都会安全地降级）
export const NATIVE = (window.ShiciNative && typeof window.ShiciNative.saveBackup === 'function') ? window.ShiciNative : null;
export const isApp = !!NATIVE;

let voices = [];
if ('speechSynthesis' in window) {
  try { voices = speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices(); }; } catch (e) {}
}
export function speak(text, settings, rate) {
  if (!text) return;
  const accent = settings.accent || 'en-US', r = rate || settings.rate || 0.95;
  if (NATIVE) { try { NATIVE.speak(String(text), accent, r); return; } catch (e) {} }
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = accent; u.rate = r;
    const vs = voices.filter(v => v.lang && v.lang.replace('_', '-').startsWith(accent));
    if (vs.length) u.voice = vs.find(v => /Samantha|Daniel|Google|Serena|Karen|Natural|Premium|Enhanced/i.test(v.name)) || vs[0];
    speechSynthesis.speak(u);
  } catch (e) {}
}
export const canSpeak = () => !!NATIVE || ('speechSynthesis' in window);

export function appVersion() {
  if (!NATIVE) return null;
  try { const v = String(NATIVE.version()).split('|'); return { name: v[0], code: +v[1] }; } catch (e) { return null; }
}
export function saveFile(name, data) {
  if (NATIVE) {
    const r = String(NATIVE.saveBackup(name, data));
    if (r.startsWith('ERR')) throw new Error(r.slice(4));
    return r;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return '下载文件夹';
}
export function openUrl(url) {
  if (NATIVE) { try { NATIVE.openUrl(url); return; } catch (e) {} }
  window.open(url, '_blank', 'noopener');
}
export const hasReminder = () => !!(NATIVE && typeof NATIVE.setReminder === 'function');
export function setReminder(on, h, m, text) {
  if (!hasReminder()) return false;
  try { return !!NATIVE.setReminder(!!on, h | 0, m | 0, String(text || '')); } catch (e) { return false; }
}
export function setReminderText(text) {
  if (NATIVE && typeof NATIVE.setReminderText === 'function') { try { NATIVE.setReminderText(String(text)); } catch (e) {} }
}

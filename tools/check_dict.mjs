import { readFileSync } from 'node:fs';
globalThis.fetch = async p => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL('../web/' + p, import.meta.url))) });
const D = await import('../web/js/dict.js');
await D.loadDict('data/');
console.log('pseudo real?', D.PSEUDO.filter(D.isRealWord));
const test = ['happiness','unhappy','teacher','corner','belly','deliver','invent','repair','carefully','disagree','movement','reconsider','international','misunderstand','basement','number','overcome','powerful','useless','modernize','childhood','friendship','independence','discover','careless','department','government','development','reality','national'];
for (const w of test){ const m = D.morph(w); console.log(w.padEnd(15), m ? m.map(x=>x.t==='b'?x.w+'('+x.zh+')':x.a+'('+x.m+')').join(' + ') : '—'); }
let n=0, tot=0; for (const w of D.bookWords('cet4').order){ tot++; if (D.morph(w)) n++; } console.log('cet4 morph coverage', n, '/', tot);
for (const b of D.BOOKS){ const x = D.bookWords(b.id); console.log(b.id, x.total, 'fresh', x.freshCount, 'first:', x.order.slice(0,8).join(',')); }
console.log(['went','studies','mice','children','better','abandoned','ran','Puddleton','mayor'].map(t=>t+'→'+(D.lemma(t)||'?')).join('  '));

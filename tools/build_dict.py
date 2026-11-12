import csv, json, re, gzip
csv.field_size_limit(10**8)
TAGS = ['zk','gk','cet4','cet6','ky','ielts','toefl','gre']
BIT = {t: 1 << i for i, t in enumerate(TAGS)}
def phon(p):
    p = p.replace('ә', 'ə').replace("'", 'ˈ').replace(':', 'ː')
    p = re.sub(r'(^|[\s(])[,]', r'\1ˌ', p).replace(',', 'ˌ')
    return p.strip()
def clean_tr(t, maxlines=4):
    lines = [x.strip() for x in t.replace('\\n', '\n').split('\n') if x.strip()]
    good = [x for x in lines if not x.startswith('[')]
    if not good: good = [re.sub(r'^\[网络\]\s*', '', x) for x in lines[:1]]
    out = []
    good = [re.sub(r'^a\. ', 'adj. ', re.sub(r'^ad\. ', 'adv. ', x)) for x in good]
    for x in good[:maxlines]:
        if len(x) > 70: x = x[:70].rsplit('；', 1)[0].rsplit(',', 1)[0] + '…'
        out.append(x)
    return '\n'.join(out)
def rank(r):
    f = int(r['frq'] or 0); b = int(r['bnc'] or 0)
    return f or b or 999999
book, extra, forms = [], [], {}
with open('ecdict.csv', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        w = r['word']
        if not re.fullmatch(r"[A-Za-z][A-Za-z'\- ]*", w): continue
        tags = [t for t in r['tag'].split() if t in BIT]
        tr = r['translation']
        if not tr: continue
        if tags:
            mask = sum(BIT[t] for t in tags)
            star = int(r['collins'] or 0) + (8 if r['oxford'] == '1' else 0)
            ex = {}
            for part in (r['exchange'] or '').split('/'):
                if ':' in part:
                    k, v = part.split(':', 1)
                    if k in 'pdi3srt' and v and v.lower() != w.lower(): ex.setdefault(k, v)
            book.append([w, phon(r['phonetic']), clean_tr(tr), rank(r), mask, star, ex])
        else:
            rk = rank(r)
            if rk <= 20000 and ' ' not in w and w.islower():
                extra.append([w, clean_tr(tr, 2), rk])
bookset = {b[0].lower() for b in book}
extra = [e for e in extra if e[0].lower() not in bookset]
book.sort(key=lambda b: (b[3], b[0]))
fm = {}
for b in book:
    for k, v in b[6].items(): fm.setdefault(v.lower(), b[0])
data = {'v': 1, 'source': 'ECDICT (MIT License) https://github.com/skywind3000/ECDICT',
        'tags': TAGS, 'words': [b[:6] for b in book], 'forms': fm, 'extra': [e[:2] for e in sorted(extra, key=lambda e: e[2])]}
s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open('dict.json', 'w', encoding='utf-8').write(s)
print('book', len(book), 'extra', len(extra), 'forms', len(fm), 'bytes', len(s.encode()), 'gz', len(gzip.compress(s.encode())))
for t in TAGS: print(t, sum(1 for b in book if b[4] & BIT[t]))
print([b[:6] for b in book[:3]], [b[:6] for b in book if b[0] in ('abandon','mitigate','ubiquitous')])

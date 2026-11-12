"""把 tools/exams/*.py 里的阅读文章整理成 web/data/exams.json"""
import json, random, glob, importlib.util, os, re
here = os.path.dirname(os.path.abspath(__file__))
papers = []
for f in sorted(glob.glob(os.path.join(here, 'exams', 'p*.py'))):
    spec = importlib.util.spec_from_file_location(os.path.basename(f)[:-3], f)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    papers += m.PAPERS
ids = set()
for p in papers:
    assert p['id'] not in ids, p['id']; ids.add(p['id'])
    for para in p['paras']:
        for en, zh in para: assert en.strip() and zh.strip(), (p['id'], en)
    for q in p['qs']:
        assert len(q['o']) == 4 and 0 <= q['a'] < 4 and q['why'], (p['id'], q['q'])
    p['paras'] = [[list(s) for s in para] for para in p['paras']]
    # 打乱选项顺序，让正确答案在 A–D 之间分布均匀（固定种子，每次构建结果一样）
    rnd = random.Random(p['id'])
    targets = [0, 1, 2, 3] * 2; rnd.shuffle(targets)
    for q, t in zip(p['qs'], targets):
        right = q['o'][q['a']]; others = [o for i, o in enumerate(q['o']) if i != q['a']]; rnd.shuffle(others)
        others.insert(t, right); q['o'] = others; q['a'] = t
    n = sum(len(re.findall(r"[A-Za-z][A-Za-z'-]*", en)) for para in p['paras'] for en, _ in para)
    ans = ''.join('ABCD'[q['a']] for q in p['qs'])
    print(f"{p['id']:8} {n:4} words  {len(p['qs'])} qs  answers {ans}")
out = os.path.join(here, '..', 'web', 'data', 'exams.json')
json.dump({'v': 1, 'note': '拾词原创的考试题型模拟阅读，非历年考试原文', 'papers': papers}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('wrote', out, os.path.getsize(out))

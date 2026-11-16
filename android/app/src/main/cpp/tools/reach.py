import os, re
inc = re.compile(r'#\s*include\s*"([^"]+)"')
files, byname = {}, {}
for d, _, fs in os.walk('.'):
    if d.startswith('./oboe') or d.startswith('./tools'):
        continue
    for f in fs:
        if f.endswith(('.h', '.cpp')):
            p = os.path.normpath(os.path.join(d, f))
            byname.setdefault(f, []).append(p)
            with open(p, errors='ignore') as fh:
                files[p] = {os.path.basename(m) for m in inc.findall(fh.read())}
seen = set()
stack = [p for p in files if p.startswith('jni' + os.sep) and p.endswith('.cpp')]
while stack:
    p = stack.pop()
    if p in seen:
        continue
    seen.add(p)
    for name in files[p]:
        stack.extend(byname.get(name, []))
    stem, ext = os.path.splitext(p)
    if ext == '.h':
        stack.extend(q for q in files if q == stem + '.cpp')
dead = sorted(set(files) - seen)
print('\n'.join(dead))
print(len(dead), 'file tak terjangkau dari jni/')

import os

path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src', 'components', 'klinika', 'ElofizetesTab.tsx'))

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

out = []
buf = []

def flush():
    if not buf:
        return
    s = ''.join(buf)
    try:
        fixed = s.encode('latin-1').decode('utf-8')
    except Exception:
        fixed = s
    out.append(fixed)
    buf.clear()

for ch in text:
    if ord(ch) < 256:
        buf.append(ch)
    else:
        flush()
        out.append(ch)

flush()

result = ''.join(out)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(result)

print('Done. Characters:', len(result))

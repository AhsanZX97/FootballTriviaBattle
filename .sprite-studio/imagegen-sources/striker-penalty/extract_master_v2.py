from collections import Counter
from PIL import Image

REF = 'worktrees/general/references/3c79af94-striker-idle-b.png'
OUT = '.sprite-studio/imagegen-sources/striker-penalty/master-v2.png'
PALETTE = [
    (3, 1, 38), (38, 30, 53), (88, 75, 97), (127, 31, 46), (174, 80, 76), (209, 161, 144),
    (180, 36, 43), (214, 50, 50), (246, 249, 253), (202, 212, 225),
]
SHORTS = [(3, 1, 38), (246, 249, 253), (202, 212, 225)]
im = Image.open(REF).convert('RGB')
px = im.load()
B = 2048 / 100


def is_key(c):
    return c[0] > 180 and c[1] < 110 and c[2] > 180


def nearest(c, palette):
    return min(palette, key=lambda p: sum((a - b) ** 2 for a, b in zip(c, p)))


native = {}
for j in range(21, 82):
    for i in range(39, 62):
        votes = Counter()
        for dy in range(-4, 5, 2):
            for dx in range(-4, 5, 2):
                votes[px[int((i + .5) * B) + dx, int((j + .5) * B) + dy]] += 1
        c = votes.most_common(1)[0][0]
        if not is_key(c):
            x, y = i - 39, j - 21
            in_shorts = 31 <= y <= 40 and 5 <= x <= 17
            native[(x, y)] = nearest(c, SHORTS if in_shorts else PALETTE)

canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
cp = canvas.load()
for (x, y), c in native.items():
    for dy in range(2):
        for dx in range(2):
            cp[95 + 2 * x + dx, 116 + 2 * y + dy] = c + (255,)
canvas.save(OUT)

codes = {c: 'ABCDEFGHIJ'[k] for k, c in enumerate(PALETTE)}
for y in range(61):
    print(f'{y:2d} ' + ''.join(codes[native[(x, y)]] if (x, y) in native else '.' for x in range(23)))

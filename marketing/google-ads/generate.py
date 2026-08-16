"""Generate Google Ads image assets for Football Trivia Battle.

Outputs the three ratios Google Ads accepts:
  landscape 1.91:1 -> 1200x628
  square     1:1   -> 1200x1200
  portrait   4:5   -> 1200x1500

Requires: pillow, fonttools, brotli.
Run from the repo root:  python marketing/google-ads/generate.py
"""
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "android/app/src/main/play/listings/en-US/graphics"
OUT = ROOT / "marketing/google-ads"
OUT.mkdir(parents=True, exist_ok=True)

# PIL cannot read woff2, so unpack the game font to a temp ttf
_tmp = Path(tempfile.mkdtemp())
_f = TTFont(ROOT / "src/assets/fonts/press-start-2p-latin.woff2")
_f.flavor = None
_f.save(_tmp / "pressstart.ttf")

# --- palette, sampled from the game art -------------------------------------
NAVY_TOP = (12, 16, 34)
NAVY_BOT = (32, 40, 76)
PITCH = (54, 132, 60)
PITCH_DARK = (34, 88, 42)
YELLOW = (250, 200, 34)
ORANGE = (242, 101, 34)
WHITE = (255, 255, 255)
INK = (14, 16, 28)

PIXEL = str(_tmp / "pressstart.ttf")       # Press Start 2P, the in-game font
HEAVY = "C:/Windows/Fonts/ariblk.ttf"      # Arial Black
BOLD = "C:/Windows/Fonts/arialbd.ttf"


def f_pixel(size):
    return ImageFont.truetype(PIXEL, size)


def f_heavy(size):
    return ImageFont.truetype(HEAVY, size)


def f_bold(size):
    return ImageFont.truetype(BOLD, size)


# --- building blocks --------------------------------------------------------
def gradient_bg(w, h):
    """Navy vertical gradient + scanlines + pitch strip at the bottom."""
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(
            int(NAVY_TOP[i] + (NAVY_BOT[i] - NAVY_TOP[i]) * t) for i in range(3)))

    # scanlines, echoing the CRT/pixel look
    scan = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ds = ImageDraw.Draw(scan)
    for y in range(0, h, 4):
        ds.line([(0, y), (w, y)], fill=(0, 0, 0, 26))
    img = Image.alpha_composite(img.convert("RGBA"), scan).convert("RGB")

    # pitch strip along the bottom with a touch-line
    d = ImageDraw.Draw(img)
    strip = int(h * 0.10)
    d.rectangle([0, h - strip, w, h], fill=PITCH_DARK)
    d.rectangle([0, h - strip, w, h - strip + max(3, h // 180)], fill=PITCH)
    return img


def cover(img, w, h, pixel_art=True, focus=0.5):
    """Scale+crop img to exactly w x h. focus biases the vertical crop
    (0 = keep the top, 1 = keep the bottom)."""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    resample = Image.NEAREST if (pixel_art and scale >= 1.5) else Image.LANCZOS
    img = img.resize((nw, nh), resample)
    left = (nw - w) // 2
    top = int((nh - h) * focus)
    return img.crop((left, top, left + w, top + h))


def scrim(img, frac=0.62, strength=234):
    """Dark gradient rising from the bottom edge so text stays readable.
    Opaque at the very bottom, fading to clear at the top of the span."""
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    span = int(h * frac)
    for i in range(span):
        t = i / max(span - 1, 1)          # 0 at the bottom row, 1 at the top
        a = int(strength * ((1 - t) ** 1.5))
        d.line([(0, h - 1 - i), (w, h - 1 - i)], fill=(8, 10, 22, a))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def panel(canvas, shot, box, border=10, focus=0.5):
    """Paste a screenshot into box with the game's chunky frame + hard shadow."""
    x, y, w, h = box
    d = ImageDraw.Draw(canvas)
    off = max(6, border)
    d.rectangle([x + off, y + off, x + w + off, y + h + off], fill=(0, 0, 0))
    d.rectangle([x - border, y - border, x + w + border, y + h + border], fill=WHITE)
    d.rectangle([x - border // 2, y - border // 2, x + w + border // 2, y + h + border // 2], fill=INK)
    canvas.paste(cover(shot, w, h, pixel_art=False, focus=focus), (x, y))


def wrap(draw, text, font, max_w):
    """Honour explicit \\n breaks, then soft-wrap anything still too wide."""
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            trial = (cur + " " + word).strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    return lines


def draw_block(canvas, x, y, max_w, eyebrow, headline, sub, hsize, esize, ssize,
               align="left", shadow=True):
    """Eyebrow (pixel font) / headline (heavy) / yellow rule / subline."""
    d = ImageDraw.Draw(canvas)

    def put(tx, ty, text, font, fill):
        w = d.textlength(text, font=font)
        px = tx if align == "left" else tx + (max_w - w) / 2
        if shadow:
            d.text((px + max(2, hsize // 22), ty + max(2, hsize // 22)), text,
                   font=font, fill=(0, 0, 0))
        d.text((px, ty), text, font=font, fill=fill)
        return w

    cy = y
    if eyebrow:
        ef = f_pixel(esize)
        put(x, cy, eyebrow, ef, YELLOW)
        cy += int(esize * 2.1)

    hf = f_heavy(hsize)
    for line in wrap(d, headline, hf, max_w):
        put(x, cy, line, hf, WHITE)
        cy += int(hsize * 1.14)

    cy += int(hsize * 0.20)
    rule_w = int(max_w * 0.34)
    rx = x if align == "left" else x + (max_w - rule_w) / 2
    d.rectangle([rx, cy, rx + rule_w, cy + max(6, hsize // 9)], fill=YELLOW)
    cy += int(hsize * 0.46)

    if sub:
        sf = f_bold(ssize)
        for line in wrap(d, sub, sf, max_w):
            put(x, cy, line, sf, (226, 232, 246))
            cy += int(ssize * 1.30)
    return cy


def brandline(canvas, cx=None):
    """Small wordmark, bottom-centred on the pitch strip."""
    w, h = canvas.size
    d = ImageDraw.Draw(canvas)
    f = f_pixel(max(12, w // 62))
    t = "FOOTBALL TRIVIA BATTLE"
    tw = d.textlength(t, font=f)
    x = (w - tw) / 2 if cx is None else cx
    y = h - int(h * 0.10) + int(h * 0.028)
    d.text((x + 2, y + 2), t, font=f, fill=(0, 0, 0))
    d.text((x, y), t, font=f, fill=WHITE)


# --- source art -------------------------------------------------------------
feature = Image.open(SRC / "feature-graphic/1.png").convert("RGB")
shots = {n: Image.open(SRC / f"phone-screenshots/{n}.png").convert("RGB") for n in (1, 2, 3, 4, 5)}

# Trim the status bar and the dead pitch at the foot of each capture.
# 1440x1846 is exactly the 0.78 aspect the stacked panel wants, so nothing
# gets cropped a second time -- it holds the scoreboard down to the last
# answer button.
CROPS = {
    3: (0, 200, 1440, 2046),   # question + scoreboard
    5: (0, 200, 1440, 2046),   # GOAL!
    4: (0, 200, 1440, 2046),   # keeper save
    2: (0, 200, 1440, 2046),   # quick match menu
}
trim = {n: shots[n].crop(box) for n, box in CROPS.items()}
PANEL_ASPECT = 0.78

# the player-strikes-ball half of the feature graphic, clear of the baked-in
# wordmark and the red "TEST YOUR FOOTBALL KNOWLEDGE" banner on the left
hero_right = feature.crop((548, 0, 1024, 500))

COPY = {
    "hero": ("THINK YOU KNOW\nFOOTBALL?",
             "Trivia meets penalty shootouts. Settle it in 60 seconds."),
    "quiz": ("ANSWER FAST.\nSCORE HARDER.",
             "Every correct answer wins you a penalty."),
    "goal": ("BATTLE REAL\nRIVALS, LIVE",
             "No ads. No signup. Just tap and play."),
}


def hero(w, h, source, eyebrow, key, hsize, esize, ssize, align="center"):
    """Game art filling the frame, message sitting on a bottom scrim."""
    img = cover(source, w, h, focus=0.42)
    img = scrim(img, frac=0.66, strength=240)
    head, sub = COPY[key]
    d = ImageDraw.Draw(img)
    hf = f_heavy(hsize)
    pad = int(w * 0.07)
    max_w = w - pad * 2
    nlines = len(wrap(d, head, hf, max_w))
    block_h = int(esize * 2.1) + nlines * int(hsize * 1.14) + int(hsize * 0.66) + int(ssize * 1.3)
    draw_block(img, pad, h - block_h - int(h * 0.075), max_w,
               eyebrow, head, sub, hsize, esize, ssize, align=align)
    return img


def banner(w, h):
    """The existing feature graphic, recropped. It is already a finished
    composition — no overlay, or the wordmark collides with new text."""
    return cover(feature, w, h)


def showcase(w, h, shot, eyebrow, key, layout, hsize, esize, ssize, focus=0.5):
    img = gradient_bg(w, h)
    head, sub = COPY[key]
    if layout == "side":                      # landscape: text left, panel right
        pad = int(w * 0.055)
        text_w = int(w * 0.50)
        # keep the panel clear of the pitch strip along the bottom
        free_h = h - int(h * 0.10)
        ph = int(free_h * 0.86)
        pw = int(ph * PANEL_ASPECT * 0.86)
        px = w - pad - pw
        py = (free_h - ph) // 2
        panel(img, shot, (px, py, pw, ph), focus=focus)
        d = ImageDraw.Draw(img)
        hf = f_heavy(hsize)
        nl = len(wrap(d, head, hf, text_w))
        bh = int(esize * 2.1) + nl * int(hsize * 1.14) + int(hsize * 0.66) + int(ssize * 1.3)
        draw_block(img, pad, (h - bh) // 2 - int(h * 0.05), text_w,
                   eyebrow, head, sub, hsize, esize, ssize, align="left")
    else:                                     # square / portrait: text above panel
        pad = int(w * 0.07)
        max_w = w - pad * 2
        end = draw_block(img, pad, int(h * 0.045), max_w,
                         eyebrow, head, sub, hsize, esize, ssize, align="center")
        top = end + int(h * 0.030)
        avail_h = h - top - int(h * 0.145)
        # a wider window into the screen fills the frame better than a
        # phone-shaped sliver would
        aspect = PANEL_ASPECT
        ph = avail_h
        pw = int(ph * aspect)
        if pw > w * 0.64:
            pw = int(w * 0.64)
            ph = int(pw / aspect)
        panel(img, shot, ((w - pw) // 2, top, pw, ph), focus=focus)
    brandline(img)
    return img


SIZES = {"landscape": (1200, 628), "square": (1200, 1200), "portrait": (1200, 1500)}
TYPE_SCALE = {
    "landscape": dict(hsize=62, esize=19, ssize=27),
    "square": dict(hsize=70, esize=21, ssize=30),
    "portrait": dict(hsize=74, esize=22, ssize=31),
}

built = []
for name, (w, h) in SIZES.items():
    ts = TYPE_SCALE[name]
    layout = "side" if name == "landscape" else "stack"

    # landscape already has a finished 1.91-ish banner to recrop; the taller
    # ratios need the artwork rebuilt around a headline
    a = (banner(w, h) if name == "landscape"
         else hero(w, h, hero_right, "TRIVIA + PENALTIES", "hero", **ts))
    b = showcase(w, h, trim[3], "60-SECOND MATCHES", "quiz", layout, focus=0.70, **ts)
    c = showcase(w, h, trim[5], "REAL-TIME 1V1", "goal", layout, focus=0.45, **ts)

    for i, im in enumerate((a, b, c), start=1):
        p = OUT / f"{name}-{w}x{h}-{i}.png"
        im.save(p, optimize=True)
        built.append((p, im.size, p.stat().st_size // 1024))

for p, size, kb in built:
    print(f"{p.name:28} {size[0]}x{size[1]:<6} {kb} KB")

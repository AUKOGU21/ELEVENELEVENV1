from PIL import Image

W, H = 440, 510          # email hero box
BG = (255, 255, 255)
HOLD_MS = 2500           # she asked for 2.5s per item
SLIDE_MS = 480           # the swipe itself
SLIDE_FRAMES = 5

def fit(path):
    """Contain the product on a white canvas so mixed shots share one ground."""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, BG)
        flat.paste(im, mask=im.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    pad = 0.92
    im.thumbnail((int(W * pad), int(H * pad)), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), BG)
    canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    return canvas

slides = [fit(p) for p in ("a.jpg", "b.png", "c.png")]

def ease(t):
    # ease-in-out cubic, so the swipe starts and lands softly
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2

frames, durations = [], []
for i, cur in enumerate(slides):
    frames.append(cur.copy())
    durations.append(HOLD_MS)
    nxt = slides[(i + 1) % len(slides)]
    for f in range(1, SLIDE_FRAMES + 1):
        offset = int(W * ease(f / (SLIDE_FRAMES + 1)))
        frame = Image.new("RGB", (W, H), BG)
        frame.paste(cur, (-offset, 0))          # current exits left
        frame.paste(nxt, (W - offset, 0))       # next enters from the right
        frames.append(frame)
        durations.append(SLIDE_MS // SLIDE_FRAMES)

# One shared adaptive palette keeps the file small and stops colours shifting
# between frames.
palette_src = Image.new("RGB", (W * 3, H), BG)
for i, s in enumerate(slides):
    palette_src.paste(s, (i * W, 0))
pal = palette_src.quantize(colors=96, method=Image.MEDIANCUT)
frames = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in frames]

# Pillow drops a duration list when the frames are re-quantized, so stamp each
# frame's own info too. Without this every frame renders at the slide speed and
# the 2.5s hold disappears.
for f, d in zip(frames, durations):
    f.info["duration"] = d

frames[0].save(
    "whats-waiting.gif", save_all=True, append_images=frames[1:],
    duration=durations, loop=0, optimize=False, disposal=2,
)
print("frames:", len(frames))

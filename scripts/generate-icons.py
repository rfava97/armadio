"""Genera le icone PWA provvisorie (gruccia bianca su accent). Uso: python3 scripts/generate-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

ACCENT = (100, 30, 50, 255)  # bordeaux #641E32
WHITE = (232, 216, 197, 255)  # champagne #E8D8C5
OUT = Path(__file__).resolve().parent.parent / "public"
S = 2048  # disegno ad alta risoluzione, poi ridimensiono


def hanger(draw: ImageDraw.ImageDraw, scale: float) -> None:
    c = S / 2
    w = int(S * 0.045 * scale)
    # gancio
    r = S * 0.085 * scale
    hx, hy = c, c - S * 0.17 * scale
    draw.arc([hx - r, hy - r, hx + r, hy + r], start=170, end=450, fill=WHITE, width=w)
    neck_top = (c, hy + r)
    neck_bot = (c, c - S * 0.03 * scale)
    draw.line([neck_top, neck_bot], fill=WHITE, width=w)
    # triangolo
    left = (c - S * 0.30 * scale, c + S * 0.20 * scale)
    right = (c + S * 0.30 * scale, c + S * 0.20 * scale)
    draw.line([neck_bot, left, right, neck_bot], fill=WHITE, width=w, joint="curve")
    for p in (neck_bot, left, right):
        draw.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=WHITE)


def make(size: int, name: str, scale: float, rounded: bool = False) -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if rounded else ACCENT)
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=ACCENT)
    hanger(d, scale)
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


make(192, "pwa-192.png", 1.0)
make(512, "pwa-512.png", 1.0)
make(512, "pwa-512-maskable.png", 0.75)
make(180, "apple-touch-icon.png", 1.0)

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "favicon.ico"
CANVAS = 256
SCALE = CANVAS / 64
INK = "#1c1c1a"


def point(x: float, y: float) -> tuple[int, int]:
    return round(x * SCALE), round(y * SCALE)


image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

sigma = [
    point(13, 10),
    point(51, 10),
    point(51, 18),
    point(29, 18),
    point(41, 32),
    point(29, 46),
    point(51, 46),
    point(51, 54),
    point(13, 54),
    point(33, 32),
]
draw.polygon(sigma, fill=INK)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUTPUT, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

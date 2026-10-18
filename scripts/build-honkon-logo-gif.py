from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "docs" / "prototypes"
paths = sorted((root / ".logo-loop-frames").glob("*.png"))
if len(paths) != 120:
    raise RuntimeError("Run build-honkon-logo-prototype.mjs --frames first")
frames = []
for path in paths:
    with Image.open(path) as image:
        frames.append(image.convert("RGB").quantize(colors=128))
frames[0].save(root / "hon-kon-logo-loop.gif", save_all=True, append_images=frames[1:], duration=[70, 60, 70] * 40, loop=0, disposal=1, optimize=True)
print("Saved continuous 8-second loop, 960 x 540, no bottom captions")

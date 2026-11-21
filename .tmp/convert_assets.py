"""Convierte a WebP los assets locales que seguían en JPEG/PNG.

- tee-04.jpeg, tee-05.jpeg  -> productos del grid que no se habían convertido
- lookbook-02.jpg           -> slide del lookbook
- .tmp/tee-06-from-git.jpeg -> recuperado del blob de git (fue borrado del working tree)
Los originales NO se borran.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"

JOBS = [
    (IMAGES / "tee-04.jpeg", IMAGES / "tee-04.webp", 85),
    (IMAGES / "tee-05.jpeg", IMAGES / "tee-05.webp", 85),
    (IMAGES / "lookbook-02.jpg", IMAGES / "lookbook-02.webp", 82),
    (ROOT / ".tmp" / "tee-06-from-git.jpeg", IMAGES / "tee-06.webp", 85),
]

for src, dst, quality in JOBS:
    if not src.exists():
        raise SystemExit(f"FALTA origen: {src}")
    with Image.open(src) as img:
        img = img.convert("RGB")
        size = img.size
        img.save(dst, "WEBP", quality=quality, method=6)
    print(f"{src.name:28s} -> {dst.name:18s} {dst.stat().st_size / 1024:6.1f} KB  ({size[0]}x{size[1]})")

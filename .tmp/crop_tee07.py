"""Recorta el letterbox negro de las fotos tee-07 (padding 430..1170 de 1600)."""
import os
import shutil

from PIL import Image

os.makedirs(".tmp/backup", exist_ok=True)

for name in ("tee-07.webp", "tee-07-back.webp"):
    src = f"assets/images/{name}"
    backup = f".tmp/backup/{name}"
    if not os.path.exists(backup):
        shutil.copy2(src, backup)
    with Image.open(backup) as img:
        rgb = img.convert("RGB")
        w, h = rgb.size
        px = rgb.load()
        samples = [px[w // 2, y] for y in (429, 430, 431, 432, 1168, 1169, 1170)]
        print(f"{name} {w}x{h} borde: {samples}")
        top, bottom = 431, 1170
        crop = rgb.crop((0, top, w, bottom))
        crop.save(src, "WEBP", quality=85, method=6)
        with Image.open(src) as check:
            cpx = check.convert("RGB").load()
            print(f"{name} recortado a {crop.size[0]}x{crop.size[1]} "
                  f"({os.path.getsize(src)} bytes) "
                  f"esquinas: {cpx[0, 0]} {cpx[w - 1, 0]} {cpx[0, crop.size[1] - 1]}")

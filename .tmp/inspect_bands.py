"""Detecta el padding negro (letterbox) de las fotos tee-07 para recortarlo."""
from PIL import Image

for name in ("tee-07.webp", "tee-07-back.webp"):
    path = f"assets/images/{name}"
    with Image.open(path) as img:
        rgb = img.convert("RGB")
        w, h = rgb.size
        px = rgb.load()
        step = max(1, w // 200)

        def row_is_dark(y):
            return all(sum(px[x, y]) < 30 for x in range(0, w, step))

        def col_is_dark(x):
            return all(sum(px[x, y]) < 30 for y in range(0, h, max(1, h // 200)))

        top = 0
        while top < h and row_is_dark(top):
            top += 1
        bottom = h - 1
        while bottom > top and row_is_dark(bottom):
            bottom -= 1
        left = 0
        while left < w and col_is_dark(left):
            left += 1
        right = w - 1
        while right > left and col_is_dark(right):
            right -= 1
        print(f"{name}: {w}x{h} -> contenido {left},{top} .. {right},{bottom} "
              f"({right - left + 1}x{bottom - top + 1})")

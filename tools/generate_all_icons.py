#!/usr/bin/env python3
"""
Generate all icon assets (PNGs at all standard resolutions, SVG vector files, and ICO packages)
for Zotero CiteFlow based on the brand icon geometry, colors, and the user-provided 64x64 master image.
"""

import os
import shutil
import cv2
import numpy as np
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG_ICON_PATH = r"C:\Users\gro_e\.gemini\antigravity\brain\d110951d-475e-4281-b336-bbd0cc1352f6\.user_uploaded\media_1792410939646_2a53f83a.png"

ICONS_DIRS = [
    os.path.join(ROOT_DIR, "chrome", "content", "icons"),
]

# Also sync to zotero-citation folder if it exists
OTHER_PROJECT_DIR = r"d:\Dev Studio\zotero-citation"
if os.path.exists(OTHER_PROJECT_DIR):
    ICONS_DIRS.append(os.path.join(OTHER_PROJECT_DIR, "chrome", "content", "icons"))

def build_vector_svg(src_img_path):
    """Build a clean, smooth vector SVG with the 3 gradient-filled curved components."""
    src_img = cv2.imread(src_img_path, cv2.IMREAD_UNCHANGED)
    b, g, r, a = cv2.split(src_img)

    masks = {
        'blue': (b > 180) & (r < 80) & (a > 60),
        'purple': (b > 180) & (r >= 80) & (a > 60),
        'orange': (r > 180) & (a > 60)
    }

    paths = {}
    for name, m in masks.items():
        u8 = (m * 255).astype(np.uint8)
        up = cv2.resize(u8, (1024, 1024), interpolation=cv2.INTER_CUBIC)
        blurred = cv2.GaussianBlur(up, (15, 15), 4)
        _, thresh = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
        c = max(contours, key=cv2.contourArea)
        epsilon = 0.0025 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, epsilon, True)
        pts = approx.reshape(-1, 2) * (128.0 / 1024.0)
        d = 'M ' + ' L '.join([f'{p[0]:.2f},{p[1]:.2f}' for p in pts]) + ' Z'
        paths[name] = d

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" fill="none" role="img" aria-label="Zotero CiteFlow">
  <title>Zotero CiteFlow</title>
  <desc>Circular Flow C mark symbolizing reference citation flows between Zotero and Word.</desc>
  <defs>
    <linearGradient id="cfBlueGrad" x1="0.2" y1="0.8" x2="0.9" y2="0.2">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
    <linearGradient id="cfPurpleGrad" x1="0.5" y1="0.0" x2="0.5" y2="1.0">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="50%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>
    <linearGradient id="cfOrangeGrad" x1="0.0" y1="0.6" x2="1.0" y2="0.3">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="40%" stop-color="#f97316" />
      <stop offset="80%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
  </defs>
  <g>
    <!-- Left Pillar (Purple / Indigo) -->
    <path d="{paths['purple']}" fill="url(#cfPurpleGrad)" />
    <!-- Bottom Swoosh (Coral Red to Gold) -->
    <path d="{paths['orange']}" fill="url(#cfOrangeGrad)" />
    <!-- Top Arc (Sky Blue to Royal Blue) -->
    <path d="{paths['blue']}" fill="url(#cfBlueGrad)" />
  </g>
</svg>
'''
    return svg

def build_sdf_master_1024(orig_img):
    """Reconstruct an ultra-crisp, anti-aliased 1024x1024 master from the 64x64 source using SDF + color inpainting."""
    arr = np.array(orig_img.convert("RGBA"))
    alpha = arr[:, :, 3].astype(np.float32) / 255.0
    rgb = arr[:, :, :3]

    # Inpaint RGB into zero-alpha areas to avoid dark fringing / halos upon scaling
    mask = (arr[:, :, 3] == 0).astype(np.uint8)
    rgb_inp = cv2.inpaint(rgb, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    # Compute signed distance field from the 50% alpha boundary
    thresh = (alpha > 0.5).astype(np.uint8)
    dist_inside = cv2.distanceTransform(thresh, cv2.DIST_L2, 5)
    dist_outside = cv2.distanceTransform(1 - thresh, cv2.DIST_L2, 5)
    sdf = dist_inside - dist_outside

    # Upscale to 1024x1024 with Lanczos4
    TARGET_SIZE = 1024
    scale = TARGET_SIZE / 64.0
    sdf_up = cv2.resize(sdf, (TARGET_SIZE, TARGET_SIZE), interpolation=cv2.INTER_LANCZOS4)
    rgb_up = cv2.resize(rgb_inp, (TARGET_SIZE, TARGET_SIZE), interpolation=cv2.INTER_LANCZOS4)

    # Smooth edge width: 1.5 pixels at TARGET_SIZE
    smooth_w = 1.5 / scale
    alpha_up = np.clip((sdf_up / smooth_w) * 0.5 + 0.5, 0.0, 1.0)
    alpha_up_u8 = (alpha_up * 255).astype(np.uint8)

    master_arr = np.dstack([rgb_up, alpha_up_u8])
    return Image.fromarray(master_arr)

def generate():
    for d in ICONS_DIRS:
        os.makedirs(d, exist_ok=True)

    print("1. Loading source image...")
    orig_img = Image.open(ORIG_ICON_PATH).convert("RGBA")
    print(f"   Original size: {orig_img.size}")

    print("2. Generating vector SVG files...")
    svg_content = build_vector_svg(ORIG_ICON_PATH)
    for d in ICONS_DIRS:
        svg_icon = os.path.join(d, "icon.svg")
        with open(svg_icon, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"   Written: {svg_icon}")

        svg_citeflow = os.path.join(d, "citeflow.svg")
        with open(svg_citeflow, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"   Written: {svg_citeflow}")

    print("3. Generating ultra-crisp 1024x1024 SDF master...")
    master_1024 = build_sdf_master_1024(orig_img)

    sizes = [16, 20, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
    rendered_images = {}

    print("4. Generating PNG icons at all resolutions...")
    for sz in sizes:
        if sz == 64:
            # Native pixel-perfect preservation of uploaded 64x64
            rendered_images[sz] = orig_img
        elif sz < 64:
            # Downsample with Lanczos for maximum sharpness and contrast
            rendered_images[sz] = orig_img.resize((sz, sz), Image.Resampling.LANCZOS)
        else:
            # Downsample from ultra-crisp 1024x1024 master
            rendered_images[sz] = master_1024.resize((sz, sz), Image.Resampling.LANCZOS)

        for d in ICONS_DIRS:
            out_file = os.path.join(d, f"icon-{sz}.png")
            rendered_images[sz].save(out_file, format="PNG", optimize=True)

    # Standard Zotero WebExtension and manifest aliases
    for d in ICONS_DIRS:
        # favicon.png (96x96) and favicon@0.5x.png (48x48)
        rendered_images[96].save(os.path.join(d, "favicon.png"), format="PNG", optimize=True)
        rendered_images[48].save(os.path.join(d, "favicon@0.5x.png"), format="PNG", optimize=True)

        # icon48.png & icon128.png
        rendered_images[48].save(os.path.join(d, "icon48.png"), format="PNG", optimize=True)
        rendered_images[128].save(os.path.join(d, "icon128.png"), format="PNG", optimize=True)

        # icon.png (48) & icon@2x.png (96)
        rendered_images[48].save(os.path.join(d, "icon.png"), format="PNG", optimize=True)
        rendered_images[96].save(os.path.join(d, "icon@2x.png"), format="PNG", optimize=True)

    # Also save icon.png and icon@2x.png at root directory of Zotero-CiteFlow
    root_icon = os.path.join(ROOT_DIR, "icon.png")
    root_icon_2x = os.path.join(ROOT_DIR, "icon@2x.png")
    rendered_images[48].save(root_icon, format="PNG", optimize=True)
    rendered_images[96].save(root_icon_2x, format="PNG", optimize=True)
    print(f"   Root icons written: {root_icon}, {root_icon_2x}")

    print("5. Generating multi-resolution ICO files...")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_images = [rendered_images[s[0]] for s in ico_sizes]

    for d in ICONS_DIRS:
        # icon.ico
        icon_ico = os.path.join(d, "icon.ico")
        ico_images[-1].save(icon_ico, format="ICO", sizes=ico_sizes)
        print(f"   Written: {icon_ico}")

        # favicon.ico
        favicon_ico = os.path.join(d, "favicon.ico")
        ico_images[-1].save(favicon_ico, format="ICO", sizes=ico_sizes)
        print(f"   Written: {favicon_ico}")

    print("All icons generated successfully!")

if __name__ == "__main__":
    generate()

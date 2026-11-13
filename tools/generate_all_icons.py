#!/usr/bin/env python3
"""
Generate all raster icon assets (PNGs at all standard resolutions and ICO packages)
for Zotero CiteFlow directly from the vector SVG master (`chrome/content/icons/icon.svg`).
"""

import io
import os
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIRS = [
    os.path.join(ROOT_DIR, "chrome", "content", "icons"),
]

# Optional secondary icon output directory for manual multi-repo sync
OTHER_PROJECT_DIR = os.environ.get("CITEFLOW_SYNC_PROJECT_DIR", "")
if OTHER_PROJECT_DIR and os.path.exists(OTHER_PROJECT_DIR):
    ICONS_DIRS.append(os.path.join(OTHER_PROJECT_DIR, "chrome", "content", "icons"))

MASTER_SVG_PATH = os.path.join(ROOT_DIR, "chrome", "content", "icons", "icon.svg")


def render_svg_to_png_bytes(svg_content: str, size: int) -> bytes:
    """Render an SVG string to a transparent PNG of `size x size` pixels."""
    try:
        from playwright.sync_api import sync_playwright

        html = (
            '<!doctype html><html><body style="margin:0;padding:0;background:transparent;'
            'width:100vw;height:100vh;overflow:hidden;">'
            f'{svg_content}'
            '</body></html>'
        )
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            page.set_content(html)
            page.eval_on_selector(
                "svg",
                f"(el) => {{ el.setAttribute('width', '{size}'); el.setAttribute('height', '{size}'); }}",
            )
            png_bytes = page.locator("svg").screenshot(omit_background=True)
            browser.close()
            return png_bytes
    except ImportError:
        import cairosvg  # type: ignore

        return cairosvg.svg2png(bytestring=svg_content.encode("utf-8"), output_width=size, output_height=size)


def generate():
    if not os.path.exists(MASTER_SVG_PATH):
        raise FileNotFoundError(f"Master SVG not found: {MASTER_SVG_PATH}")

    with open(MASTER_SVG_PATH, "r", encoding="utf-8") as f:
        svg_content = f.read()

    for d in ICONS_DIRS:
        os.makedirs(d, exist_ok=True)
        for name in ("icon.svg", "citeflow.svg"):
            target = os.path.join(d, name)
            if os.path.abspath(target) != os.path.abspath(MASTER_SVG_PATH):
                with open(target, "w", encoding="utf-8") as f:
                    f.write(svg_content)
                print(f"   Synced SVG: {target}")

    print("1. Rendering ultra-crisp 1024x1024 RGBA master from vector SVG...")
    master_bytes = render_svg_to_png_bytes(svg_content, 1024)
    master_1024 = Image.open(io.BytesIO(master_bytes)).convert("RGBA")

    sizes = [16, 20, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
    rendered_images = {}

    print("2. Generating PNG icons at all resolutions...")
    for sz in sizes:
        if sz == 1024:
            rendered_images[sz] = master_1024
        else:
            rendered_images[sz] = master_1024.resize((sz, sz), Image.Resampling.LANCZOS)

        for d in ICONS_DIRS:
            out_file = os.path.join(d, f"icon-{sz}.png")
            rendered_images[sz].save(out_file, format="PNG", optimize=True)

    # Standard Zotero WebExtension and manifest aliases
    for d in ICONS_DIRS:
        rendered_images[96].save(os.path.join(d, "favicon.png"), format="PNG", optimize=True)
        rendered_images[48].save(os.path.join(d, "favicon@0.5x.png"), format="PNG", optimize=True)
        rendered_images[48].save(os.path.join(d, "icon48.png"), format="PNG", optimize=True)
        rendered_images[128].save(os.path.join(d, "icon128.png"), format="PNG", optimize=True)
        rendered_images[48].save(os.path.join(d, "icon.png"), format="PNG", optimize=True)
        rendered_images[96].save(os.path.join(d, "icon@2x.png"), format="PNG", optimize=True)

    # Also save icon.png and icon@2x.png at root directory of Zotero-CiteFlow
    root_icon = os.path.join(ROOT_DIR, "icon.png")
    root_icon_2x = os.path.join(ROOT_DIR, "icon@2x.png")
    rendered_images[48].save(root_icon, format="PNG", optimize=True)
    rendered_images[96].save(root_icon_2x, format="PNG", optimize=True)
    print(f"   Root icons written: {root_icon}, {root_icon_2x}")

    print("3. Generating multi-resolution ICO files...")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_images = [rendered_images[s[0]] for s in ico_sizes]

    for d in ICONS_DIRS:
        for ico_name in ("icon.ico", "favicon.ico"):
            ico_path = os.path.join(d, ico_name)
            ico_images[-1].save(ico_path, format="ICO", sizes=ico_sizes)
            print(f"   Written: {ico_path}")

    print("All icons generated successfully from vector SVG!")


if __name__ == "__main__":
    generate()

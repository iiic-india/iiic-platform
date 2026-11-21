"""Writes fraunces-latin-opsz144-wght500.metrics.json: the characters the static Fraunces
file holds, each with its advance width in font units. The share image reads it to drop what
the font cannot draw and to size a title so that it fits (src/lib/seo/shareImage.tsx).

Run from the repository root after the fonts are rebuilt (README.md, beside this file):

    python src/lib/seo/fonts/metrics.py
"""

import json
from pathlib import Path

from fontTools.ttLib import TTFont

FONT = Path(__file__).with_name("fraunces-latin-opsz144-wght500.ttf")

font = TTFont(FONT)
widths = font["hmtx"].metrics
advances = {str(code): widths[glyph][0] for code, glyph in sorted(font.getBestCmap().items())}
metrics = {"unitsPerEm": font["head"].unitsPerEm, "advances": advances}

FONT.with_suffix(".metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
print(f"{len(advances)} characters, {metrics['unitsPerEm']} units per em")

"""Freeze the upstream variable font at regular weight without losing glyphs.

Requires fonttools==4.62.1. Pass the joined upstream variable TTF and output path:
  python3 scripts/prepare-cjk-font.py variable.ttf public/fonts/NotoSansCJKsc-Regular.ttf
Recover upstream parts from commit d0acd47a, public/fonts/*.part-*.
The font remains under public/fonts/NotoSansCJK-LICENSE.txt.
"""

import argparse
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
args = parser.parse_args()
font = TTFont(args.source)
original_cmap = font.getBestCmap().copy()
original_glyphs = font.getGlyphOrder()
instantiateVariableFont(font, {"wght": 400}, inplace=True)
assert font.getBestCmap() == original_cmap
assert font.getGlyphOrder() == original_glyphs
font.save(args.output)

#!/usr/bin/env python3
"""Copy the character icons out of a game-icons.net checkout.

    python3 tools/build-character-icons.py PATH/TO/game-icons/icons

Two lists decide what ships:

- tools/character-icons.txt -- a short hand-picked set, shown first in the
  picker as "Featured";
- tools/character-icons-library.json -- every icon in the library judged to
  fit the setting, each with a category. It was produced by reviewing all of
  game-icons.net against the setting; edit it by hand to add or drop icons.

Each icon is recoloured from game-icons' white on black to the sheet's
parchment on dark brown and written to assets/icons/characters/, with:

- index.json, which the picker reads -- a player without file-browser
  permission cannot list a directory, so the picker needs the list handed to it,
- CREDITS.md, the attribution CC BY 3.0 requires.

The output is committed; this only needs running when a list changes.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEATURED = ROOT / "tools/character-icons.txt"
LIBRARY = ROOT / "tools/character-icons-library.json"
OUT = ROOT / "assets/icons/characters"

BACKGROUND = "#2b2118"
GLYPH = "#e8dcc4"

# Picker order and labels. Featured comes first; the rest follow the review's
# categories.
CATEGORIES = {
    "featured": "Featured",
    "people": "People",
    "creatures": "Creatures",
    "beasts": "Beasts",
    "arms": "Arms",
    "armour": "Armour",
    "heraldry": "Heraldry",
    "faith": "Faith",
    "magic": "Magic",
    "trade": "Trade & Gear",
    "nature": "Nature",
}

# Folders that are not one person's work.
COLLECTIVE = {"badges": "game-icons.net contributors", "various-artists": "Various artists"}


def authors(source: Path) -> dict[str, str]:
    """Folder name to credited name, read from the library's own license.txt."""
    names = {}
    for line in (source / "license.txt").read_text(encoding="utf-8").splitlines():
        match = re.match(r"^- ([^,]+?)(?:,| - |$)", line.strip())
        if match:
            name = match.group(1).strip()
            names[re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")] = name
            names[re.sub(r"[^a-z0-9]+", "", name.lower())] = name
    return names


def credited(folder: str, names: dict[str, str]) -> str:
    return COLLECTIVE.get(folder) or names.get(folder) or names.get(folder.replace("-", "")) or folder


def read_featured() -> list[str]:
    return [
        line.strip()
        for line in FEATURED.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith(("#", "["))
    ]


# The glyph's whole square is inscribed in the disc, inside the rim: a square
# fits a circle when its side is the radius times sqrt(2). So nothing is ever
# clipped, whatever reaches a corner of the original icon.
RIM = 0.035  # rim width, as a fraction of the icon's size


SQUARE_BACKGROUND = '<path d="M0 0h512v512H0z"/>'


def recolour(svg: str, source: str) -> str:
    """A round medallion: parchment glyph on a brown disc with a parchment rim,
    transparent outside the circle, so it sits on a hex or square grid alike.

    Every game-icons shape that is black is so by default -- it carries no fill
    -- so a default fill on the root element turns all of them brown. The white
    is explicit, and swapped for parchment. The square background is dropped
    for a disc and the glyph's square inscribed in it, so the glyph is shown
    whole; the badge icons already have a round design and keep it.
    """
    match = re.match(r'<svg ([^>]*)viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"([^>]*)>(.*)</svg>\s*$', svg, re.S)
    if not match:
        sys.exit(f"{source}: not an <svg> with a viewBox")
    before, x, y, w, h, after, inner = match.groups()
    x, y, w, h = (float(v) for v in (x, y, w, h))
    cx, cy, r = x + w / 2, y + h / 2, min(w, h) / 2

    inner = inner.replace('"#fff"', f'"{GLYPH}"')
    if SQUARE_BACKGROUND in inner:
        inner = inner.replace(SQUARE_BACKGROUND, "", 1)
        rim = r * RIM * 2
        inside = r - rim
        scale = inside * 2**0.5 / min(w, h)
        disc = (
            f'<circle cx="{cx:g}" cy="{cy:g}" r="{r - rim / 2:g}" fill="{BACKGROUND}" '
            f'stroke="{GLYPH}" stroke-width="{rim:g}"/>'
        )
        glyph = (
            f'<g transform="translate({cx:g} {cy:g}) scale({scale:.4f}) translate({-cx:g} {-cy:g})">'
            f"{inner}</g>"
        )
        body = f"{disc}{glyph}"
    else:
        body = inner

    return f'<svg fill="{BACKGROUND}" {before}viewBox="{x:g} {y:g} {w:g} {h:g}"{after}>{body}</svg>'


def title(slug: str) -> str:
    return re.sub(r"^tarot-\d+-", "", slug).replace("-", " ").capitalize()


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    source = Path(sys.argv[1])
    names = authors(source)

    library = json.loads(LIBRARY.read_text(encoding="utf-8")) if LIBRARY.exists() else []
    category_of = {entry["icon"]: entry["category"] for entry in library}
    featured = read_featured()

    unknown = sorted({c for c in category_of.values() if c not in CATEGORIES})
    if unknown:
        sys.exit(f"unknown categories in {LIBRARY.name}: {unknown}")

    # One file per icon. Two authors may use the same name; the second one
    # gets its author appended.
    every = list(dict.fromkeys(featured + sorted(category_of)))
    files: dict[str, str] = {}
    taken: set[str] = set()
    for icon in every:
        folder, slug = icon.split("/")
        name = slug if slug not in taken else f"{slug}-{folder}"
        taken.add(name)
        files[icon] = f"{name}.svg"

    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob("*.svg"):
        stale.unlink()

    credits: dict[str, list[str]] = {}
    for icon, file in files.items():
        svg = source / f"{icon}.svg"
        if not svg.is_file():
            sys.exit(f"missing {svg}")
        (OUT / file).write_text(recolour(svg.read_text(encoding="utf-8"), icon), encoding="utf-8")
        folder, slug = icon.split("/")
        credits.setdefault(credited(folder, names), []).append(slug)

    entry = lambda icon: {"file": files[icon], "name": title(icon.split("/")[1])}  # noqa: E731
    groups = {"featured": [entry(icon) for icon in featured]}
    for icon in sorted(category_of, key=lambda i: i.split("/")[1]):
        groups.setdefault(category_of[icon], []).append(entry(icon))

    index = [
        {"key": key, "label": label, "icons": groups[key]}
        for key, label in CATEGORIES.items()
        if groups.get(key)
    ]
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")) + "\n", encoding="utf-8")

    lines = [
        "# Character icons",
        "",
        "These icons are from [game-icons.net](https://game-icons.net), licensed under",
        "[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)",
        "(a few contributors release theirs as CC0). They have been recoloured; the",
        "shapes are unchanged. Icons made by:",
        "",
    ]
    for author in sorted(credits, key=str.lower):
        lines.append(f"- **{author}**: {', '.join(sorted(set(credits[author])))}")
    (OUT / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    counts = ", ".join(f"{g['label']} {len(g['icons'])}" for g in index)
    print(f"{len(files)} icons -> {OUT.relative_to(ROOT)} ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

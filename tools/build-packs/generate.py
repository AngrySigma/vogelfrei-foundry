#!/usr/bin/env python3
"""Turn the rulebook's equipment tables into Foundry compendium sources.

    python3 tools/build-packs/generate.py [--rulebook PATH] [--check]

Writes one YAML file per item under src/packs/<pack>/, which `npm run
build:packs` then compiles into the LevelDB directories Foundry reads. The
YAML is committed, so building the system does not need the rulebook checked
out -- run this only when the equipment tables change.

Ids are derived from the pack and the item name, never random: a document whose
id changed between builds would break every Actor holding one and duplicate on
re-import.

The rulebook is the authority. Where a table cannot be read, this fails loudly
rather than guessing -- see money.PRICE_ERRATA for the one exception, which is
a typo in the book rather than a rule.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import tables

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RULEBOOK = Path.home() / "tabletop/vogelfrei"

# --------------------------------------------------------------------------
# Money. 1 gp = 50 sp = 600 bp; see src/module/money.ts, which this mirrors.
# Coins themselves are not Items: a character's purse is three counts on the
# sheet (src/module/purse.ts), so the gear pack ships no coins.
# --------------------------------------------------------------------------

BP_PER_SP = 12
BP_PER_GP = 600
UNITS = {"gp": BP_PER_GP, "sp": BP_PER_SP, "bp": 1}

# Prices in the rulebook that do not parse, and what they are read as. These
# are errata, not parser features; each should be fixed in the book and removed
# from here. Kept in step with PRICE_ERRATA in src/module/money.ts.
PRICE_ERRATA = {
    # Vogelfrei has no copper piece. Miscellaneous.md prices Pipe at "1sp / 5cp"
    # while every neighbouring entry is in brass.
    "5cp": "5bp",
}

PRICE = re.compile(r"^(\d+)\s*(gp|sp|bp)\s*(\+?)$", re.IGNORECASE)
DASHES = {"-", "–", "—", ""}


class RuleError(Exception):
    """The rulebook says something this script cannot read."""


def parse_money(text: str) -> tuple[int | None, bool]:
    """Read one price. Returns (brass pieces or None, whether it is a floor)."""
    trimmed = (text or "").strip()
    if trimmed in DASHES:
        return None, False

    corrected = PRICE_ERRATA.get(trimmed.lower(), trimmed)
    match = PRICE.match(corrected)
    if not match:
        raise RuleError(f"unreadable price {text!r}")

    amount, unit, plus = match.groups()
    return int(amount) * UNITS[unit.lower()], plus == "+"


def parse_money_pair(text: str) -> tuple[tuple[int | None, bool], tuple[int | None, bool]]:
    """Read a cell holding both prices, as "1sp / 5bp"."""
    parts = (text or "").split("/")
    city = parts[0] if parts else ""
    rural = parts[1] if len(parts) > 1 else ""
    return parse_money(city), parse_money(rural)


# --------------------------------------------------------------------------
# Armour
# --------------------------------------------------------------------------

# Armor.md gives each harness its own Enc figure -- the points it costs while
# worn -- and a separate rating against firearms. The data model's
# light / medium / heavy category is read off Enc: free, one point, or more.


def armour_category(points: int) -> str:
    if points <= 0:
        return "light"
    return "medium" if points == 1 else "heavy"


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------

ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def document_id(pack: str, name: str, occurrence: int = 0) -> str:
    """A stable 16-character Foundry id, derived from where the item lives.

    Deterministic on purpose: a random id would change on every regeneration,
    orphaning every Actor that holds the item.

    `occurrence` distinguishes entries the book lists twice under one name --
    see the duplicate warning in main().
    """
    seed = f"vogelfrei:{pack}:{name}"
    if occurrence:
        seed = f"{seed}:{occurrence}"
    digest = hashlib.sha256(seed.encode()).digest()
    return "".join(ID_ALPHABET[byte % len(ID_ALPHABET)] for byte in digest[:16])


def slug(name: str) -> str:
    """A filename for an item: lowercase, words joined by hyphens."""
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


@dataclass
class Item:
    """One compendium document, before it is written out."""

    name: str
    type: str
    pack: str
    system: dict = field(default_factory=dict)
    img: str = "icons/svg/item-bag.svg"
    occurrence: int = 0

    def document(self) -> dict:
        identifier = document_id(self.pack, self.name, self.occurrence)
        return {
            "_id": identifier,
            # The LevelDB key. foundryvtt-cli skips, without a word, any source
            # document that has no _key (lib/package.mjs, compileClassicLevel),
            # so leaving it out compiles an empty pack that still reports
            # success. "items" is the collection name for Item documents.
            "_key": f"!items!{identifier}",
            "name": self.name,
            "type": self.type,
            "img": self.img,
            "system": self.system,
            "effects": [],
            "folder": None,
            "sort": 0,
            "ownership": {"default": 0},
            "flags": {},
        }


def tag(value: str) -> dict:
    """An Item tag, in the shape the sheets expect."""
    return {"title": value, "value": value}


def physical(cell: tables.Cell, city: str, rural: str, *, combined: bool = False) -> dict:
    """The fields every carried item has: what it costs and how it counts."""
    if combined:
        (city_bp, city_min), (rural_bp, rural_min) = parse_money_pair(city)
    else:
        city_bp, city_min = parse_money(city)
        rural_bp, rural_min = parse_money(rural)

    return {
        "cost": city_bp or 0,
        "costRural": rural_bp,
        "costMinimum": bool(city_min or rural_min),
        "encumbrance": cell.encumbrance,
        "stackSize": 0,
        "quantity": {"value": 0, "max": 0},
        "weight": 0,
        "containerId": "",
        "equipped": False,
        "tags": [],
    }


# --------------------------------------------------------------------------
# Reading each table
# --------------------------------------------------------------------------

def minus(text: str) -> str:
    """The book writes a typographic minus; Python and Foundry want a hyphen."""
    return (text or "").replace("\u2212", "-").replace("\u2013", "-")


# Every weapon deals d8 (Melee Weapons.md, "Damage"): "d8 low" rolls 2d8 and
# keeps the lower, "d8 high" the higher, and "d8-3" is the improvised blow,
# never below 1. Plain "dN" is still read, for any table that keeps one.
DAMAGE_FORMS = {
    "low": "2d{die}kl",
    "high": "2d{die}kh",
}
DAMAGE = re.compile(r"^d(\d+)(?:\s*(low|high)|\s*-\s*(\d+))?$", re.IGNORECASE)


def damage_die(text: str) -> str:
    """The book's damage notation as a Foundry roll formula."""
    cleaned = minus(text).strip()
    if cleaned in DASHES:
        return ""
    match = DAMAGE.match(cleaned)
    if not match:
        raise RuleError(f"unreadable damage {text!r}")
    die, keep, penalty = match.groups()
    if keep:
        return DAMAGE_FORMS[keep.lower()].format(die=die)
    if penalty:
        return f"max(1d{die}-{penalty}, 1)"
    return f"1d{die}"


SIGNED = re.compile(r"^[+-]?\d+$")


def armour_modifier(text: str) -> int:
    """A weapon's Armour column: "-2", "0", "+3". A dash is no modifier."""
    cleaned = minus(text).strip()
    if cleaned in DASHES:
        return 0
    if not SIGNED.match(cleaned):
        raise RuleError(f"unreadable armour modifier {text!r}")
    return int(cleaned)


LENGTH = re.compile(r"^(\d+)(?:\s*/\s*(\d+))?$")


def parse_length(text: str) -> dict:
    """Read a weapon's length.

    A few weapons are written "2/3" or "4/5": they can be gripped in one hand
    or in two, and the reach differs. The first number is the one-handed
    length, the second the two-handed one.
    """
    cleaned = (text or "").strip()
    if cleaned in DASHES:
        return {"length": 0, "lengthTwoHanded": None}
    match = LENGTH.match(cleaned)
    if not match:
        raise RuleError(f"unreadable weapon length {text!r}")
    one, two = match.groups()
    return {"length": int(one), "lengthTwoHanded": int(two) if two else None}


RANGE = re.compile(r"(\d+)")


def parse_range(text: str) -> dict:
    """Read "50'—150'—400'" into short, medium and long."""
    cleaned = (text or "").strip()
    if cleaned in DASHES:
        return {"short": 0, "medium": 0, "long": 0}
    found = [int(value) for value in RANGE.findall(cleaned)]
    if len(found) != 3:
        raise RuleError(f"unreadable range {text!r}")
    return {"short": found[0], "medium": found[1], "long": found[2]}


def name_of(cells: list[tables.Cell]) -> tuple[str, tables.Cell]:
    """The item's name, and the cell whose emphasis describes it.

    Where a name is spread over two columns the first groups and the second
    names -- "Land"/"Cart", "Book"/"Blank" -- and the pair reads as "Cart" and
    "Book, Blank" respectively. The emphasis that matters is the naming cell's,
    falling back to the group's.
    """
    named = [cell for cell in cells if cell.clean]
    if not named:
        raise RuleError("row has no name")
    if len(named) == 1:
        return named[0].clean, named[0]

    group, leaf = named[0], named[-1]
    marker = leaf if (leaf.em or leaf.strong) else group
    return f"{group.clean}, {leaf.clean}", marker


def enc_points(text: str) -> int | None:
    """Read an Enc cell: "+2" is two points, a dash is none given."""
    cleaned = (text or "").strip()
    if cleaned in DASHES:
        return None
    match = re.match(r"^\+?(\d+)$", cleaned)
    if not match:
        raise RuleError(f"unreadable Enc {text!r}")
    return int(match.group(1))


def needs_training(text: str) -> bool:
    """The Training column says "Training" or carries a dash."""
    return (text or "").strip().lower() == "training"


HANDS = re.compile(r"\((1H|1/2H|2H)\)")


def weapon_tags(name: str, *, training: bool) -> list[dict]:
    tags = [tag("Training")] if training else []
    hands = HANDS.search(name)
    if hands and hands.group(1) == "2H":
        tags.append(tag("Two-handed"))
    return tags


LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"\*([^*]+)\*")


def markdown_html(text: str) -> str:
    """One line of the book's Markdown as a description paragraph. Links lose
    their target -- it points into the rulebook site, not into Foundry."""
    text = LINK.sub(r"\1", (text or "").strip())
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    return f"<p>{text}</p>" if text else ""


def base_name(name: str) -> str:
    """"Lance (1/2H)" and "War flail (2H)" as their traits table names them."""
    return HANDS.sub("", name).strip().lower()


# The traits tables name a weapon by what it is, not always by its row: the
# Dagger trait belongs to the Minor weapon, which is what a dagger is.
TRAIT_ALIASES = {"dagger": "minor weapon"}


def weapon_traits(path: Path) -> dict[str, str]:
    """The Weapon Traits table on a weapons page, keyed by lower-case name."""
    traits = {}
    for table in tables.read_pipe_tables(path):
        for row in table:
            if "Weapon" in row and "Effects" in row:
                name = row["Weapon"].strip().lower()
                traits[TRAIT_ALIASES.get(name, name)] = row["Effects"]
    return traits


def weapon_system(
    cell: tables.Cell,
    row: dict[str, str],
    *,
    damage: str,
    melee: bool,
    tags: list[dict],
    description: str,
    city_key: str = "Cost City",
    rural_key: str = "Rural",
) -> dict:
    system = physical(cell, row.get(city_key, ""), row.get(rural_key, ""))
    system.update(
        {
            "damage": damage_die(damage),
            # Firearms have no Armour column: the armour's firearm rating
            # already says what it is worth against a ball.
            "armourModifier": armour_modifier(row.get("Armour", "")),
            "length": 0,
            "lengthTwoHanded": None,
            "melee": melee,
            "missile": not melee,
            "range": {"short": 0, "medium": 0, "long": 0},
            "bonus": 0,
            "pattern": "transparent",
            "slow": False,
            "counter": {"value": 0, "max": 0},
            "tags": tags,
            "description": description,
        }
    )
    return system


def melee_weapons(path: Path) -> list[Item]:
    traits = weapon_traits(path)
    items = []
    for row in tables.read_pipe_tables(path)[0]:
        cell = tables.pipe_cell(row["Weapon"])
        name = cell.clean
        if name == "Improvised":
            # A fist or a chair leg is not something you buy; entity.js already
            # rolls it as the fallback for an attack with no weapon.
            continue

        trait = traits.get(base_name(name), "")
        tags = weapon_tags(name, training=needs_training(row.get("Training", "")))
        if "Brace" in trait:
            tags.append(tag("Brace"))

        system = weapon_system(
            cell,
            row,
            damage=row["Damage"],
            melee=True,
            tags=tags,
            description=markdown_html(trait),
        )
        system.update(parse_length(row["Length"]))
        items.append(Item(name, "weapon", "weapons", system, "icons/svg/sword.svg"))
    return items


def ranged_weapons(path: Path) -> list[Item]:
    traits = weapon_traits(path)
    items = []
    for row in tables.read_pipe_tables(path)[0]:
        cell = tables.pipe_cell(row["Weapon"])
        name = cell.clean
        if name == "Thrown weapon":
            # Not goods but a rule: any melee weapon may be thrown, keeping its
            # own damage and its own price. There is nothing to buy.
            continue

        system = weapon_system(
            cell,
            row,
            damage=row["Damage"],
            melee=False,
            tags=weapon_tags(name, training=needs_training(row.get("Training", ""))),
            description=markdown_html(traits.get(base_name(name), "")),
        )
        system["range"] = parse_range(row["Range (S/M/L)"])
        items.append(Item(name, "weapon", "weapons", system, "icons/svg/target.svg"))
    return items


def firearms(path: Path) -> list[Item]:
    """Firearms.md: the guns of the age, then the powder and implements."""
    guns, implements = tables.read_pipe_tables(path)[:2]
    items = []
    for row in guns:
        cell = tables.pipe_cell(row["Firearm"])
        name = cell.clean
        # Every firearm takes instruction, per the page, whatever the column.
        tags = weapon_tags(name, training=True) + [tag("Firearm")]
        lock = row.get("Usual lock", "").strip()
        if lock and lock not in DASHES:
            tags.append(tag(lock))
        equivalent = row.get("Melee equivalent", "").strip()
        if equivalent and equivalent not in DASHES:
            tags.append(tag(f"Melee: {equivalent}"))

        system = weapon_system(
            cell, row, damage=row["Damage"], melee=False, tags=tags, description=""
        )
        system["range"] = parse_range(row["Range (S/M/L)"])
        items.append(Item(name, "weapon", "weapons", system, "icons/svg/target.svg"))

    for row in implements:
        cell = tables.pipe_cell(row["Item"])
        system = physical(cell, row.get("Cost", ""), "")
        system["costRural"] = system["cost"]
        system.update({"treasure": False, "description": markdown_html(row.get("Notes", ""))})
        if cell.clean.startswith("Powder and ball, one"):
            # Small things of one kind stack, as arrows do.
            system["stackSize"] = 20
        items.append(Item(cell.clean, "item", "gear", system, "icons/svg/item-bag.svg"))
    return items


def curious_firearms(path: Path) -> list[Item]:
    """Curious Firearms.md, an Advanced page: arms the Referee may admit.

    Shipped so the Referee need not type them in, and tagged so nobody mistakes
    one for an ordinary purchase. The plug bayonet is a Minor melee weapon and
    the grenade a thrown charge that meets no armour -- neither is shot, so
    neither is tagged Firearm, which would put the target on its firearm AC.
    """
    period, outside = tables.read_pipe_tables(path)[:2]
    items = []
    for rows, marker, note_key in (
        (period, "Curious", "Notes"),
        (outside, "Out of period", "Why it is here"),
    ):
        for row in rows:
            cell = tables.pipe_cell(row["Firearm"])
            name = cell.clean
            melee = name == "Plug bayonet"
            tags = weapon_tags(name, training=not name == "Grenade") + [tag(marker)]
            if not melee and name != "Grenade":
                tags.append(tag("Firearm"))

            system = weapon_system(
                cell,
                row,
                damage=row["Damage"],
                melee=melee,
                tags=tags,
                description=markdown_html(row.get(note_key, "")),
                city_key="Cost",
                rural_key="",
            )
            system["costRural"] = None
            if melee:
                system["length"] = 1
            else:
                system["range"] = parse_range(row["Range (S/M/L)"])
            items.append(Item(name, "weapon", "weapons", system, "icons/svg/target.svg"))
    return items


def rating(text: str, name: str, *, signed: bool = False) -> int:
    """One Armour Rating cell: "4", or "+2" for a shield. A dash is nothing."""
    cleaned = minus(text).strip()
    if cleaned in DASHES:
        return 0
    if not re.match(r"^\+\d+$" if signed else r"^\d+$", cleaned):
        raise RuleError(f"unreadable Armour Rating {text!r} for {name!r}")
    return int(cleaned)


def armour(path: Path) -> list[Item]:
    """Armor.md: an HTML table whose Armour Rating spans Melee, Ranged and
    Firearm. Every harness gives Melee and Ranged as one merged cell; only the
    shields -- written "+2" -- split them."""
    table = next((t for t in tables.read(path) if "Armour" in t.columns), None)
    if table is None:
        raise RuleError(f"no armour table in {path}")

    items = []
    for row in table.rows():
        cell = row.get("Armour", [tables.Cell()])[0]
        name = cell.clean
        if not name:
            continue

        def column(key: str) -> str:
            return row.get(key, [tables.Cell()])[0].clean

        system = physical(cell, column("Cost City"), column("Cost Rural"))
        points = enc_points(column("Enc"))
        melee, ranged, firearm = (
            column(f"Armour Rating {kind}") for kind in ("Melee", "Ranged", "Firearm")
        )

        if minus(melee).strip().startswith("+"):
            system.update(
                {
                    "type": "shield",
                    "acMelee": rating(melee, name, signed=True),
                    "acRanged": rating(ranged, name, signed=True),
                    "acFirearm": rating(firearm, name, signed=True),
                }
            )
        else:
            points = points or 0
            system.update(
                {
                    "type": armour_category(points),
                    "acMelee": rating(melee, name),
                    "acRanged": rating(ranged, name),
                    "acFirearm": rating(firearm, name),
                }
            )

        system["encumbrancePoints"] = points
        items.append(Item(name, "armor", "armour", system, "icons/svg/shield.svg"))
    return items


def vehicles(path: Path, *, antiquated: bool = False) -> list[Item]:
    """Vehicles.md, and the Advanced page of earlier and later ones."""
    items = []
    for rows in tables.read_pipe_tables(path):
        for row in rows:
            cell = tables.pipe_cell(row["Vehicle"])
            city = row.get("Cost City", row.get("Cost", ""))
            system = physical(cell, city, row.get("Rural", ""))
            note = row.get("Typical use") or row.get("Period note", "")
            system.update(
                {
                    "treasure": False,
                    "description": markdown_html(note),
                    "tags": [tag("Antiquated")] if antiquated else [],
                }
            )
            items.append(Item(cell.clean, "item", "mounts", system, "icons/svg/cart.svg"))
    return items


def simple(path: Path, pack: str, column: str, item_type: str, img: str) -> list[Item]:
    """A table of goods with nothing but a name and a price."""
    items = []
    for table in tables.read(path):
        columns = table.columns
        if column not in columns:
            continue
        combined = any("City/Rural" in name for name in columns)
        cost_key = next(name for name in columns if name.startswith("Cost"))

        for row in table.rows():
            if column not in row or cost_key not in row:
                continue
            try:
                name, cell = name_of(row[column])
            except RuleError:
                continue

            costs = row[cost_key]
            if combined:
                system = physical(cell, costs[0].clean, "", combined=True)
            else:
                rural_key = next(
                    (name for name in columns if name.endswith("Rural")), None
                )
                rural = row.get(rural_key, [tables.Cell()])[0].clean if rural_key else ""
                system = physical(cell, costs[0].clean, rural)

            if item_type == "container":
                system["itemIds"] = []
            items.append(Item(name, item_type, pack, system, img))
    return items


# --------------------------------------------------------------------------
# Ammunition
# --------------------------------------------------------------------------

"""Ammunition, which Ranged Weapons.md prices in a note rather than a table:

    Ammunition costs 5bp each for arrows and crossbows, and 2bp for sling
    bullets.

Time and Movement.md says multiple small items of the same type (spikes,
arrows) count as one item. A stack of twenty is the working figure.
"""
AMMUNITION = [
    ("Arrows", 5, "icons/svg/sword.svg"),
    ("Crossbow Bolts", 5, "icons/svg/sword.svg"),
    ("Sling Bullets", 2, "icons/svg/sword.svg"),
]


def ammunition() -> list[Item]:
    items = []
    for name, price, img in AMMUNITION:
        system = {
            "cost": price,
            "costRural": price,
            "costMinimum": False,
            "encumbrance": "normal",
            "stackSize": 20,
            "quantity": {"value": 0, "max": 0},
            "weight": 0,
            "containerId": "",
            "equipped": False,
            "treasure": False,
            "tags": [tag("Ammunition")],
            "description": "",
        }
        items.append(Item(name, "item", "gear", system, img))
    return items


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------

PACKS = {
    "weapons": "Weapons",
    "armour": "Armour & Shields",
    "gear": "Adventuring Gear",
    "containers": "Containers",
    "mounts": "Animals & Vehicles",
}


def collect(rulebook: Path) -> list[Item]:
    equipment = rulebook / "docs/Equipment"
    if not equipment.is_dir():
        raise RuleError(f"no equipment tables at {equipment}")

    items: list[Item] = []
    items += melee_weapons(equipment / "Weapons/Melee Weapons.md")
    items += ranged_weapons(equipment / "Weapons/Ranged Weapons.md")
    items += firearms(equipment / "Weapons/Firearms.md")
    items += curious_firearms(equipment / "Weapons/Curious Firearms.md")
    items += armour(equipment / "Armor.md")
    items += simple(
        equipment / "Miscellaneous.md", "gear", "Equipment", "item", "icons/svg/item-bag.svg"
    )
    items += simple(equipment / "Food.md", "gear", "Food", "item", "icons/svg/pill.svg")
    items += simple(
        equipment / "Containers.md", "containers", "Container", "container", "icons/svg/chest.svg"
    )
    items += simple(equipment / "Animals.md", "mounts", "Animal", "item", "icons/svg/mounted-knight.svg")
    items += vehicles(equipment / "Vehicles.md")
    items += vehicles(equipment / "Antiquated Vehicles.md", antiquated=True)
    items += ammunition()
    return items


def to_yaml(value, indent: int = 0) -> str:
    """A small YAML writer, so the build needs no extra dependency."""
    pad = "  " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for key, inner in value.items():
            rendered = to_yaml(inner, indent + 1)
            if isinstance(inner, (dict, list)) and inner:
                lines.append(f"{pad}{key}:\n{rendered}")
            else:
                lines.append(f"{pad}{key}: {rendered}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return "[]"
        lines = []
        for inner in value:
            rendered = to_yaml(inner, indent + 1)
            if isinstance(inner, dict) and inner:
                # A mapping in a list hangs off the dash.
                body = rendered[len(pad) + 2 :]
                lines.append(f"{pad}- {body.lstrip()}")
            else:
                lines.append(f"{pad}- {rendered}")
        return "\n".join(lines)
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)

    text = str(value)
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rulebook", type=Path, default=DEFAULT_RULEBOOK)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report what would be written without writing it",
    )
    args = parser.parse_args()

    try:
        items = collect(args.rulebook)
    except RuleError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    # The book lists a few entries twice under one name -- "Horse, Riding"
    # appears at both 100sp and 200sp. Both are shipped, exactly as printed,
    # because the rulebook is the authority and inventing a name for the second
    # would be a rules change. They are numbered so their ids stay distinct,
    # and reported so the duplication does not pass unnoticed.
    seen: dict[tuple[str, str], int] = {}
    for item in items:
        key = (item.pack, item.name)
        item.occurrence = seen.get(key, 0)
        seen[key] = item.occurrence + 1

    duplicates = {key: count for key, count in seen.items() if count > 1}
    for (pack, name), count in sorted(duplicates.items()):
        print(
            f"warning: the rulebook lists {name!r} {count} times; "
            f"all {count} are in the {pack} pack",
            file=sys.stderr,
        )

    by_pack: dict[str, list[Item]] = {}
    for item in items:
        by_pack.setdefault(item.pack, []).append(item)

    for pack in PACKS:
        directory = ROOT / "src/packs" / pack
        if not args.check:
            directory.mkdir(parents=True, exist_ok=True)
            for stale in directory.glob("*.yml"):
                stale.unlink()

        for item in sorted(by_pack.get(pack, []), key=lambda i: (i.name, i.occurrence)):
            suffix = f"-{item.occurrence + 1}" if item.occurrence else ""
            path = directory / f"{slug(item.name)}{suffix}.yml"
            if not args.check:
                path.write_text(to_yaml(item.document()) + "\n", encoding="utf-8")

        print(f"{pack:12} {len(by_pack.get(pack, [])):4} items")

    print(f"{'total':12} {len(items):4} items")
    return 0


if __name__ == "__main__":
    sys.exit(main())

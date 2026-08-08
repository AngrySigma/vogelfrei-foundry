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

# Time and Movement.md gives armour encumbrance by what the armour is, not by
# an abstract weight class:
#
#     Character is wearing metal armor          +1 Point
#     Three-quarter or heavier armor            +2 Points
#
# which is exactly the light / medium / heavy the data model carries. Mail and
# plate are metal; a padded wams and a leather buff coat are not.
ARMOUR_CATEGORY = {
    "Wams": "light",
    "Buff Coat": "light",
    "Jack Chain": "medium",
    "Chain": "medium",
    "Brigandine": "medium",
    "Half-armour": "medium",
    "Three-quarter armour": "heavy",
    "Full-plate": "heavy",
}

# The shields are not worn, they are carried, and their line in the table gives
# an AC bonus rather than an Armour Rating.
SHIELD_AC = {
    "Buckler": {"melee": 2, "ranged": 0, "encumbrance": "normal"},
    "Shield": {"melee": 2, "ranged": 3, "encumbrance": "oversized"},
    "Pavise": {"melee": 0, "ranged": 5, "encumbrance": "oversized"},
}


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

DAMAGE = re.compile(r"^d(\d+)$", re.IGNORECASE)


def damage_die(text: str) -> str:
    """The book writes "d6"; Foundry rolls want "1d6"."""
    cleaned = (text or "").strip()
    if cleaned in DASHES:
        return ""
    match = DAMAGE.match(cleaned)
    if not match:
        raise RuleError(f"unreadable damage {text!r}")
    return f"1d{match.group(1)}"


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


def melee_weapons(path: Path) -> list[Item]:
    items = []
    for row in tables.read(path)[0].rows():
        name, cell = name_of(row["Weapon"])
        if name == "Improvised":
            # A fist or a chair leg is not something you buy; entity.js already
            # rolls it as the fallback for an attack with no weapon.
            continue

        system = physical(cell, row["Cost City"][0].clean, row["Cost Rural"][0].clean)
        system.update(
            {
                "damage": damage_die(row["Damage"][0].clean),
                **parse_length(row["Length"][0].clean),
                "melee": True,
                "missile": False,
                "range": {"short": 0, "medium": 0, "long": 0},
                "bonus": 0,
                "pattern": "transparent",
                "slow": False,
                "counter": {"value": 0, "max": 0},
                "tags": [tag("Training")] if cell.needs_training else [],
            }
        )
        items.append(
            Item(name, "weapon", "weapons", system, "icons/svg/sword.svg")
        )
    return items


def ranged_weapons(path: Path, *, firearms: bool = False) -> list[Item]:
    items = []
    for row in tables.read(path)[0].rows():
        name, cell = name_of(row["Weapon" if not firearms else "Firearm"])
        if name == "Thrown Weapon":
            # Not goods but a rule: any melee weapon may be thrown, keeping its
            # own damage and its own price. There is nothing to buy.
            continue

        system = physical(cell, row["Cost City"][0].clean, row["Cost Rural"][0].clean)

        # Every ranged weapon and firearm takes instruction to use, per
        # Weapons/index.md, so they are all tagged whether asterisked or not.
        tags = [tag("Training")]
        if firearms:
            tags.append(tag("Firearm"))
            equivalent = row.get("Melee Equivalent", [])
            if equivalent and equivalent[0].clean not in DASHES:
                tags.append(tag(f"Melee: {equivalent[0].clean}"))

        system.update(
            {
                "damage": damage_die(row["Damage"][0].clean),
                "length": 0,
                "lengthTwoHanded": None,
                "melee": False,
                "missile": True,
                "range": parse_range(row["Range (S/M/L)"][0].clean),
                "bonus": 0,
                "pattern": "transparent",
                "slow": False,
                "counter": {"value": 0, "max": 0},
                "tags": tags,
            }
        )
        items.append(Item(name, "weapon", "weapons", system, "icons/svg/target.svg"))
    return items


def armour(path: Path) -> list[Item]:
    items = []
    for row in tables.read_pipe_table(path):
        name = row["Armor"].replace("*", "").strip()
        name = re.sub(r"[*_]", "", name).strip()
        if not name:
            continue

        emphasis = row["Armor"]
        cell = tables.Cell(
            text=name,
            em="*" in emphasis or "_" in emphasis,
            strong="**" in emphasis or "__" in emphasis,
        )

        city = row.get("Cost City", "")
        rural = row.get("Rural", "")
        system = physical(cell, city, rural)

        rating = row.get("Armor Rating", "")
        if name in SHIELD_AC:
            shield = SHIELD_AC[name]
            system.update(
                {
                    "type": "shield",
                    "acMelee": shield["melee"],
                    "acRanged": shield["ranged"],
                    "encumbrance": shield["encumbrance"],
                }
            )
        else:
            category = ARMOUR_CATEGORY.get(name)
            if category is None:
                raise RuleError(
                    f"no encumbrance category known for armour {name!r}; "
                    "Time and Movement.md sets it by whether the armour is "
                    "metal and whether it is three-quarter or heavier"
                )
            match = re.match(r"^(\d+)$", rating.strip())
            if not match:
                raise RuleError(f"unreadable Armour Rating {rating!r} for {name!r}")
            value = int(match.group(1))
            system.update(
                {"type": category, "acMelee": value, "acRanged": value}
            )

        items.append(Item(name, "armor", "armour", system, "icons/svg/shield.svg"))
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
# Coins
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


COINS = [
    ("Gold Pieces", BP_PER_GP, "icons/svg/coins.svg"),
    ("Silver Pieces", BP_PER_SP, "icons/svg/coins.svg"),
    ("Brass Pieces", 1, "icons/svg/coins.svg"),
]


def coins() -> list[Item]:
    """The three coins, as treasure Items the purse can be paid out of.

    A hundred coins count as one carried item (Time and Movement.md), which is
    what the stack size says.
    """
    items = []
    for name, value, img in COINS:
        system = {
            "cost": value,
            "costRural": value,
            "costMinimum": False,
            "encumbrance": "normal",
            "stackSize": 100,
            "quantity": {"value": 0, "max": 0},
            "weight": 0,
            "containerId": "",
            "equipped": False,
            "treasure": True,
            "tags": [tag("coins")],
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
    items += ranged_weapons(equipment / "Weapons/Firearms.md", firearms=True)
    items += armour(equipment / "Armor.md")
    items += simple(
        equipment / "Miscellaneous.md", "gear", "Equipment", "item", "icons/svg/item-bag.svg"
    )
    items += simple(equipment / "Food.md", "gear", "Food", "item", "icons/svg/pill.svg")
    items += simple(
        equipment / "Containers.md", "containers", "Container", "container", "icons/svg/chest.svg"
    )
    items += simple(equipment / "Animals.md", "mounts", "Animal", "item", "icons/svg/mounted-knight.svg")
    items += simple(equipment / "Vehicles.md", "mounts", "Vehicle", "item", "icons/svg/cart.svg")
    items += ammunition()
    items += coins()
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

"""Reading the rulebook's equipment tables.

The tables in ~/tabletop/vogelfrei/docs/Equipment are hand-written HTML, not
Markdown, and they use rowspan and colspan freely -- one cell spanning three
rows to group Blank/Reading/Spellbook under "Book". Reading them means
expanding that back into a rectangular grid.

Emphasis carries meaning. From Equipment/index.md:

    *Italicized* items are Non-Encumbering for encumbrance purposes.
    Items in ***bold italics*** are Oversized.

so a cell's <em>/<strong> markers are data, not decoration, and the parser
keeps them.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


@dataclass
class Cell:
    """One table cell, with the emphasis that gives it meaning."""

    text: str = ""
    rowspan: int = 1
    colspan: int = 1
    em: bool = False
    strong: bool = False

    @property
    def clean(self) -> str:
        """The cell's text, with the training asterisk and whitespace removed."""
        return re.sub(r"\s+", " ", self.text).strip().rstrip("*").strip()

    @property
    def needs_training(self) -> bool:
        """Whether the entry is asterisked: it takes instruction to use at all."""
        return "*" in self.text

    @property
    def encumbrance(self) -> str:
        """How the item counts, per the legend in Equipment/index.md."""
        if self.strong and self.em:
            return "oversized"
        if self.em:
            return "none"
        return "normal"


@dataclass
class Table:
    """A table as the book prints it: header rows, then body rows."""

    head: list[list[Cell | None]] = field(default_factory=list)
    body: list[list[Cell | None]] = field(default_factory=list)

    @property
    def columns(self) -> list[str]:
        """Header labels, one per column, joined down through stacked headers.

        The cost header is two rows deep -- "Cost" spanning City and Rural --
        so a column's name is every header cell above it, joined.
        """
        width = max((len(row) for row in self.head), default=0)
        names = []
        for index in range(width):
            parts = []
            for row in self.head:
                cell = row[index] if index < len(row) else None
                if cell and cell.clean and cell.clean not in parts:
                    parts.append(cell.clean)
            names.append(" ".join(parts))
        return names

    def rows(self) -> list[dict[str, list[Cell]]]:
        """Body rows keyed by column name.

        A name may be spread across two columns, and what that means differs by
        table. In the melee weapons table one cell spans both, so there is a
        single name. In Vehicles the first cell groups ("Land") and the second
        names ("Cart"); in Miscellaneous a "Book" cell spans three rows over
        "Blank"/"Reading"/"Spellbook". So each column name keeps every distinct
        cell under it, and the caller decides how to read them.
        """
        names = self.columns
        out = []
        for row in self.body:
            entry: dict[str, list[Cell]] = {}
            for index, cell in enumerate(row):
                if cell is None:
                    continue
                key = names[index] if index < len(names) else f"col{index}"
                bucket = entry.setdefault(key, [])
                # A cell spanning two columns appears twice in the grid; it is
                # still one cell, and identity is what tells them apart.
                if not any(cell is seen for seen in bucket):
                    bucket.append(cell)
            out.append(entry)
        return out


class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[Table] = []
        self._head: list[list[Cell]] = []
        self._body: list[list[Cell]] = []
        self._row: list[Cell] | None = None
        self._cell: Cell | None = None
        self._in_head = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self._head, self._body = [], []
        elif tag == "thead":
            self._in_head = True
        elif tag == "tbody":
            self._in_head = False
        elif tag == "tr":
            self._row = []
        elif tag in ("td", "th"):
            self._cell = Cell(
                rowspan=int(a.get("rowspan", 1)),
                colspan=int(a.get("colspan", 1)),
            )
        elif tag in ("em", "i") and self._cell is not None:
            self._cell.em = True
        elif tag in ("strong", "b") and self._cell is not None:
            self._cell.strong = True

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(self._cell)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            (self._head if self._in_head else self._body).append(self._row)
            self._row = None
        elif tag == "table":
            self.tables.append(
                Table(head=_expand(self._head), body=_expand(self._body))
            )

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.text += data


def _expand(rows: list[list[Cell]]) -> list[list[Cell | None]]:
    """Turn a ragged span-using table into a rectangular grid.

    A cell with rowspan=3 appears in all three of its rows; one with colspan=2
    fills both of its columns. Every position that no cell reaches is None.
    """
    grid: list[list[Cell | None]] = []
    carry: dict[int, tuple[Cell, int]] = {}

    for row in rows:
        line: dict[int, Cell] = {}
        for column, (cell, _left) in carry.items():
            for offset in range(column, column + cell.colspan):
                line[offset] = cell

        next_carry = {
            column: (cell, left - 1)
            for column, (cell, left) in carry.items()
            if left - 1 > 0
        }

        column = 0
        for cell in row:
            while column in line:
                column += 1
            for offset in range(column, column + cell.colspan):
                line[offset] = cell
            if cell.rowspan > 1:
                next_carry[column] = (cell, cell.rowspan - 1)
            column += cell.colspan

        carry = next_carry
        width = max(line) + 1 if line else 0
        grid.append([line.get(index) for index in range(width)])

    return grid


def read(path: Path) -> list[Table]:
    """Every table in one Markdown page, in the order they appear."""
    parser = _Parser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser.tables


def read_pipe_table(path: Path) -> list[dict[str, str]]:
    """Read a Markdown pipe table. Armor.md is the only one that uses them.

    Its header is two rows deep -- a blank-headed row carrying City/Rural --
    which is why the second row is folded into the column names rather than
    treated as data.
    """
    lines = [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip().startswith("|")
    ]
    if not lines:
        return []

    def cells(line: str) -> list[str]:
        return [part.strip() for part in line.strip().strip("|").split("|")]

    header = cells(lines[0])
    # Drop the |---|---| separator, then fold any header continuation rows in.
    body = [cells(line) for line in lines[1:] if not set(line) <= set("|- :")]

    while body and sum(1 for value in body[0] if value) <= len(header) // 2:
        for index, value in enumerate(body[0]):
            if value and index < len(header):
                header[index] = f"{header[index]} {value}".strip()
        body.pop(0)

    return [
        {header[i]: row[i] for i in range(min(len(header), len(row)))} for row in body
    ]

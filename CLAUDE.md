# CLAUDE.md — Vogelfrei for Foundry VTT

Guidance for Claude Code working in this directory.

## The task

Build **Vogelfrei** — the OSR game whose rulebook lives at `~/tabletop/vogelfrei` — as a
**Foundry VTT game system**, derived from the installed **Old-School Essentials (OSE)**
system as its foundation.

The deliverable is a self-contained, installable system package that can be dropped onto
*any* remote Linux box running Foundry: either by manifest URL from a GitHub release, or
by copying a directory into `Data/systems/`. Nothing is built yet — this file is the
starting brief.

**Status: greenfield.** No code exists in this directory yet.

## Layout of the machine

| Path | What it is | May Claude write to it? |
| --- | --- | --- |
| `~/foundry/` | Foundry VTT **application install** (Electron bundle + `resources/app` server). Version **14.365**. | **No.** Read only. See constraints. |
| `~/foundrydata/` | Foundry **user data dir** (`--dataPath`). Holds `Data/{systems,modules,worlds,assets}`, `Config/options.json`, `Logs/`. | Only under `Data/systems/vogelfrei/` (or a symlink to it) for live testing. |
| `~/foundrydata/Data/systems/ose/` | **OSE 2.3.0**, the baseline to fork. A *build artifact* — see below. | **No.** Treat as an upstream reference copy. |
| `~/foundrydata/Data/modules/classicfantasycompendium/` | Classic Fantasy Compendium 2.0.0 — OSE SRD content in LevelDB packs. Useful as a worked example of pack structure. | No. |
| `~/tabletop/vogelfrei/` | The **rulebook source** (Zensical static site, 158 Markdown pages under `docs/`). The rules authority. Its own git repo, its own `CLAUDE.md`. | Read. Don't edit rules from here — that's a separate repo and a separate decision. |
| `~/foundry-dev/` | This directory. Workspace for the Vogelfrei system. | Yes. |

Foundry is currently **running**: `node ~/foundry/resources/app/main.js --dataPath=/home/iiov/foundrydata`,
port 30000, no world created yet. Node v24.19.0, npm 11.17.0, git 2.34.1 available. GitHub is
reachable (`git ls-remote` to `NecroticGnome/ose-foundry-core` succeeds).

## Constraints

1. **Never modify the Foundry core install** (`~/foundry/**`). Reading it to understand the
   API is encouraged; patching it is forbidden. No exceptions, no "just this one line".
2. **Never modify the installed OSE system** in place. It is the reference baseline and the
   control group. Vogelfrei gets its **own system id** and its own directory.
3. This is a **throwaway Foundry instance** — worlds, actors and settings inside it are
   expendable, so destructive experiments *inside a test world* are fine. The install and
   the OSE copy are not.
4. `~/tabletop/vogelfrei` is the source of truth for rules. If the implementation and the
   book disagree, the book wins — or the discrepancy gets reported, not silently patched.

## Rules delta: OSE → Vogelfrei

This is the actual work, roughly in order of increasing difficulty.

### 1. Renaming (surface — i18n only)

OSE's data model keys stay; only labels change. All strings live in
`systems/ose/dist/lang/en.json` under stable key paths:

- `OSE.scores.{str,int,wis,dex,con,cha}.{long,short}` → Vogelfrei's six abilities:
  **Strength, Toughness, Agility, Intelligence, Willpower, Leadership**.
  Mapping to OSE slots: `str`→Strength, `con`→Toughness, `dex`→Agility, `int`→Intelligence,
  `wis`→Willpower, `cha`→Leadership.
- `OSE.saves.{death,wand,paralysis,breath,spell}.{long,short}` → Vogelfrei's five:
  **Poison, Magical Device, Paralyzation, Breath Weapon, Magic**.
  (`death`→Poison, `wand`→Magical Device, `paralysis`→Paralyzation, `breath`→Breath Weapon,
  `spell`→Magic.)
- HP → **Wounds**; the `OSE.items.*`, `OSE.Attack*`, `OSE.dialog.*` families cover the rest.

A previous attempt got this far in minutes and it was pure renaming. Expect the same. Note the
modifier scale differs from B/X: Vogelfrei is 3 → −3, 4-5 → −2, 6-8 → −1, 9-12 → 0, 13-15 → +1,
16-17 → +2, 18 → +3.

### 2. Wounds / Stamina (data model + sheet + damage application)

OSE has a single `hp {hd, value, max}` pool. Vogelfrei splits it:

- **Wounds** — OSE's `hp`, essentially. Class minimum at level 1 (Warrior 7, Dwarf/Ranger 6,
  Halfling/Rogue/Townsman/Peasant/Cleric/Elf 4, Academic/Magic-User 3), plus Toughness bonus
  applied **once** at level 1.
- **Stamina** — a second pool, rolled from a class die at level 1 and again each level
  (Martial 1d4, Semi-martial 1d3, Non-martial 1d2). Toughness never applies.
- **Damage order**: all damage hits Stamina first; overflow goes to Wounds.
- **Coupling**: whenever Wounds are lost, an *equal* amount of Stamina is lost too (min 0).
- **Bypass**: unaware/helpless targets, critical hits (nat 20), poison and falling go straight
  to Wounds. Area effects do *not* bypass, unless the target is helpless.
- **Monsters and unintelligent creatures have no Stamina at all.**
- 0 Wounds or fewer → critical injury roll `1d4 + (Wounds below zero)`, table at
  `docs/Adventuring/Hazards/Damage.md`, plus a d6 hit-location roll.

Touches `template.json`, the character/monster data models, `applyDamage()` in the actor
entity, and the sheet templates.

### 3. Attack and AC (roll logic)

Vogelfrei is **ascending-AC only**, with a different base and an extra term — OSE's
`ascendingAC` setting and its THAC0/descending path should both be dropped rather than
configured around.

- **Melee AC** = 8 + Agility bonus + Weapon Skill + Armour Rating + shield/off-hand.
- **Ranged AC** = 11 + Agility bonus + Armour Rating.
  So a character carries **two static AC numbers**, not one — OSE carries `ac` (descending)
  and `aac` (ascending) as parallel values, and that pair of fields is the natural place to
  repurpose, but the semantics change completely.
- **Attack roll** = d20 + Weapon Skill (melee) or Ballistic Skill (ranged) + Strength bonus
  (melee) or Agility bonus (ranged) + weapon-length modifier; **hits on ≥ AC**.
- Nat 20 always hits and is a critical (damage direct to Wounds); nat 1 always misses.
- **Armour Rating** (0–6) adds to AC, it is not damage reduction. Shields: +2 melee AC;
  shield +3 ranged AC; pavise +5 ranged; buckler +2 melee only.
- WS/BS are new character stats with no OSE equivalent — closest is `thac0.bba`/`thac0.mod`,
  but they should be modelled properly.

Full procedure: `docs/Encounters/Combat Actions.md`.

### 4. Skills (x-in-6)

Every character has a base **1 in 6** on any skill; class/career advances raise it; some
skills are **Special** and unusable at 0. OSE already has exactly this shape in its
`exploration` block (`ld/od/sd/ft/fg/hn`, rolled `1d6 <= value`), so the mechanism exists —
it needs a larger, extensible skill list rather than six fixed keys.
See `docs/Adventuring/Skills.md`.

### 5. Classes, careers, compendia (content)

12 classes × ~6 careers each, 66 career pages, spells and miracles by level, full equipment
tables. All of it already lives as structured Markdown in `~/tabletop/vogelfrei/docs/` — this
should be **generated**, not hand-entered, into Foundry compendium packs.

### 6. Character generation (stretch)

`~/tabletop/vogelfrei/.claude/skills/character-generation/` contains working Python that
rolls stats, ranks classes for an array, applies class/career/alignment/money, rolls bio and
name, buys equipment against parsed price tables, and computes AC and encumbrance — parsing
the rulebook Markdown directly.

**The Foundry system must not call that skill.** The wanted outcome is an in-Foundry
generator dialog producing a complete level-1 character with all stats — OSE already ships
one (`dist/templates/actors/dialogs/character-creation.html`, `OSE.dialog.generator`) as the
starting point. The Python scripts are a **specification of the algorithm**, worth reading for
the rules logic; they are not a runtime dependency.

## How OSE is put together (and how to get its source)

The installed system is a **build artifact**: `dist/ose.js` is a 692 KB bundle. But
`dist/ose.js.map` ships with **full `sourcesContent` for all 89 original source files**, so
the entire upstream TypeScript/JS source is recoverable offline:

```python
import json
m = json.load(open('/home/iiov/foundrydata/Data/systems/ose/dist/ose.js.map'))
src = dict(zip(m['sources'], m['sourcesContent']))   # keys like '../src/module/actor/entity.js'
```

Useful entries:

- `src/module/actor/entity.js` — `rollAttack`, `rollDamage`, `applyDamage`, `rollSave`,
  `rollCheck`, `rollExploration`, `rollHP`, `generateSave`, `getExperience`
- `src/module/actor/data-model-character.js`, `data-model-monster.js`
- `src/module/actor/data-model-classes/data-model-character-ac.ts` — AC assembly; hardcodes
  `baseAscending = 10` / `baseDescending = 9` and picks the `aac`/`ac` property accordingly
- `src/module/actor/data-model-classes/data-model-character-scores.ts` — ability modifiers
- `src/module/actor/data-model-classes/data-model-character-encumbrance*.ts` — five strategies
- `src/module/settings.ts` — registered settings: `ascendingAC`, `applyDamageOption`,
  `initiative`, `morale`, `encumbranceOption`, `languages`, `significantTreasure`, …
- `src/module/combat/*.ts`, `src/module/item/data-model-*.js`, `src/module/dialog/*.js`

The map is for **reading**. For actually forking, clone upstream —
`https://github.com/NecroticGnome/ose-foundry-core` (the map has no `package.json` or build
config; the real repo is Vite + TypeScript + Handlebars templates and has a test suite).

Other structure worth knowing:

- `system.json` — `id` **must** match the directory name. Declares `esmodules`, `styles`,
  `languages`, `grid`, `packs`, `compatibility`, and the `manifest`/`download` URL pair used
  for installs and updates.
- `template.json` — the raw data model: Actor types `character`/`monster` with `common` and
  `spellcaster` templates; Item types `item, weapon, armor, spell, ability, container`.
  Read this first; it is the shortest complete description of what a character *is* in OSE.
- `dist/templates/` — Handlebars: `actors/`, `actors/partials/`, `actors/dialogs/`, `items/`,
  `chat/`, `apps/`, `sidebar/`.
- Compendium packs on modern Foundry are **LevelDB directories**, not NeDB `.db` files — see
  `modules/classicfantasycompendium/packs/*/` for the real shape. OSE still carries a legacy
  `dist/packs/macros.db` and declares `"packs": []`.

**Version note:** OSE 2.3.0 declares `compatibility: {minimum: "13", verified: "13"}` while
the installed Foundry is **14.365**. It loads unverified. Anything odd during testing should
be checked against that gap before being blamed on our code. A Vogelfrei system should
declare v14 honestly.

There is a precedent worth knowing about and *not* copying: a Lamentations of the Flame
Princess system was derived from OSE around Foundry 0.8.8. It proves the approach works;
its code is six major versions stale and is not a reference.

## Distribution — the answer to "how do I get this onto another server"

Both routes work; do both.

1. **Git + GitHub release (primary).** This directory becomes a git repo. A release publishes
   two assets: `system.json` and `system.zip` (the zip's **root** must contain `system.json`).
   `system.json` carries:
   ```json
   "manifest": "https://github.com/<user>/<repo>/releases/latest/download/system.json",
   "download": "https://github.com/<user>/<repo>/releases/download/<version>/system.zip"
   ```
   Then on any Foundry instance: *Game Systems → Install System → Manifest URL*. **The
   official package registry is not involved** — arbitrary manifest URLs are supported
   first-class, and this is how every unlisted system is distributed. A CI workflow can build
   and attach both assets on tag push.
2. **Plain copy (fallback, always works).** `scp -r` / `rsync` the built system directory into
   `<dataPath>/Data/systems/vogelfrei/` and restart Foundry. Manifest updates won't work, but
   installation will.

For local testing, symlink instead of copying:
`ln -s ~/foundry-dev/<build-output> ~/foundrydata/Data/systems/vogelfrei`.

## Recommended approach

**Fork OSE into a new system with id `vogelfrei`.** Not a module overlay: a module could do
the renaming (a module's `languages` entry overrides system keys) but cannot cleanly change
the data model, the damage pipeline, or the attack formula — and items 2–4 above are exactly
those. A fork also keeps the OSE install untouched as a working control.

Licensing is a real constraint, not a footnote: OSE ships `LICENSE.GPL` alongside
`LICENSE.OGL` and `LICENSE.OTHER.OSE_THIRD_PARTY_V1_5`. The **code** is GPL, so a derived
system inherits it. Keep the licence files, the `AUTHORS` file, and attribution intact, and
do not carry over Necrotic Gnome's proprietary *content* (the SRD-derived compendia are a
separate module for a reason).

Suggested order of work: fork and rebuild unchanged → rename (i18n) → Wounds/Stamina →
attack/AC → skills → generated compendia → character generator.

## Open questions

- Where the GitHub repo lives (account, repo name, public or private) — decides the manifest
  URLs baked into `system.json`.
- Whether to track upstream OSE as a git remote for future merges, or hard-fork and diverge.
  (Hard fork is simpler and probably right, given how deep the combat changes go.)
- Whether the rulebook repo becomes a build-time dependency for generating compendia (a
  submodule or a vendored export), or whether generated packs are committed as artifacts.
- How WS/BS and the skill list should be modelled — first-class data-model fields vs. Items
  of type `ability` (OSE's existing escape hatch).
- Wood Elf class is referenced from the class/career tables but has no `docs/Character/Classes/Wood Elf/`
  pages yet; NOTES.md in the rulebook repo lists other unresolved rules questions (career
  Status unset on 49 of 66 career pages, which blocks starting-money generation).

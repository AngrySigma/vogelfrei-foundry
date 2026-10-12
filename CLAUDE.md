# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Vogelfrei** is a Foundry VTT game system (id `vogelfrei`, Foundry **v14**), hard-forked from
Old-School Essentials 2.3.0 (`7d720d6` is the fork point). It implements the OSR game whose
rulebook lives at `~/tabletop/vogelfrei`. Published as GitHub releases from
`AngrySigma/vogelfrei-foundry`. README.md, CONTRIBUTING.md and CHANGELOG.md are still OSE's
upstream text and do not describe this project.

## Machine layout and hard constraints

| Path | What it is | Write? |
| --- | --- | --- |
| `~/foundry/` | Foundry **14.365** app install, shared by both instances. `./foundry/` here symlinks into it for types. | **Never.** Read to learn the API. |
| `~/foundrydata/` | **PROD** data dir, port 30000, `foundry.service`. Live campaign *In Profundum*, players connected. Gets vogelfrei only via the published release manifest. | **Never.** Not for tests, not "just a look" writes. Read only when asked. |
| `~/foundrydata-dev/` | **DEV** data dir, port 30001, `foundry-dev` service. `Data/systems/vogelfrei` symlinks to this repo. Test worlds `newworld`, `otherworld` are expendable. Must never contain *In Profundum*. | Yes. |
| `~/foundrydata-dev/Data/systems/ose/` | Installed OSE 2.3.0, the untouched control. `dist/ose.js.map` holds full upstream source in `sourcesContent`. | No. |
| `~/tabletop/vogelfrei/` | Rulebook source (Markdown under `docs/`), its own repo. | Read only. |

- `foundryconfig.json` (used by `npm run link`) must list **only** `~/foundrydata-dev`.
- Services, dev data dir and firewall are managed in the `AngrySigma/vogelfrei-infra` Ansible repo (`roles/foundry`), not here.
- **The rulebook is the authority.** If code and book disagree, the book wins, or report the
  discrepancy. Don't silently patch either side. The user wrote the rulebook, so their word
  overrides the docs.
- Licensing: the code is GPL (inherited). Keep `LICENSE.*`, `AUTHORS`, `NOTICE` and attribution
  intact. Don't import Necrotic Gnome's proprietary content.

## Commands

```sh
npm run build            # clean → rollup (src/vogelfrei.js → dist/vogelfrei.js) → sass → compile packs
npm run watch            # rollup + sass in watch mode (does not rebuild packs)
npm run lint             # biome check src   (fix: npm run fix, format: npm run format)
npm run typecheck        # tsc --noEmit
npm run build:packs      # src/packs/**/*.yml → dist/packs/* LevelDB (tools/build-packs/compile.mjs)
npm run build:packs:sources   # regenerate src/packs YAML from the rulebook (tools/build-packs/generate.py)
```

Because the dev instance symlinks this repo, a build shows up after reloading the browser on
port 30001. Template, `system.json`, `template.json` or pack changes may need a world relaunch
or a dev service restart.

### Tests

There is no Node test runner. Tests are **Quench** batches (mocha/chai inside Foundry). The
Quench module is installed in the dev instance.

- Test files sit beside the code in `src/**/__tests__/*.test.ts`. Each exports `key`, `options`
  and a default batch function.
- **Every batch must be registered** in `src/e2e/index.ts` (`quench.registerBatch(...)`), and
  that file is imported by `src/vogelfrei.js`. A new test file that isn't registered there
  never runs.
- To run them: build, open a dev world on port 30001 with Quench enabled, and run the batches
  from the Quench UI. A single batch can be run by itself from that UI. They cannot run from the
  shell, so say so plainly instead of claiming tests passed.

### Releasing

Bump `version` in **both** `package.json` and `system.json`, and the tag inside
`system.json`'s `download` URL. Commit as `Release X.Y.Z`, then push tag `X.Y.Z`.
`.github/workflows/release.yml` triggers on the tag push. It builds, substitutes the
manifest/download URLs, zips (`system.json` at the zip root), and creates the GitHub Release
with `system.json` and `system.zip`. Prod then updates through Foundry's own updater.

## Architecture

Entry point: `src/vogelfrei.js` registers settings, document classes, data models, sheets and
hooks. Internal names still say OSE (`OseActor`, `OseItem`, `CONFIG.OSE`, `OseDataModel*`),
which is a leftover of the fork and not a sign of untouched code. User-facing strings live in
`src/lang/en.json` under the **`VF.*`** namespace.

**Data model.** `template.json` plus the TypeDataModels in `src/module/actor/data-model-*.js`
and `src/module/item/data-model-*.js`. The keys were **renamed**, not just relabelled:
- scores: `strength, toughness, agility, intelligence, willpower, leadership`
- saves, in the book's order: `paralysis, poison, breath, device, magic`
- `wounds` (was `hp`) and `stamina` pools, plus `ws` / `bs` (Weapon / Ballistic Skill)
- `exploration` holds the nine x-in-6 skills listed in `CONFIG.OSE.exploration_skills`
  (`src/module/config.ts`). Their sheet view is in `actor/exploration-skills.ts`.
- `ac`/`aac`/`thac0` remain in `template.json` as legacy fields. Vogelfrei AC does not come from them.

**Rules modules.** These are pure and Foundry-free where possible, so they can be tested:
- `actor/damage.ts`: the Wounds/Stamina pipeline (Stamina first, coupled loss, crits/bypass
  straight to Wounds, no Stamina for monsters). `OseActor#applyDamage` in `actor/entity.js` is
  a thin wrapper around it.
- `actor/data-model-classes/data-model-character-ac.ts`: `ARMOUR_CLASS_VARIANTS` is the single
  table of AC formulas (melee, meleeMonster, ranged, firearm, surprised), all from
  `BASE_AC = 10`, with armour **Proof** for firearms. To change AC, edit that table only.
- `actor/entity.js`: attack/save/check/skill rolls. `helpers-dice.js` digests attack results:
  hit on ≥ the chosen AC variant, nat 20 is a critical routed into damage, nat 1 misses.
- `actor/data-model-classes/data-model-character-scores.ts`: ability modifiers on the Vogelfrei
  scale (3→−3 … 18→+3).
- Encumbrance uses the points scheme (`encumbrance-points.ts`,
  `data-model-character-encumbrance-vogelfrei.ts`). The OSE strategies remain as alternatives.
- Money is `money.ts`: 1 gp = 50 sp = 600 bp, with no copper. Coins are three counts on the
  character (`purse.ts`), not Items.
- `dialog/character-creation.js`: the in-Foundry level-1 generator. The Python skill in the
  rulebook repo (`.claude/skills/character-generation/`) is its **specification**, never a
  runtime dependency.
- `chronicle/`: Vogelfrei-specific calendar, watch/turn clocks, encounters and upkeep. It has
  no OSE counterpart.
- `upload-guard.ts` keeps player uploads in one folder.

**Compendia.** `src/packs/<pack>/*.yml` holds the reviewable sources, one document per file,
and they are committed. `tools/build-packs/generate.py` writes them from the rulebook's
equipment tables. Ids are deterministic (hashed from pack + name), so never hand-randomise
them. `compile.mjs` builds them into `dist/packs/` LevelDB, which is declared in `system.json`
`packs`. The build does not need the rulebook checked out. Only equipment packs exist so far:
weapons, armour, gear, containers, mounts.

Templates are in `src/templates/` (Handlebars, preloaded by `preloadTemplates.ts`) and styles
in `src/scss/` → `dist/vogelfrei.css`. Rollup copies `lang` and `templates` into `dist/`.

## Not done yet / open questions

- Class and career compendia, and spells and miracles, are not generated yet.
- Wood Elf is referenced by the class tables but has no class pages in the rulebook. The
  rulebook's `NOTES.md` lists other unresolved rules, including career Status being unset on
  most career pages, which blocks starting-money generation.
- WS/BS and skills are first-class data-model fields. The skill list is a fixed config table,
  not Items.

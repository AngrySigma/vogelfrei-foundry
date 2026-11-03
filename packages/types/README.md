# @vogelfrei/types

TypeScript types for the [Vogelfrei](https://github.com/AngrySigma/vogelfrei-foundry) Foundry VTT system.

This declaration-only package re-exports types declared in the system's TypeScript sources: configuration unions,
character helper-class interfaces, and exploration-skill shapes. It contains no runtime code.

## Install

```sh
npm i -D @vogelfrei/types
# or pnpm add -D @vogelfrei/types
```

The package needs its `@league-of-foundry-developers/foundry-vtt-types` peer dependency. On npm 7+ and pnpm 8+
it installs automatically.

## What's exported

| Group | Types |
| --- | --- |
| **Configuration** (from `src/module/config.ts`) | `VogelfreiConfig`, `Save`, `Armor`, `Attribute`, `ExplorationSkill`, `RollType`, `Color`, `InventoryItemTag`, `EncumbranceOption`, `ApplyDamageOption` |
| **Character helpers** (from `src/module/actor/data-model-classes/*.ts`) | `CharacterAC`, `CharacterScores`, `CharacterMove`, `CharacterEncumbrance`, `CharacterSpells` |
| **Exploration skills** (from `src/module/actor/exploration-skills.ts`) | `ExplorationSkills` |

## Usage

```ts
import type { CharacterScores, Save, VogelfreiConfig } from "@vogelfrei/types";

function rollSave(scoreType: Save) { /* … */ }
```

The shipped surface grows as the system's remaining JavaScript data models move to TypeScript and explicitly
export their shapes.

## Maintenance

`index.d.ts` is generated — do not edit it. From the repository root, run `npm run build:types` to produce it
from `src/types/`.

## Releasing

Bump `version` in `packages/types/package.json`, then run `npm run release:types` from the repository root.
Publishing requires an npm account with publish rights to the `@vogelfrei` scope. The package sets
`publishConfig.access: public`, so no additional access flag is needed.

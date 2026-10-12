# Contributing

Open an [issue](https://github.com/AngrySigma/vogelfrei-foundry/issues) before starting anything large.
The rules authority is the Vogelfrei rulebook. If the code and the book disagree, report it rather than
patching around it.

## Setup

You need Node.js 22 or later and a licensed Foundry VTT v14 install.

```sh
npm ci
cp foundryconfig.json.example foundryconfig.json   # set dataPath to your Foundry data directory
npm run link     # symlinks this repo into <dataPath>/Data/systems/vogelfrei
npm run build    # or: npm run watch
```

`npm run build` also rebuilds the compendium packs. When only code, templates or styles have
changed, `npm run build:js && npm run build:css` is faster and leaves the packs alone.

## Compendium packs

The pack sources are committed as YAML under `src/packs/`. `npm run build:packs` compiles them into
`dist/packs/`. To regenerate the YAML from the rulebook's equipment tables, run
`npm run build:packs:sources`. This needs the rulebook checked out at `~/tabletop/vogelfrei`, or you
can pass its path to `tools/build-packs/generate.py --rulebook <path>`.

## Tests

Tests are [Quench](https://github.com/Ethaks/FVTT-Quench) batches that run inside Foundry. Install the
Quench module, enable it in a test world, and run the "Vogelfrei" batches from its window. New test
files go next to the code in `__tests__/` and must be registered in `src/e2e/index.ts`.

`npm run lint` runs Biome.

## Releases

Bump `version` in both `package.json` and `system.json`, and the tag in `system.json`'s `download`
URL. Then push a tag with the same version. The release workflow builds the system and publishes
`system.json` and `system.zip`.

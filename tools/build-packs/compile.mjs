/**
 * @file Compile the committed pack sources into the LevelDB directories Foundry reads.
 *
 *   node tools/build-packs/compile.mjs
 *
 * Sources are one YAML document per file under src/packs/<pack>/, written by
 * generate.py. They are compiled rather than copied because a compendium on
 * Foundry 13 and later is a LevelDB directory, which is binary and unreviewable
 * in git -- so the reviewable form is committed and the binary form is built.
 */
import { readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { ClassicLevel } from "classic-level";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sources = join(root, "src/packs");
const output = join(root, "dist/packs");

/**
 * @returns {Promise<string[]>} Every pack directory holding YAML sources.
 */
async function packs() {
  const entries = await readdir(sources, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(join(sources, entry.name));
    if (files.some((file) => file.endsWith(".yml"))) found.push(entry.name);
  }

  return found.sort();
}

const names = await packs();
if (names.length === 0) {
  console.error(`No pack sources under ${sources}. Run tools/build-packs/generate.py first.`);
  process.exit(1);
}

/**
 * How many documents a compiled pack actually holds.
 *
 * Worth checking rather than trusting: compilePack skips any source document
 * without a `_key` and says nothing about it, so a mistake in the generator
 * produces an empty pack and a successful build.
 *
 * @param {string} directory - The compiled pack.
 * @returns {Promise<number>} Documents found.
 */
async function documentsIn(directory) {
  const db = new ClassicLevel(directory, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  try {
    let found = 0;
    for await (const _entry of db.iterator()) found += 1;
    return found;
  } finally {
    await db.close();
  }
}

let failed = false;

for (const name of names) {
  const destination = join(output, name);
  // compilePack adds to whatever is already there, so a stale build would
  // leave deleted documents behind.
  await rm(destination, { recursive: true, force: true });
  await compilePack(join(sources, name), destination, { yaml: true, log: false });

  const expected = (await readdir(join(sources, name))).filter((file) => file.endsWith(".yml")).length;
  const actual = await documentsIn(destination);

  console.log(`packs: ${name.padEnd(12)} ${String(actual).padStart(4)} documents`);

  if (actual !== expected) {
    console.error(`packs: ${name} has ${actual} documents but ${expected} sources — some were skipped`);
    failed = true;
  }
}

if (failed) process.exit(1);

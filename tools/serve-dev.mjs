/**
 * @file Run the dev Foundry instance: the same app install as prod, pointed at
 *       the dev data dir (the first `dataPath` in foundryconfig.json), whose
 *       systems/vogelfrei is a symlink to this repo. Prod is the systemd
 *       service on port 30000 and is never started or touched from here.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "foundryconfig.json"), "utf8"));
const dataPath = config.dataPath[0];
const nested = path.join(config.installPath, "resources", "app", "main.js");
const main = fs.existsSync(nested) ? nested : path.join(config.installPath, "main.js");

const options = JSON.parse(fs.readFileSync(path.join(dataPath, "Config", "options.json"), "utf8"));
if (options.port === 30000) throw new Error(`${dataPath} is configured for port 30000 -- that is prod.`);
if (fs.existsSync(path.join(dataPath, "Data", "worlds", "better-than-any-man"))) {
  throw new Error(`${dataPath} holds the live world; refusing to run it as dev.`);
}

console.log(`Dev Foundry: ${dataPath} on port ${options.port}`);
spawn(process.execPath, [main, `--dataPath=${dataPath}`], { stdio: "inherit" }).on("exit", (code) =>
  process.exit(code ?? 0),
);

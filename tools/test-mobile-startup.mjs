// Run with node tools/test-mobile-startup.mjs. Exercise the real registration
// function before Foundry has constructed its notification application.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/module/mobile/mobile-mode.ts", import.meta.url), "utf8").replace(
  /^import .*;\n/gm,
  "",
);
const callbacks = {};
const context = {
  exports: {},
  ui: {},
  VogelfreiMobileCharacterSheet: class {},
  registerMobileRollResults() {},
  Hooks: {
    once(name, callback) {
      callbacks[name] = callback;
    },
  },
  game: {
    system: { id: "vogelfrei" },
    settings: {
      get() {
        return false;
      },
    },
  },
};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
assert.doesNotThrow(() => context.exports.default());
assert.equal(typeof callbacks.ready, "function");
const originalError = () => ({});
context.ui.notifications = { error: originalError, remove() {} };
assert.doesNotThrow(() => callbacks.ready());
assert.notEqual(context.ui.notifications.error, originalError);
console.log("PASS: mobile startup waits for notifications to exist");

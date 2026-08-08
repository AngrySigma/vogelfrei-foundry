import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";

// `packs` is deliberately absent: src/packs holds reviewable YAML sources, and
// dist/packs holds the LevelDB directories built from them by
// tools/build-packs/compile.mjs. Copying the sources across would ship both.
const staticFileFolders = ["lang", "templates"];

export default {
  input: "src/vogelfrei.js",
  output: {
    file: "dist/vogelfrei.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      compilerOptions: {
        outDir: "dist",
      },
    }),
    copy({
      targets: staticFileFolders.map((folderName) => ({
        src: `src/${folderName}`,
        dest: "dist",
      })),
    }),
  ],
};

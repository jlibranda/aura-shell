const esbuild = require("esbuild");
const Module = require("node:module");
const path = require("node:path");

async function run() {
  const root = process.cwd();
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["scripts/seed-development.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    external: ["@prisma/client"],
    tsconfig: "tsconfig.json",
  });
  const generated = new Module(path.join(root, "scripts", "seed-development.generated.cjs"));
  generated.filename = path.join(root, "scripts", "seed-development.generated.cjs");
  generated.paths = Module._nodeModulePaths(root);
  generated._compile(result.outputFiles[0].text, generated.filename);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Development People seed runner failed.");
  process.exitCode = 1;
});

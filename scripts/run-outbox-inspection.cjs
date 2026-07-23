const esbuild = require("esbuild");
const Module = require("node:module");
const path = require("node:path");
async function run() {
  const root = process.cwd();
  const result = await esbuild.build({ absWorkingDir: root, entryPoints: ["scripts/inspect-outbox.ts"], bundle: true, format: "cjs", platform: "node", write: false, external: ["@prisma/client"], tsconfig: "tsconfig.json" });
  const generated = new Module(path.join(root, "scripts", "inspect-outbox.generated.cjs"));
  generated.filename = path.join(root, "scripts", "inspect-outbox.generated.cjs");
  generated.paths = Module._nodeModulePaths(root);
  generated._compile(result.outputFiles[0].text, generated.filename);
}
run().catch(() => { console.error("Outbox inspection runner failed."); process.exitCode = 1; });

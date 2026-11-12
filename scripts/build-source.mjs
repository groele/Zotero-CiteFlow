import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const baseline = JSON.parse(await fs.readFile(path.join(root, "scripts/architecture-baseline.json"), "utf8"));
const buildDefines = {
  __buildVersion__: JSON.stringify(pkg.version),
  __buildDate__: JSON.stringify(process.env.CITEFLOW_BUILD_DATE || baseline.capturedAt || new Date().toISOString().slice(0, 10)),
};
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/index.ts"],
  outfile: "chrome/content/scripts/index.js",
  bundle: true,
  format: "iife",
  target: ["firefox140"],
  charset: "utf8",
  treeShaking: true,
  minify: false,
  legalComments: "inline",
  define: buildDefines,
  write: false,
  metafile: true,
});

for (const file of result.outputFiles) {
  let bundledText = Buffer.from(file.contents).toString("utf8");
  const finalBuffer = Buffer.from(bundledText, "utf8");
  const previous = await fs.readFile(file.path).catch(() => null);
  if (!previous?.equals(finalBuffer)) {
    await fs.writeFile(file.path, finalBuffer);
  }
  console.log(
    `Built ${finalBuffer.length} bytes from ${Object.keys(result.metafile.inputs).length} source modules (esbuild 0.28.2, Firefox 140+ / Gecko 153+).`
  );
}
await fs.mkdir(path.join(root, "dist"), { recursive: true });
await fs.writeFile(
  path.join(root, "dist/build-metafile.json"),
  JSON.stringify(result.metafile, null, 2)
);

await build({
  absWorkingDir: root,
  entryPoints: ["src/preferences.ts"],
  outfile: "chrome/content/preferences.js",
  bundle: true, format: "iife", target: ["firefox140"],
  charset: "utf8", treeShaking: true, minify: false,
  define: buildDefines,
});

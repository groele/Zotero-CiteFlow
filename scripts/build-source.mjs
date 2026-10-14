import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/index.mjs"],
  outfile: "chrome/content/scripts/index.js",
  bundle: true,
  format: "iife",
  target: ["firefox115"],
  charset: "utf8",
  treeShaking: true,
  minify: false,
  legalComments: "inline",
  write: false,
  metafile: true,
});
for (const file of result.outputFiles) {
  const previous = await fs.readFile(file.path).catch(() => null);
  if (!previous?.equals(Buffer.from(file.contents))) await fs.writeFile(file.path, file.contents);
}
await fs.mkdir(path.join(root, "dist"), { recursive: true });
await fs.writeFile(path.join(root, "dist/build-metafile.json"), JSON.stringify(result.metafile, null, 2));
console.log(`Built ${result.outputFiles[0].contents.length} bytes from ${Object.keys(result.metafile.inputs).length} source modules (esbuild 0.28.2, Firefox 115+).`);

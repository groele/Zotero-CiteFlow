import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CITATION_DOMAINS = [
  "CitationInitializers",
  "CitationTelemetry",
  "CitationPreferences",
  "CitationDocumentNaming",
  "CitationCollections",
  "CitationWordIntegration",
  "CitationOrderCache",
  "CitationTagGovernance",
  "CitationFormatting",
  "CitationLifecycle"
];

const VIEWS_DOMAINS = [
  "ViewsSessionIndex",
  "ViewsColumnManager",
  "ViewsWindowPrep",
  "ViewsDragCite",
  "ViewsIconPatch"
];

function inlineDomainClasses(bundleText, targetClass, domainClasses, domainListVar) {
  let text = bundleText.replace(/\r\n/g, "\n");
  const collectedBodies = [];

  for (const domainName of domainClasses) {
    const classHeader = `  var ${domainName} = class {\n`;
    const startIdx = text.indexOf(classHeader);
    if (startIdx === -1) {
      throw new Error(`Domain class ${domainName} not found in bundle`);
    }
    const bodyStart = startIdx + classHeader.length;
    const endIdx = text.indexOf("\n  };\n", bodyStart);
    if (endIdx === -1) {
      throw new Error(`Closing brace for ${domainName} not found in bundle`);
    }
    collectedBodies.push(text.slice(bodyStart, endIdx));

    // Remove preceding module comment header if immediately above this class
    let removeStart = startIdx;
    const before = text.slice(0, startIdx);
    const commentMatch = before.match(/\n  \/\/ src\/modules\/[^\n]+\n$/);
    if (commentMatch) {
      removeStart = startIdx - commentMatch[0].length + 1;
    }
    text = text.slice(0, removeStart) + text.slice(endIdx + "\n  };\n".length);
  }

  // Remove the domain list array and descriptor composition loop
  const domainArrayRegex = new RegExp(
    `  var ${domainListVar} = \\[[\\s\\S]*?\\](?:\\.filter\\(Boolean\\))?;\\n`,
    "m"
  );
  text = text.replace(domainArrayRegex, "");

  const loopRegex = new RegExp(
    `  for \\(const DomainClass of ${domainListVar}\\) \\{[\\s\\S]*?\\n  \\}\\n`,
    "m"
  );
  text = text.replace(loopRegex, "");

  // Inject collected method bodies before the end of targetClass
  const targetHeader = `  var ${targetClass} = class {\n`;
  const targetStart = text.indexOf(targetHeader);
  if (targetStart === -1) {
    throw new Error(`Target class ${targetClass} not found in bundle`);
  }
  const targetEnd = text.indexOf("\n  };\n", targetStart);
  if (targetEnd === -1) {
    throw new Error(`Closing brace for ${targetClass} not found in bundle`);
  }

  text =
    text.slice(0, targetEnd) +
    "\n" +
    collectedBodies.join("\n") +
    text.slice(targetEnd);

  return text.replace(/\n{3,}/g, "\n\n");
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/index.mjs"],
  outfile: "chrome/content/scripts/index.js",
  bundle: true,
  format: "iife",
  target: ["firefox140"],
  charset: "utf8",
  treeShaking: true,
  minify: false,
  legalComments: "inline",
  write: false,
  metafile: true,
});

for (const file of result.outputFiles) {
  let bundledText = Buffer.from(file.contents).toString("utf8");
  bundledText = inlineDomainClasses(
    bundledText,
    "Citation",
    CITATION_DOMAINS,
    "CITATION_DOMAIN_MODULES"
  );
  bundledText = inlineDomainClasses(
    bundledText,
    "Views",
    VIEWS_DOMAINS,
    "VIEWS_DOMAIN_MODULES"
  );
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

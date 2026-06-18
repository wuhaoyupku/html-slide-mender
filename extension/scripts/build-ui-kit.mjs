import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = resolve(root, "vendor");
const outfile = resolve(vendorDir, "vaadin-ui-kit.js");

await mkdir(vendorDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/content/ui-kit/vaadin-entry.js")],
  bundle: true,
  format: "iife",
  globalName: "HtmlSlideMenderVaadinBundle",
  target: ["chrome114"],
  outfile,
  legalComments: "eof",
  banner: {
    js: "/* Vaadin Web Components bundle for HTML Mender. Built from @vaadin/combo-box. */"
  }
});

await copyFile(
  resolve(root, "node_modules/@vaadin/combo-box/LICENSE"),
  resolve(vendorDir, "vaadin-LICENSE.txt")
);

const notices = await vendorNotices();
await writeFile(resolve(vendorDir, "vaadin-NOTICES.txt"), notices, "utf8");

console.log(`Built ${outfile}`);

async function vendorNotices() {
  const packageLock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  const packages = Object.entries(packageLock.packages || {})
    .filter(([path]) => path.startsWith("node_modules/"))
    .map(([path, info]) => ({
      name: path.replace(/^node_modules\//, ""),
      version: info.version || "",
      license: info.license || "SEE PACKAGE"
    }))
    .filter((pkg) => pkg.name === "@vaadin/combo-box" || packageUsedByVaadin(pkg.name));

  const lines = [
    "Vaadin UI kit vendor notices",
    "",
    "This bundle is generated from npm packages used by @vaadin/combo-box.",
    "Keep package-lock.json and this notice file in sync by running npm run build:ui-kit.",
    "",
    ...packages
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pkg) => `- ${pkg.name}@${pkg.version}: ${pkg.license}`),
    ""
  ];

  return lines.join("\n");
}

function packageUsedByVaadin(name) {
  return [
    "@open-wc/dedupe-mixin",
    "@polymer/polymer",
    "@vaadin/a11y-base",
    "@vaadin/component-base",
    "@vaadin/field-base",
    "@vaadin/input-container",
    "@vaadin/item",
    "@vaadin/lit-renderer",
    "@vaadin/overlay",
    "@vaadin/vaadin-lumo-styles",
    "@vaadin/vaadin-material-styles",
    "@vaadin/vaadin-themable-mixin",
    "lit",
    "@lit-labs/ssr-dom-shim",
    "@lit/reactive-element",
    "lit-element",
    "lit-html"
  ].includes(name);
}

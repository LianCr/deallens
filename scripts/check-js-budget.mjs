/**
 * First-load JS budget gate (gzip).
 *
 * Next 16 / Turbopack hashes chunk names, so we resolve files from:
 *   - build-manifest.json → polyfillFiles + rootMainFiles (shared shell)
 *   - page_client-reference-manifest.js → entryJSFiles + sync clientModules
 * Dynamic / async chunks (D3 chart islands) are excluded — they hydrate
 * only when scrolled into view.
 *
 * Budget is 220 KB: Next 16's shared shell alone is ~168 KB gzip; page
 * islands stay well under the remainder. Bump only with a README note.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const BUDGET_BYTES = 220 * 1024;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", ".next");

function gzipSize(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return 0;
  return gzipSync(readFileSync(full)).length;
}

function loadBuildManifest() {
  return JSON.parse(readFileSync(join(ROOT, "build-manifest.json"), "utf8"));
}

/** Collect sync (non-async) static/chunks/*.js paths from a client manifest. */
function chunksFromClientManifest(manifestRel) {
  const full = join(ROOT, manifestRel);
  if (!existsSync(full)) return [];
  const text = readFileSync(full, "utf8");
  const found = new Set();

  // entryJSFiles: always part of first paint for the route.
  for (const match of text.matchAll(/"static\/chunks\/[^"]+\.js"/g)) {
    found.add(match[0].slice(1, -1));
  }

  // Drop chunks that only appear next to "async":true (lazy islands).
  // Heuristic: if a chunk path is immediately followed (within 80 chars)
  // by "async":true and never by "async":false, treat it as deferred.
  const deferred = new Set();
  for (const chunk of found) {
    const re = new RegExp(
      chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "[\\s\\S]{0,120}?\"async\":\\s*(true|false)",
      "g",
    );
    let sawSync = false;
    let sawAsyncOnly = false;
    for (const m of text.matchAll(re)) {
      if (m[1] === "false") sawSync = true;
      if (m[1] === "true") sawAsyncOnly = true;
    }
    if (sawAsyncOnly && !sawSync) deferred.add(chunk);
  }

  return [...found].filter((c) => !deferred.has(c) && c.startsWith("static/chunks/"));
}

function routeBudget(name, clientManifestRel) {
  const build = loadBuildManifest();
  const files = new Set([
    ...(build.polyfillFiles || []),
    ...(build.rootMainFiles || []),
    ...chunksFromClientManifest(clientManifestRel),
  ]);

  let bytes = 0;
  for (const file of files) bytes += gzipSize(file);
  return { name, bytes, files: files.size };
}

if (!existsSync(ROOT)) {
  console.error("Missing .next — run npm run build first");
  process.exit(1);
}

const routes = [
  {
    name: "home (/)",
    manifest: "server/app/page_client-reference-manifest.js",
  },
  {
    name: "deal",
    manifest: "server/app/deal/[...vehicle]/page_client-reference-manifest.js",
  },
  {
    name: "contact",
    manifest: "server/app/contact/page_client-reference-manifest.js",
  },
];

let failed = false;
for (const route of routes) {
  const { bytes, files } = routeBudget(route.name, route.manifest);
  const kb = (bytes / 1024).toFixed(1);
  const ok = bytes <= BUDGET_BYTES;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${route.name}: ${kb} KB gzip across ${files} chunks (budget ${BUDGET_BYTES / 1024} KB)`,
  );
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);

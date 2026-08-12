#!/usr/bin/env node
/**
 * Cache the source-verified MGQ standing sprites used by the art pipeline.
 *
 * These files are research inputs only. `scripts/anime-art/refs/` is ignored
 * and nothing downloaded by this script is copied into the shipping bundle.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(ROOT, "scripts", "anime-art", "mgq-reference-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function cachePath(relativePath) {
  const resolved = path.resolve(path.dirname(manifestPath), relativePath);
  const allowedRoot = path.resolve(path.dirname(manifestPath), "refs", "mgq") + path.sep;
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error(`Reference cache path escapes refs/mgq: ${relativePath}`);
  }
  return resolved;
}

const images = manifest.references.flatMap((reference) =>
  reference.images.map((image) => ({ id: reference.id, ...image }))
);

for (const image of images) {
  const destination = cachePath(image.cache);
  await mkdir(path.dirname(destination), { recursive: true });

  let existing = false;
  try {
    const bytes = await readFile(destination);
    existing = bytes.length > pngSignature.length && bytes.subarray(0, pngSignature.length).equals(pngSignature);
  } catch {
    // Missing is the normal first-run state.
  }
  if (existing) {
    process.stdout.write(`cached  ${path.relative(ROOT, destination)}\n`);
    continue;
  }

  const response = await fetch(image.url, {
    headers: { "user-agent": "Heroes3BoardGame-MGQ-reference-cache/1.0" }
  });
  if (!response.ok) {
    throw new Error(`${image.id}: ${response.status} ${response.statusText} fetching ${image.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${image.id}: source did not return a PNG (${image.url})`);
  }
  await writeFile(destination, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  process.stdout.write(`fetched ${path.relative(ROOT, destination)} ${bytes.length} bytes sha256:${sha256}\n`);
}

process.stdout.write(`Verified ${images.length} canonical PNG references for ${manifest.references.length} subjects.\n`);

/** Node module-resolution hook so plain `node` can import the TypeScript engine
 * (`@/` alias, extensionless relative imports, JSON modules). Type stripping is
 * native on Node ≥ 23.6. Registered by scripts that drive the engine offline. */
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function existingFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) target = resolvePath(SRC, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    target = fileURLToPath(new URL(specifier, context.parentURL));
  }
  if (target) {
    const file = existingFile(target);
    if (file) {
      return {
        url: pathToFileURL(file).href,
        shortCircuit: true,
        ...(file.endsWith(".json") ? { importAttributes: { type: "json" } } : {}),
      };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".json") && !context.importAttributes?.type) {
    return next(url, { ...context, importAttributes: { type: "json" } });
  }
  return next(url, context);
}

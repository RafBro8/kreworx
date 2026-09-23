import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TypeScript compiles TypeScript. The demo's photographs sit beside the module
 * that reads them, so they have to be carried into the build by hand, or the
 * server starts fine and then fails the first time it seeds.
 */
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "src", "demo", "photos");
const to = join(here, "..", "dist", "demo", "photos");

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log(`Copied demo photos to ${to}`);

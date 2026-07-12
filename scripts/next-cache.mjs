import fs from "node:fs/promises";
import path from "node:path";

export async function cleanNextCache(rootDir) {
  await fs.rm(path.join(rootDir, ".next"), { recursive: true, force: true });
}

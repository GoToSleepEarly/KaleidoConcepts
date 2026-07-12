import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { cleanNextCache } from "./next-cache.mjs";

describe("cleanNextCache", () => {
  test("removes stale Next build artifacts before preview startup", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "pbl-next-cache-"));
    const staleManifest = path.join(rootDir, ".next", "server", "app", "page_client-reference-manifest.js");

    await fs.mkdir(path.dirname(staleManifest), { recursive: true });
    await fs.writeFile(staleManifest, "stale manifest");

    await cleanNextCache(rootDir);

    await expect(fs.stat(path.join(rootDir, ".next"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

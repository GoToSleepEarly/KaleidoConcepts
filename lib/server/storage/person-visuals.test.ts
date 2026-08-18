import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";

import { persistPersonVisual, readPersonVisualAsDataUrl, removeStoredPersonVisual } from "./person-visuals";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.STORAGE_DIR;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("人物图片存储键", () => {
  test("数据库只保存相对存储键，读取和删除统一基于当前 STORAGE_DIR", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pbl-person-visual-"));
    roots.push(root);
    process.env.STORAGE_DIR = root;
    const source = await sharp({ create: { width: 200, height: 300, channels: 3, background: "#bfdbfe" } }).png().toBuffer();

    const stored = await persistPersonVisual({
      sourceUrl: `data:image/png;base64,${source.toString("base64")}`,
      personId: "person-1",
      assetId: "asset-1",
    });

    expect(stored.storagePath).toBe("person-visuals/person-1/asset-1.webp");
    expect(await readPersonVisualAsDataUrl(stored.storagePath)).toMatch(/^data:image\/webp;base64,/);
    const absolutePath = path.join(root, stored.storagePath);
    await expect(access(absolutePath)).resolves.toBeUndefined();
    await removeStoredPersonVisual(stored.storagePath);
    await expect(access(absolutePath)).rejects.toThrow();
  });
});

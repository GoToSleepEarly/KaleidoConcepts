import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import presetData from "../prisma/preset-data.json" with { type: "json" };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("部署预置数据", () => {
  test("只包含非课程业务数据且不携带账号密码", () => {
    expect(Object.keys(presetData).sort()).toEqual(["people", "presetOptions", "users", "visualAssets"]);
    expect(presetData.users).toHaveLength(1);
    expect(presetData.users.every((user) => !("password" in user))).toBe(true);
    expect(presetData.people).toHaveLength(6);
    expect(presetData.visualAssets).toHaveLength(6);
    expect(presetData.presetOptions).toHaveLength(123);
  });

  test("人物当前形象和图片文件形成完整闭环", async () => {
    const visualIds = new Set(presetData.visualAssets.map((asset) => asset.id));
    expect(visualIds.has("cmsgbtyjj0000a4vostsingbr")).toBe(false);
    for (const person of presetData.people) {
      if (person.activeVisualAssetId) expect(visualIds.has(person.activeVisualAssetId)).toBe(true);
    }
    for (const asset of presetData.visualAssets) {
      if (asset.parentAssetId) expect(visualIds.has(asset.parentAssetId)).toBe(true);
      await expect(access(path.join(projectRoot, "prisma", "seed-assets", asset.storagePath))).resolves.toBeUndefined();
    }
  });
});

import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { resolveStorageKey } from "./storage-path";

const originalStorageDir = process.env.STORAGE_DIR;

afterEach(() => {
  if (originalStorageDir === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = originalStorageDir;
});

describe("storage path", () => {
  test("拒绝绝对路径，数据库存储键必须先迁移为相对路径", () => {
    const root = path.resolve(".local/storage-app");
    process.env.STORAGE_DIR = root;
    const legacyPath = path.join(root, "person-visuals", "person-1", "asset-1.webp");

    expect(() => resolveStorageKey(legacyPath)).toThrow("存储键必须是相对路径");
  });

  test("拒绝超出当前存储目录的相对路径", () => {
    process.env.STORAGE_DIR = path.resolve(".local/storage-app");

    expect(() => resolveStorageKey("../outside/asset.webp")).toThrow("存储键超出存储目录");
  });
});

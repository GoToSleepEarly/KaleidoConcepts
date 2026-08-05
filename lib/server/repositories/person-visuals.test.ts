import { describe, expect, test, vi } from "vitest";

import {
  compilePersonVisualPrompt,
  createDescriptionVisual,
  retryPersonVisual,
  selectPersonVisual,
  type PersonVisualsDb,
  type PersonVisualGenerationDeps,
} from "./person-visuals";

function pendingAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    personId: "person-1",
    parentAssetId: null,
    sourceMode: "description" as const,
    appearanceConfig: { hairstyle: "短发", outfitStyle: "校园休闲" },
    userInstruction: "蓝色外套",
    compiledPrompt: "prompt",
    sourceHash: "hash",
    idempotencyKey: "visual-key",
    status: "pending" as const,
    provider: "quickrouter_gpt_image_2" as const,
    providerImageUrl: null,
    storagePath: null,
    publicUrl: null,
    temporarySourcePath: null,
    failureReason: null,
    createdAt: new Date("2026-08-05T08:00:00.000Z"),
    updatedAt: new Date("2026-08-05T08:00:00.000Z"),
    ...overrides,
  };
}

describe("person visual generation", () => {
  test("compiles a portrait full-body reference instead of a square bust", () => {
    const prompt = compilePersonVisualPrompt(
      { id: "person-1", age: 9, gender: "female", archivedAt: null },
      { hairstyle: "双辫", temperament: "活泼", signatureFeature: "雀斑" },
      "穿适合课堂绘本的服装",
    );

    expect(prompt).toContain("全身");
    expect(prompt).toContain("从头到脚");
    expect(prompt).not.toContain("半身");
    expect(prompt).toContain("气质：活泼");
    expect(prompt).toContain("标志性特征：雀斑");
  });

  test("creates one idempotent paid generation and does not auto-select it", async () => {
    const updates: Array<Record<string, unknown>> = [];
    let personUpdated = false;
    const asset = pendingAsset();
    const db = {
      person: {
        findUnique: async () => ({
          id: "person-1",
          chineseName: "夏天",
          englishName: "Summer",
          age: 9,
          gender: "female",
          archivedAt: null,
        }),
        update: async () => {
          personUpdated = true;
          return {};
        },
      },
      personVisualAsset: {
        findUnique: async () => null,
        create: async () => asset,
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...asset, ...data };
        },
      },
    } as unknown as PersonVisualsDb;
    const deps: PersonVisualGenerationDeps = {
      generate: vi.fn(async () => ({
        imageUrl: "https://example.com/generated.png",
      })),
      edit: vi.fn(),
      persist: vi.fn(async () => ({
        storagePath: "/data/asset.webp",
        publicUrl: "/api/person-visuals/person-1/asset-1.webp",
      })),
      readAsDataUrl: vi.fn(),
      removeTemporarySource: vi.fn(),
    };

    const result = await createDescriptionVisual(
      db,
      "person-1",
      {
        appearanceConfig: { hairstyle: "短发", outfitStyle: "校园休闲" },
        customPrompt: "蓝色外套",
      },
      "visual-key",
      deps,
    );

    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toMatchObject({
      status: "succeeded",
      storagePath: "/data/asset.webp",
    });
    expect(personUpdated).toBe(false);
    expect(result.status).toBe("succeeded");
  });

  test("returns an existing generation for the same idempotency key", async () => {
    const existing = pendingAsset({ status: "succeeded" });
    let createCalled = false;
    const result = await createDescriptionVisual(
      {
        person: {
          findUnique: async () => ({ id: "person-1", archivedAt: null }),
        },
        personVisualAsset: {
          findUnique: async () => existing,
          create: async () => {
            createCalled = true;
            return existing;
          },
        },
      } as unknown as PersonVisualsDb,
      "person-1",
      { appearanceConfig: {}, customPrompt: "" },
      "visual-key",
      {} as PersonVisualGenerationDeps,
    );

    expect(createCalled).toBe(false);
    expect(result.id).toBe("asset-1");
  });

  test("discards a failed generation instead of keeping it in history", async () => {
    const asset = pendingAsset();
    const removeAsset = vi.fn(async () => asset);
    const db = {
      person: {
        findUnique: async () => ({
          id: "person-1",
          age: 9,
          gender: "female",
          archivedAt: null,
        }),
      },
      personVisualAsset: {
        findUnique: async () => null,
        create: async () => asset,
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...asset,
          ...data,
        }),
        delete: removeAsset,
      },
    } as unknown as PersonVisualsDb;
    const failure = new Error("provider rejected request");
    const deps: PersonVisualGenerationDeps = {
      generate: vi.fn(async () => {
        throw failure;
      }),
      edit: vi.fn(),
      persist: vi.fn(),
      readAsDataUrl: vi.fn(),
      removeTemporarySource: vi.fn(),
    };

    await expect(
      createDescriptionVisual(
        db,
        "person-1",
        { appearanceConfig: {}, customPrompt: "" },
        "failed-key",
        deps,
      ),
    ).rejects.toThrow("provider rejected request");
    expect(removeAsset).toHaveBeenCalledWith({ where: { id: "asset-1" } });
  });

  test("recovers a generated remote image without paying again", async () => {
    const asset = pendingAsset({
      status: "failed",
      providerImageUrl: "https://example.com/remote.png",
      failureReason: "下载失败",
    });
    const submit = vi.fn();
    const db = {
      personVisualAsset: {
        findUnique: async () => asset,
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...asset,
          ...data,
        }),
      },
    } as unknown as PersonVisualsDb;
    const deps: PersonVisualGenerationDeps = {
      generate: submit,
      edit: submit,
      persist: vi.fn(async () => ({
        storagePath: "/data/recovered.webp",
        publicUrl: "/api/person-visuals/person-1/asset-1.webp",
      })),
      readAsDataUrl: vi.fn(),
      removeTemporarySource: vi.fn(),
    };

    const result = await retryPersonVisual(db, "person-1", "asset-1", deps);

    expect(submit).not.toHaveBeenCalled();
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: "https://example.com/remote.png" }),
    );
    expect(result.status).toBe("succeeded");
  });

  test("only selects a succeeded asset that belongs to the person", async () => {
    let selected: string | null = null;
    await selectPersonVisual(
      {
        personVisualAsset: {
          findUnique: async () =>
            pendingAsset({
              status: "succeeded",
              publicUrl: "/api/person-visuals/person-1/asset-1.webp",
            }),
        },
        person: {
          update: async ({
            data,
          }: {
            data: { activeVisualAssetId: string };
          }) => {
            selected = data.activeVisualAssetId;
            return {};
          },
        },
      } as unknown as PersonVisualsDb,
      "person-1",
      "asset-1",
    );

    expect(selected).toBe("asset-1");
  });
});

import { describe, expect, test } from "vitest";

import { archivePreset, createPreset, listPresets, PresetConflictError, PresetNotFoundError, updatePreset } from "./presets";

describe("presets repository", () => {
  test("lists active presets filtered by kind and ordered", async () => {
    const presets = await listPresets(
      {
        presetOption: {
          findMany: async (query) => {
            expect(query).toEqual({
              where: { archivedAt: null, kind: "grammar" },
              orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
            });

            return [
              {
                id: "preset-1",
                kind: "grammar",
                label: "Past Simple",
                category: "时态",
                sortOrder: 0,
                archivedAt: null,
                createdAt: new Date("2026-07-01T09:00:00.000Z"),
                updatedAt: new Date("2026-07-02T09:00:00.000Z"),
              },
            ];
          },
          findFirst: async () => null,
          create: async ({ data }) => ({ id: "x", ...data, category: data.category, archivedAt: null, createdAt: new Date(), updatedAt: new Date() }),
          update: async ({ data }) => ({ id: "x", kind: "grammar", label: "", category: null, sortOrder: 0, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }) as never,
          findUnique: async () => null,
        },
      },
      { kind: "grammar" },
    );

    expect(presets).toEqual([
      {
        id: "preset-1",
        kind: "grammar",
        label: "Past Simple",
        category: "时态",
        sortOrder: 0,
        createdAt: "2026-07-01T09:00:00.000Z",
        updatedAt: "2026-07-02T09:00:00.000Z",
      },
    ]);
  });

  test("creates a preset trimming label and category", async () => {
    const preset = await createPreset(
      {
        presetOption: {
          findMany: async () => [],
          findFirst: async (query) => {
            expect(query.where).toEqual({ kind: "theme", label: "海底世界", archivedAt: null });
            return null;
          },
          create: async ({ data }) => {
            expect(data).toEqual({ kind: "theme", label: "海底世界", category: null, sortOrder: 0 });
            return {
              id: "preset-2",
              ...data,
              archivedAt: null,
              createdAt: new Date("2026-07-01T10:00:00.000Z"),
              updatedAt: new Date("2026-07-01T10:00:00.000Z"),
            };
          },
          update: async () => ({}) as never,
          findUnique: async () => null,
        },
      },
      { kind: "theme", label: "  海底世界  ", category: "  " },
    );

    expect(preset.label).toBe("海底世界");
    expect(preset.category).toBeUndefined();
  });

  test("rejects creating a duplicate preset", async () => {
    await expect(
      createPreset(
        {
          presetOption: {
            findMany: async () => [],
            findFirst: async () => ({
              id: "existing",
              kind: "theme",
              label: "海底世界",
              category: null,
              sortOrder: 0,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            create: async () => ({}) as never,
            update: async () => ({}) as never,
            findUnique: async () => null,
          },
        },
        { kind: "theme", label: "海底世界" },
      ),
    ).rejects.toBeInstanceOf(PresetConflictError);
  });

  test("updates a preset keeping its kind", async () => {
    const updated = await updatePreset(
      {
        presetOption: {
          findMany: async () => [],
          findFirst: async (query) => {
            expect(query.where).toEqual({ kind: "grammar", label: "Future Simple", archivedAt: null, id: { not: "preset-3" } });
            return null;
          },
          create: async () => ({}) as never,
          update: async ({ where, data }) => {
            expect(where).toEqual({ id: "preset-3" });
            expect(data).toEqual({ label: "Future Simple", category: "时态" });
            return {
              id: "preset-3",
              kind: "grammar",
              label: "Future Simple",
              category: "时态",
              sortOrder: 0,
              archivedAt: null,
              createdAt: new Date("2026-07-01T09:00:00.000Z"),
              updatedAt: new Date("2026-07-03T09:00:00.000Z"),
            };
          },
          findUnique: async ({ where }) => {
            expect(where).toEqual({ id: "preset-3" });
            return {
              id: "preset-3",
              kind: "grammar",
              label: "Future",
              category: "时态",
              sortOrder: 0,
              archivedAt: null,
              createdAt: new Date("2026-07-01T09:00:00.000Z"),
              updatedAt: new Date("2026-07-02T09:00:00.000Z"),
            };
          },
        },
      },
      "preset-3",
      { kind: "grammar", label: "Future Simple", category: "时态" },
    );

    expect(updated.label).toBe("Future Simple");
    expect(updated.updatedAt).toBe("2026-07-03T09:00:00.000Z");
  });

  test("rejects updating a missing preset", async () => {
    await expect(
      updatePreset(
        {
          presetOption: {
            findMany: async () => [],
            findFirst: async () => null,
            create: async () => ({}) as never,
            update: async () => ({}) as never,
            findUnique: async () => null,
          },
        },
        "missing",
        { kind: "theme", label: "x" },
      ),
    ).rejects.toBeInstanceOf(PresetNotFoundError);
  });

  test("archives a preset by writing archivedAt", async () => {
    let archivedWith: unknown = null;

    await archivePreset(
      {
        presetOption: {
          findMany: async () => [],
          findFirst: async () => null,
          create: async () => ({}) as never,
          update: async ({ where, data }) => {
            archivedWith = { where, data };
            return {
              id: "preset-4",
              kind: "theme",
              label: "海底世界",
              category: null,
              sortOrder: 0,
              archivedAt: data.archivedAt ?? new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
          findUnique: async () => ({
            id: "preset-4",
            kind: "theme",
            label: "海底世界",
            category: null,
            sortOrder: 0,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      },
      "preset-4",
    );

    expect(archivedWith).toMatchObject({ where: { id: "preset-4" } });
    expect((archivedWith as { data: { archivedAt: Date } }).data.archivedAt).toBeInstanceOf(Date);
  });
});

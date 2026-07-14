import type { PresetKind, PresetOption, PresetOptionInput } from "@/lib/contracts/api";

type DbPresetOption = {
  id: string;
  kind: PresetKind;
  label: string;
  category: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PresetWriteData = {
  kind: PresetKind;
  label: string;
  category: string | null;
  sortOrder: number;
};

type PresetFindManyQuery = {
  where: { archivedAt: null; kind?: PresetKind };
  orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }];
};

type PresetDelegate = {
  findMany: (query: PresetFindManyQuery) => Promise<DbPresetOption[]>;
  findFirst: (query: {
    where: { kind: PresetKind; label: string; archivedAt: null; id?: { not: string } };
  }) => Promise<DbPresetOption | null>;
  create: (query: { data: PresetWriteData }) => Promise<DbPresetOption>;
  update: (query: { where: { id: string }; data: Partial<PresetWriteData> & { archivedAt?: Date | null } }) => Promise<DbPresetOption>;
  findUnique: (query: { where: { id: string } }) => Promise<DbPresetOption | null>;
};

export type PresetsDb = {
  presetOption: PresetDelegate;
};

export class PresetConflictError extends Error {
  constructor(message = "该预设已存在") {
    super(message);
    this.name = "PresetConflictError";
  }
}

export class PresetNotFoundError extends Error {
  constructor(message = "预设不存在") {
    super(message);
    this.name = "PresetNotFoundError";
  }
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toPresetOption(preset: DbPresetOption): PresetOption {
  return {
    id: preset.id,
    kind: preset.kind,
    label: preset.label,
    category: preset.category ?? undefined,
    sortOrder: preset.sortOrder,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
  };
}

export async function listPresets(db: PresetsDb, options: { kind?: PresetKind } = {}) {
  const presets = await db.presetOption.findMany({
    where: {
      archivedAt: null,
      ...(options.kind ? { kind: options.kind } : {}),
    },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });

  return presets.map(toPresetOption);
}

export async function createPreset(db: PresetsDb, input: PresetOptionInput) {
  const label = input.label.trim();

  const existing = await db.presetOption.findFirst({
    where: { kind: input.kind, label, archivedAt: null },
  });

  if (existing) {
    throw new PresetConflictError();
  }

  const preset = await db.presetOption.create({
    data: {
      kind: input.kind,
      label,
      category: normalizeOptionalText(input.category),
      sortOrder: 0,
    },
  });

  return toPresetOption(preset);
}

export async function updatePreset(db: PresetsDb, id: string, input: PresetOptionInput) {
  const current = await db.presetOption.findUnique({ where: { id } });

  if (!current || current.archivedAt) {
    throw new PresetNotFoundError();
  }

  const label = input.label.trim();

  const duplicate = await db.presetOption.findFirst({
    where: { kind: current.kind, label, archivedAt: null, id: { not: id } },
  });

  if (duplicate) {
    throw new PresetConflictError();
  }

  const preset = await db.presetOption.update({
    where: { id },
    data: {
      label,
      category: normalizeOptionalText(input.category),
    },
  });

  return toPresetOption(preset);
}

export async function archivePreset(db: PresetsDb, id: string) {
  const current = await db.presetOption.findUnique({ where: { id } });

  if (!current || current.archivedAt) {
    throw new PresetNotFoundError();
  }

  await db.presetOption.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

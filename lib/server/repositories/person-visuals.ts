import { createHash } from "node:crypto";

import type {
  AppearanceConfig,
  Gender,
  PersonVisualAsset,
  PersonVisualProvider,
  PersonVisualSourceMode,
  PersonVisualStatus,
} from "@/lib/contracts/api";

type DbPersonForVisual = {
  id: string;
  chineseName?: string;
  englishName?: string;
  age?: number;
  gender?: Gender;
  archivedAt: Date | null;
};

type DbVisualAsset = {
  id: string;
  personId: string;
  parentAssetId: string | null;
  sourceMode: PersonVisualSourceMode;
  appearanceConfig: AppearanceConfig | null;
  userInstruction: string | null;
  compiledPrompt: string;
  sourceHash: string;
  idempotencyKey: string;
  status: PersonVisualStatus;
  provider: PersonVisualProvider;
  providerImageUrl: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  temporarySourcePath: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  parentAsset?: DbVisualAsset | null;
  _count?: { childAssets: number; selectedBy: number; courseSnapshots: number };
};

type PersonVisualAssetDelegate = {
  findUnique: (query: {
    where: Record<string, unknown>;
    include?: unknown;
  }) => Promise<DbVisualAsset | null>;
  findMany: (query: {
    where: Record<string, unknown>;
    orderBy: { createdAt: "desc" };
  }) => Promise<DbVisualAsset[]>;
  create: (query: { data: Record<string, unknown> }) => Promise<DbVisualAsset>;
  updateMany: (query: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
  update: (query: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<DbVisualAsset>;
  delete: (query: { where: { id: string } }) => Promise<DbVisualAsset>;
};

export type PersonVisualsDb = {
  person: {
    findUnique: (query: {
      where: { id: string };
    }) => Promise<DbPersonForVisual | null>;
    update: (query: {
      where: { id: string };
      data: { activeVisualAssetId: string };
    }) => Promise<unknown>;
  };
  personVisualAsset: PersonVisualAssetDelegate;
};

export type PersonVisualGenerationDeps = {
  provider?: "quickrouter_gpt_image_2" | "crazyrouter_gpt_image_2";
  generate: (input: { prompt: string }) => Promise<{ imageUrl: string }>;
  edit: (input: {
    prompt: string;
    imageDataUrl: string;
  }) => Promise<{ imageUrl: string }>;
  persist: (input: {
    sourceUrl: string;
    personId: string;
    assetId: string;
  }) => Promise<{ storagePath: string; publicUrl: string }>;
  readAsDataUrl: (storagePath: string) => Promise<string>;
  removeTemporarySource: (storagePath: string) => Promise<void>;
};

export class PersonVisualNotFoundError extends Error {
  constructor(message = "人物形象不存在") {
    super(message);
    this.name = "PersonVisualNotFoundError";
  }
}

export class PersonVisualInvalidStateError extends Error {
  constructor(message = "当前形象状态不能执行该操作") {
    super(message);
    this.name = "PersonVisualInvalidStateError";
  }
}

function toAsset(asset: DbVisualAsset): PersonVisualAsset {
  return {
    id: asset.id,
    personId: asset.personId,
    parentAssetId: asset.parentAssetId,
    sourceMode: asset.sourceMode,
    appearanceConfig: asset.appearanceConfig,
    userInstruction: asset.userInstruction,
    status: asset.status,
    publicUrl: asset.publicUrl,
    failureReason: asset.failureReason,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function text(value: string | undefined) {
  return value?.trim() || "";
}

export function compilePersonVisualPrompt(
  person: DbPersonForVisual,
  config: AppearanceConfig,
  customPrompt: string,
) {
  const details = [
    config.hairstyle && `发型轮廓：${config.hairstyle}`,
    config.hairColor && `发色：${config.hairColor}`,
    config.faceShape && `脸型：${config.faceShape}`,
    config.bodyShape && `身形轮廓：${config.bodyShape}`,
    config.glasses && `眼镜：${config.glasses}`,
    config.temperament && `气质：${config.temperament}`,
    config.outfitStyle && `服装风格：${config.outfitStyle}`,
    config.outfitColor && `服装主色：${config.outfitColor}`,
    config.signatureFeature && `标志性特征：${config.signatureFeature}`,
    text(customPrompt) && `额外要求：${text(customPrompt)}`,
  ].filter(Boolean);
  return [
    `为${person.age}岁${person.gender === "male" ? "男性" : "女性"}人物创作稳定的二维绘本人物设定图。`,
    "竖版单人全身构图，从头到脚完整可见，手脚无遮挡，自然站立，人物居中。",
    "干净浅色背景，轮廓清晰，无文字、无水印，不添加其他人物或道具遮挡。",
    "保持适合课堂绘本的精致二维动画风格，避免照片写实感。",
    ...details,
  ].join("\n");
}

function sourceHash(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function getPerson(db: PersonVisualsDb, personId: string) {
  const person = await db.person.findUnique({ where: { id: personId } });
  if (!person || person.archivedAt)
    throw new PersonVisualNotFoundError("人物不存在或已停用");
  return person;
}

function recoverableUrl(url: string | null) {
  return url && !url.startsWith("data:") ? url : null;
}

async function finishGeneration(
  db: PersonVisualsDb,
  asset: DbVisualAsset,
  deps: PersonVisualGenerationDeps,
  options: { sourceDataUrl?: string } = {},
) {
  const claimed = await db.personVisualAsset.updateMany({
    where: { id: asset.id, status: asset.status },
    data: { status: "submitting", failureReason: null },
  });
  if (claimed.count === 0) {
    const current = await db.personVisualAsset.findUnique({
      where: { id: asset.id },
    });
    return toAsset(current ?? asset);
  }

  let remoteUrl = recoverableUrl(asset.providerImageUrl);
  try {
    let sourceUrl = remoteUrl;
    if (!sourceUrl) {
      if (asset.sourceMode === "description") {
        sourceUrl = (await deps.generate({ prompt: asset.compiledPrompt }))
          .imageUrl;
      } else {
        let imageDataUrl = options.sourceDataUrl;
        if (!imageDataUrl) {
          const path =
            asset.sourceMode === "photo"
              ? asset.temporarySourcePath
              : asset.parentAsset?.storagePath;
          if (!path)
            throw new PersonVisualInvalidStateError("缺少可用于编辑的来源图片");
          imageDataUrl = await deps.readAsDataUrl(path);
        }
        sourceUrl = (
          await deps.edit({ prompt: asset.compiledPrompt, imageDataUrl })
        ).imageUrl;
      }
      remoteUrl = recoverableUrl(sourceUrl);
    }

    const stored = await deps.persist({
      sourceUrl,
      personId: asset.personId,
      assetId: asset.id,
    });
    const updated = await db.personVisualAsset.update({
      where: { id: asset.id },
      data: {
        status: "succeeded",
        providerImageUrl: remoteUrl,
        storagePath: stored.storagePath,
        publicUrl: stored.publicUrl,
        failureReason: null,
        temporarySourcePath: null,
      },
    });
    if (asset.sourceMode === "photo" && asset.temporarySourcePath) {
      await deps.removeTemporarySource(asset.temporarySourcePath);
    }
    return toAsset(updated);
  } catch (error) {
    if (asset.sourceMode === "photo" && asset.temporarySourcePath) {
      await deps
        .removeTemporarySource(asset.temporarySourcePath)
        .catch(() => undefined);
    }
    await db.personVisualAsset.delete({ where: { id: asset.id } });
    throw error instanceof Error ? error : new Error("图片生成失败");
  }
}

async function existingByKey(
  db: PersonVisualsDb,
  personId: string,
  idempotencyKey: string,
) {
  return db.personVisualAsset.findUnique({
    where: { personId_idempotencyKey: { personId, idempotencyKey } },
  });
}

export async function createDescriptionVisual(
  db: PersonVisualsDb,
  personId: string,
  input: { appearanceConfig: AppearanceConfig; customPrompt: string },
  idempotencyKey: string,
  deps: PersonVisualGenerationDeps,
) {
  const existing = await existingByKey(db, personId, idempotencyKey);
  if (existing) return toAsset(existing);
  const person = await getPerson(db, personId);
  const prompt = compilePersonVisualPrompt(
    person,
    input.appearanceConfig,
    input.customPrompt,
  );
  const asset = await db.personVisualAsset.create({
    data: {
      personId,
      parentAssetId: null,
      sourceMode: "description",
      appearanceConfig: input.appearanceConfig,
      userInstruction: text(input.customPrompt) || null,
      compiledPrompt: prompt,
      sourceHash: sourceHash([
        person.age,
        person.gender,
        input.appearanceConfig,
        text(input.customPrompt),
      ]),
      idempotencyKey,
      status: "pending",
      provider: deps.provider ?? "quickrouter_gpt_image_2",
    },
  });
  return finishGeneration(db, asset, deps);
}

export async function createPhotoVisual(
  db: PersonVisualsDb,
  personId: string,
  input: {
    temporarySourcePath: string;
    sourceDataUrl: string;
    customPrompt: string;
  },
  idempotencyKey: string,
  deps: PersonVisualGenerationDeps,
) {
  const existing = await existingByKey(db, personId, idempotencyKey);
  if (existing) return toAsset(existing);
  const person = await getPerson(db, personId);
  const prompt = `${compilePersonVisualPrompt(person, {}, input.customPrompt)}\n以输入照片为身份参考，保留可辨识的脸型、发型与整体气质，并补全自然、合理的全身比例和服装。`;
  const asset = await db.personVisualAsset.create({
    data: {
      personId,
      parentAssetId: null,
      sourceMode: "photo",
      appearanceConfig: null,
      userInstruction: text(input.customPrompt) || null,
      compiledPrompt: prompt,
      sourceHash: sourceHash([
        personId,
        input.temporarySourcePath,
        text(input.customPrompt),
      ]),
      idempotencyKey,
      status: "pending",
      provider: deps.provider ?? "quickrouter_gpt_image_2",
      temporarySourcePath: input.temporarySourcePath,
    },
  });
  return finishGeneration(db, asset, deps, {
    sourceDataUrl: input.sourceDataUrl,
  });
}

export async function refinePersonVisual(
  db: PersonVisualsDb,
  personId: string,
  parentAssetId: string,
  instruction: string,
  idempotencyKey: string,
  deps: PersonVisualGenerationDeps,
) {
  const existing = await existingByKey(db, personId, idempotencyKey);
  if (existing) return toAsset(existing);
  const person = await getPerson(db, personId);
  const parent = await db.personVisualAsset.findUnique({
    where: { id: parentAssetId },
  });
  if (
    !parent ||
    parent.personId !== personId ||
    parent.status !== "succeeded" ||
    !parent.storagePath
  ) {
    throw new PersonVisualInvalidStateError("请选择一个可用形象继续修改");
  }
  const prompt = `这是${person.age}岁${person.gender === "male" ? "男性" : "女性"}人物。保持输入角色的年龄感、性别特征、身份、脸型、发型、完整服装、身形比例和画风一致，只执行以下修改：${text(instruction)}。保持竖版单人全身、从头到脚完整可见、无文字、无水印。`;
  const asset = await db.personVisualAsset.create({
    data: {
      personId,
      parentAssetId,
      sourceMode: "revision",
      appearanceConfig: null,
      userInstruction: text(instruction),
      compiledPrompt: prompt,
      sourceHash: sourceHash([parent.sourceHash, text(instruction)]),
      idempotencyKey,
      status: "pending",
      provider: deps.provider ?? "quickrouter_gpt_image_2",
    },
  });
  return finishGeneration(db, { ...asset, parentAsset: parent }, deps);
}

export async function retryPersonVisual(
  db: PersonVisualsDb,
  personId: string,
  assetId: string,
  deps: PersonVisualGenerationDeps,
) {
  const asset = await db.personVisualAsset.findUnique({
    where: { id: assetId },
    include: { parentAsset: true },
  });
  if (!asset || asset.personId !== personId)
    throw new PersonVisualNotFoundError();
  if (asset.status !== "failed") throw new PersonVisualInvalidStateError();
  return finishGeneration(db, asset, deps);
}

export async function selectPersonVisual(
  db: PersonVisualsDb,
  personId: string,
  assetId: string,
) {
  const asset = await db.personVisualAsset.findUnique({
    where: { id: assetId },
  });
  if (
    !asset ||
    asset.personId !== personId ||
    asset.status !== "succeeded" ||
    !asset.publicUrl
  ) {
    throw new PersonVisualInvalidStateError("只能选择已成功生成的人物形象");
  }
  await db.person.update({
    where: { id: personId },
    data: { activeVisualAssetId: assetId },
  });
  return toAsset(asset);
}

export async function deletePersonVisual(
  db: PersonVisualsDb,
  personId: string,
  assetId: string,
  removeStoredFile: (storagePath: string) => Promise<void>,
) {
  const asset = await db.personVisualAsset.findUnique({
    where: { id: assetId },
    include: { _count: { select: { childAssets: true, selectedBy: true, courseSnapshots: true } } },
  });
  if (!asset || asset.personId !== personId) throw new PersonVisualNotFoundError();
  if ((asset._count?.selectedBy ?? 0) > 0) throw new PersonVisualInvalidStateError("当前正在使用的形象不能删除");
  if ((asset._count?.childAssets ?? 0) > 0) throw new PersonVisualInvalidStateError("已有修改版本依赖这张图片，不能删除");
  if ((asset._count?.courseSnapshots ?? 0) > 0) throw new PersonVisualInvalidStateError("课程已引用这张图片，不能删除");
  await db.personVisualAsset.delete({ where: { id: assetId } });
  if (asset.storagePath) await removeStoredFile(asset.storagePath).catch(() => undefined);
}

export async function listPersonVisuals(db: PersonVisualsDb, personId: string) {
  const assets = await db.personVisualAsset.findMany({
    where: { personId, status: { not: "failed" } },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(toAsset);
}

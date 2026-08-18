import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { createStorageKey, resolveStorageDirectory, resolveStorageKey } from "./storage-path";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadBytes = 10 * 1024 * 1024;

function decodeDataUrl(value: string) {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return value.startsWith("data:image/") && index >= 0 ? Buffer.from(value.slice(index + marker.length), "base64") : null;
}

async function sourceBuffer(sourceUrl: string) {
  const data = decodeDataUrl(sourceUrl);
  if (data) return data;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`课程图片下载失败：${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function prepareCourseCharacterReference(courseId: string, assetId: string, file: File) {
  if (!allowedMimeTypes.has(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  if (file.size <= 0 || file.size > maxUploadBytes) throw new Error("图片大小必须在 10 MB 以内");
  const buffer = Buffer.from(await file.arrayBuffer());
  const prepared = await sharp(buffer).rotate().resize(1024, 1536, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const temporarySourcePath = createStorageKey("course-images", "tmp", courseId, `${assetId}.webp`);
  const absolutePath = resolveStorageKey(temporarySourcePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, prepared);
  return { temporarySourcePath, sourceDataUrl: `data:image/webp;base64,${prepared.toString("base64")}` };
}

export async function persistCourseImage(input: { sourceUrl: string; courseId: string; assetId: string; portrait?: boolean }) {
  const buffer = await sourceBuffer(input.sourceUrl);
  const width = input.portrait ? 1024 : 1536;
  const height = input.portrait ? 1536 : 864;
  const encoded = await sharp(buffer).rotate().resize(width, height, input.portrait
    ? { fit: "contain", background: { r: 248, g: 250, b: 252, alpha: 1 } }
    : { fit: "cover", position: "attention" }).webp({ quality: 86 }).toBuffer();
  const storagePath = createStorageKey("course-images", input.courseId, `${input.assetId}.webp`);
  const absolutePath = resolveStorageKey(storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, encoded);
  return { storagePath, publicUrl: `/api/course-images/${input.courseId}/${input.assetId}.webp` };
}

export async function composeCourseImageReferences(storagePaths: string[]) {
  if (storagePaths.length === 0) throw new Error("缺少可用的视觉参考图");
  const canvasWidth = 1536;
  const canvasHeight = 864;
  const columns = storagePaths.length <= 2 ? storagePaths.length : Math.min(4, Math.ceil(Math.sqrt(storagePaths.length * 16 / 9)));
  const rows = Math.ceil(storagePaths.length / columns);
  const width = Math.floor(canvasWidth / columns);
  const height = Math.floor(canvasHeight / rows);
  const cells = await Promise.all(storagePaths.map(async (storagePath, index) => ({
    input: await sharp(await readFile(resolveStorageKey(storagePath))).resize(width, height, { fit: "contain", background: "#f8fafc" }).webp().toBuffer(),
    left: (index % columns) * width,
    top: Math.floor(index / columns) * height,
  })));
  const sheet = await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#f8fafc" } }).composite(cells).webp({ quality: 88 }).toBuffer();
  return `data:image/webp;base64,${sheet.toString("base64")}`;
}

export async function removeTemporaryCourseImage(storagePath: string) {
  await rm(resolveStorageKey(storagePath), { force: true });
}

export async function removeCourseImageFiles(courseId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(courseId)) throw new Error("课程图片目录无效");
  const root = resolveStorageDirectory("course-images");
  const imageDirectory = resolveStorageDirectory("course-images", courseId);
  const temporaryDirectory = resolveStorageDirectory("course-images", "tmp", courseId);
  if (!imageDirectory.startsWith(`${root}${path.sep}`) || !temporaryDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("课程图片目录超出存储范围");
  }
  await Promise.all([
    rm(imageDirectory, { force: true, recursive: true }),
    rm(temporaryDirectory, { force: true, recursive: true }),
  ]);
}

export function resolveCourseImageFile(courseId: string, assetFile: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(courseId) || !/^[a-zA-Z0-9_-]+\.webp$/.test(assetFile)) return null;
  return resolveStorageDirectory("course-images", courseId, assetFile);
}

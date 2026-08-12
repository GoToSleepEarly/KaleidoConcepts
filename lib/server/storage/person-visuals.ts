import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadBytes = 10 * 1024 * 1024;

function storageRoot() {
  const root = process.env.STORAGE_DIR;
  if (!root) throw new Error("STORAGE_DIR is required");
  return root;
}

function decodeDataUrl(value: string) {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return value.startsWith("data:image/") && index >= 0 ? Buffer.from(value.slice(index + marker.length), "base64") : null;
}

async function sourceBuffer(sourceUrl: string) {
  const data = decodeDataUrl(sourceUrl);
  if (data) return data;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`人物形象下载失败：${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function preparePersonPhoto(personId: string, uploadId: string, file: File) {
  if (!allowedMimeTypes.has(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  if (file.size <= 0 || file.size > maxUploadBytes) throw new Error("照片大小必须在 10 MB 以内");
  const buffer = Buffer.from(await file.arrayBuffer());
  const prepared = await sharp(buffer).rotate().resize(1024, 1536, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const temporarySourcePath = path.join(storageRoot(), "person-visuals", "tmp", personId, `${uploadId}.webp`);
  await mkdir(path.dirname(temporarySourcePath), { recursive: true });
  await writeFile(temporarySourcePath, prepared);
  return { temporarySourcePath, sourceDataUrl: `data:image/webp;base64,${prepared.toString("base64")}` };
}

export async function persistPersonVisual(input: { sourceUrl: string; personId: string; assetId: string }) {
  const buffer = await sourceBuffer(input.sourceUrl);
  const encoded = await sharp(buffer).rotate().resize(1024, 1536, {
    fit: "contain",
    background: { r: 248, g: 250, b: 252, alpha: 1 },
  }).webp({ quality: 86 }).toBuffer();
  const storagePath = path.join(storageRoot(), "person-visuals", input.personId, `${input.assetId}.webp`);
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, encoded);
  return { storagePath, publicUrl: `/api/person-visuals/${input.personId}/${input.assetId}.webp` };
}

export async function readPersonVisualAsDataUrl(storagePath: string) {
  const buffer = await readFile(storagePath);
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

export async function removeTemporaryPersonPhoto(storagePath: string) {
  await rm(storagePath, { force: true });
}

export async function removeStoredPersonVisual(storagePath: string) {
  await rm(storagePath, { force: true });
}

export function resolvePersonVisualFile(personId: string, assetFile: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(personId) || !/^[a-zA-Z0-9_-]+\.webp$/.test(assetFile)) return null;
  return path.join(storageRoot(), "person-visuals", personId, assetFile);
}

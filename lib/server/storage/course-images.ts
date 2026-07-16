import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export type CourseImageStorageTargetInput = {
  storageDir?: string;
  courseId: string;
  imageId: string;
};

export type CourseImageDownloadInput = CourseImageStorageTargetInput & {
  sourceUrl: string;
};

function resolveStorageDir(storageDir = process.env.STORAGE_DIR) {
  if (!storageDir) {
    throw new Error("STORAGE_DIR is required");
  }

  return storageDir;
}

export function buildCourseImageStorageTarget(input: CourseImageStorageTargetInput) {
  const root = resolveStorageDir(input.storageDir);
  const storagePath = path.join(root, "course-images", input.courseId, `${input.imageId}.webp`);

  return {
    storagePath,
    publicUrl: `/api/course-images/${input.courseId}/${input.imageId}.webp`,
  };
}

export async function removeCourseImageDirectory(courseId: string, storageDir = process.env.STORAGE_DIR) {
  const root = resolveStorageDir(storageDir);
  const courseDir = path.join(root, "course-images", courseId);
  await rm(courseDir, { recursive: true, force: true });
}

function decodeDataUrl(value: string) {
  if (!value.startsWith("data:image/")) {
    return null;
  }

  const marker = ";base64,";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return Buffer.from(value.slice(markerIndex + marker.length), "base64");
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buffer: Buffer) {
  return buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

function webpQuality() {
  const parsed = Number(process.env.COURSE_IMAGE_WEBP_QUALITY);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : 78;
}

// The image provider (gpt-image-2 via QuickRouter) ignores the `format` param and always returns full-size PNG
// (~2MB). Re-encode PNG to WebP before persisting so Step 4 and course preview load quickly. Non-PNG buffers are
// stored as-is, so this stays a safe fallback if the provider ever honors webp output.
async function encodeForStorage(buffer: Buffer) {
  if (!isPng(buffer)) {
    return buffer;
  }

  try {
    return await sharp(buffer).webp({ quality: webpQuality() }).toBuffer();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[course-images] webp re-encode failed, storing original PNG: ${msg}`);
    return buffer;
  }
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60000;

function resolveDownloadTimeoutMs() {
  const parsed = Number(process.env.IMAGE_DOWNLOAD_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOWNLOAD_TIMEOUT_MS;
}

export async function downloadCourseImage(input: CourseImageDownloadInput) {
  const dataUrl = decodeDataUrl(input.sourceUrl);
  if (dataUrl) {
    const target = buildCourseImageStorageTarget(input);
    await mkdir(path.dirname(target.storagePath), { recursive: true });
    await writeFile(target.storagePath, await encodeForStorage(dataUrl));
    return target;
  }

  let response: Response;
  try {
    response = await fetch(input.sourceUrl, {
      signal: AbortSignal.timeout(resolveDownloadTimeoutMs()),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`图片下载超时（${resolveDownloadTimeoutMs()}ms）`, { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`);
  }

  const target = buildCourseImageStorageTarget(input);
  await mkdir(path.dirname(target.storagePath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(target.storagePath, await encodeForStorage(buffer));

  return target;
}

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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
    await writeFile(target.storagePath, dataUrl);
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
  await writeFile(target.storagePath, buffer);

  return target;
}

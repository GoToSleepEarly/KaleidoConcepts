import { mkdir, writeFile } from "node:fs/promises";
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

export async function downloadCourseImage(input: CourseImageDownloadInput) {
  const dataUrl = decodeDataUrl(input.sourceUrl);
  if (dataUrl) {
    const target = buildCourseImageStorageTarget(input);
    await mkdir(path.dirname(target.storagePath), { recursive: true });
    await writeFile(target.storagePath, dataUrl);
    return target;
  }

  const response = await fetch(input.sourceUrl);

  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`);
  }

  const target = buildCourseImageStorageTarget(input);
  await mkdir(path.dirname(target.storagePath), { recursive: true });
  await writeFile(target.storagePath, Buffer.from(await response.arrayBuffer()));

  return target;
}

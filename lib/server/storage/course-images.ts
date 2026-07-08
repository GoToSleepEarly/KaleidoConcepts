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
  const storagePath = path.join(root, "course-images", input.courseId, `${input.imageId}.png`);

  return {
    storagePath,
    publicUrl: `/api/course-images/${input.courseId}/${input.imageId}.png`,
  };
}

export async function downloadCourseImage(input: CourseImageDownloadInput) {
  const response = await fetch(input.sourceUrl);

  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`);
  }

  const target = buildCourseImageStorageTarget(input);
  await mkdir(path.dirname(target.storagePath), { recursive: true });
  await writeFile(target.storagePath, Buffer.from(await response.arrayBuffer()));

  return target;
}

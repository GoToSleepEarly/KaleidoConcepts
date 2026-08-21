import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

import sharp from "sharp";

import { createStorageKey, resolveStorageDirectory, resolveStorageKey } from "./storage-path";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadBytes = 10 * 1024 * 1024;
const maxGeneratedImageBytes = 25 * 1024 * 1024;
const downloadTimeoutMs = 60_000;
const downloadRetryDelaysMs = [0, 1_000, 3_000];
const maxRedirects = 5;

function decodeDataUrl(value: string) {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return value.startsWith("data:image/") && index >= 0 ? Buffer.from(value.slice(index + marker.length), "base64") : null;
}

function wait(delayMs: number) {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

export class CourseImageSourceError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "CourseImageSourceError";
  }
}

function downloadOnce(sourceUrl: string, timeoutMs: number, redirectsLeft = maxRedirects): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      reject(new CourseImageSourceError("课程图片下载地址无效", false));
      return;
    }
    const transport = url.protocol === "https:" ? https : url.protocol === "http:" ? http : null;
    if (!transport) {
      reject(new CourseImageSourceError("课程图片下载地址无效", false));
      return;
    }
    const request = transport.get(url, {
      family: 4,
      headers: { Accept: "image/*", "User-Agent": "PBLStudio/1.0" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new CourseImageSourceError("课程图片下载重定向次数过多", false));
          return;
        }
        downloadOnce(new URL(location, url).toString(), timeoutMs, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new CourseImageSourceError(`课程图片下载失败：${status}`, status === 408 || status === 429 || status >= 500));
        return;
      }
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxGeneratedImageBytes) {
          request.destroy(new CourseImageSourceError("课程图片超过 25 MB，无法保存", false));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new CourseImageSourceError("下载远端图片超时", true)));
    request.on("error", (error) => reject(error instanceof CourseImageSourceError
      ? error
      : new CourseImageSourceError(error.message, true)));
  });
}

export async function downloadCourseImageSource(sourceUrl: string, options: { retryDelaysMs?: number[]; timeoutMs?: number } = {}) {
  const delays = options.retryDelaysMs ?? downloadRetryDelaysMs;
  let lastError: unknown;
  for (const delay of delays) {
    await wait(delay);
    try {
      return await downloadOnce(sourceUrl, options.timeoutMs ?? downloadTimeoutMs);
    } catch (error) {
      lastError = error;
      if (error instanceof CourseImageSourceError && !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("课程图片下载失败");
}

async function sourceBuffer(sourceUrl: string) {
  const data = decodeDataUrl(sourceUrl);
  if (data) return data;
  return downloadCourseImageSource(sourceUrl);
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
  let encoded: Buffer;
  try {
    encoded = await sharp(buffer).rotate().resize(width, height, input.portrait
      ? { fit: "contain", background: { r: 248, g: 250, b: 252, alpha: 1 } }
      : { fit: "cover", position: "attention" }).webp({ quality: 86 }).toBuffer();
  } catch {
    throw new CourseImageSourceError("图片生成服务返回的内容不是有效图片", false);
  }
  const storagePath = createStorageKey("course-images", input.courseId, `${input.assetId}.webp`);
  const absolutePath = resolveStorageKey(storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, encoded);
  return { storagePath, publicUrl: `/api/course-images/${input.courseId}/${input.assetId}.webp` };
}

export async function loadCourseImageReferences(storagePaths: string[]) {
  if (storagePaths.length === 0) throw new Error("缺少可用的视觉参考图");
  return Promise.all(storagePaths.map(async (storagePath) => {
    const image = await readFile(resolveStorageKey(storagePath));
    return `data:image/webp;base64,${image.toString("base64")}`;
  }));
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

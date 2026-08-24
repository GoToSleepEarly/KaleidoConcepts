import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";

import { loadCourseImageReferences, CourseImageSourceError, downloadCourseImageSource, persistCourseImage, removeCourseImageFiles } from "./course-images";

sharp.cache(false);

const temporaryRoots: string[] = [];

afterEach(async () => {
  delete process.env.STORAGE_DIR;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })));
});

async function temporaryImage(width: number, height: number, color: string) {
  const root = await mkdtemp(path.join(tmpdir(), "pbl-course-image-"));
  temporaryRoots.push(root);
  const imagePath = path.join(root, "reference.webp");
  await writeFile(imagePath, await sharp({ create: { width, height, channels: 3, background: color } }).webp().toBuffer());
  return { root, imagePath };
}

describe("课程图片存储", () => {
  test("远端图片下载固定使用 IPv4，并在临时服务错误后有限重试", async () => {
    const source = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#2563eb" } }).png().toBuffer();
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(503).end("not ready");
        return;
      }
      response.writeHead(200, { "Content-Type": "image/png", "Content-Length": source.length }).end(source);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器地址无效");

    try {
      const downloaded = await downloadCourseImageSource(`http://localhost:${address.port}/image.png`, { retryDelaysMs: [0, 0] });
      expect(downloaded).toEqual(source);
      expect(requests).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  test("把无效 URL 和永久 HTTP 错误标记为不可继续保存的图片来源", async () => {
    await expect(downloadCourseImageSource("not-a-valid-url", { retryDelaysMs: [0] }))
      .rejects.toMatchObject({ name: "CourseImageSourceError", retryable: false });

    const server = createServer((_request, response) => response.writeHead(404).end("missing"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器地址无效");
    try {
      await expect(downloadCourseImageSource(`http://localhost:${address.port}/expired.png`, { retryDelaysMs: [0] }))
        .rejects.toMatchObject({ name: "CourseImageSourceError", retryable: false });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  test("把无法解码的响应标记为不可继续保存的图片来源", async () => {
    const { root } = await temporaryImage(10, 10, "#ffffff");
    process.env.STORAGE_DIR = root;

    await expect(persistCourseImage({
      sourceUrl: "data:image/png;base64,aW52YWxpZC1pbWFnZQ==",
      courseId: "course-1",
      assetId: "invalid-source",
    })).rejects.toBeInstanceOf(CourseImageSourceError);
  });

  test("多张人物参考按顺序独立读取，不合并为参考板", async () => {
    const { root, imagePath } = await temporaryImage(600, 900, "#bfdbfe");
    process.env.STORAGE_DIR = root;
    const references = await loadCourseImageReferences([path.relative(root, imagePath), path.relative(root, imagePath)]);
    expect(references).toHaveLength(2);
    expect(references.every((reference) => reference.startsWith("data:image/webp;base64,"))).toBe(true);
  });

  test("场景图片以裁切方式落为 PPT 16:9，不给 3:2 图片补边", async () => {
    const { root } = await temporaryImage(10, 10, "#ffffff");
    process.env.STORAGE_DIR = root;
    const source = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#ef4444" } }).png().toBuffer();
    const stored = await persistCourseImage({ sourceUrl: `data:image/png;base64,${source.toString("base64")}`, courseId: "course-1", assetId: "asset-1" });
    expect(stored.storagePath).toBe("course-images/course-1/asset-1.webp");
    const absolutePath = path.join(root, stored.storagePath);
    const metadata = await sharp(absolutePath).metadata();
    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(864);
    const leftPixel = await sharp(absolutePath).extract({ left: 0, top: 432, width: 1, height: 1 }).raw().toBuffer();
    expect(leftPixel[0]).toBeGreaterThan(220);
    expect(leftPixel[1]).toBeLessThan(100);
  });

  test("删除课程图片时同时清理正式目录和临时参考目录", async () => {
    const { root } = await temporaryImage(10, 10, "#ffffff");
    process.env.STORAGE_DIR = root;
    const imageDirectory = path.join(root, "course-images", "course-1");
    const temporaryDirectory = path.join(root, "course-images", "tmp", "course-1");
    await Promise.all([mkdir(imageDirectory, { recursive: true }), mkdir(temporaryDirectory, { recursive: true })]);
    await Promise.all([writeFile(path.join(imageDirectory, "asset.webp"), "image"), writeFile(path.join(temporaryDirectory, "source.webp"), "image")]);

    await removeCourseImageFiles("course-1");

    await expect(access(imageDirectory)).rejects.toThrow();
    await expect(access(temporaryDirectory)).rejects.toThrow();
  });
});

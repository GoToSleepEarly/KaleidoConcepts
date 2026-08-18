import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";
import { afterEach, describe, expect, test } from "vitest";

import { composeCourseImageReferences, persistCourseImage, removeCourseImageFiles } from "./course-images";

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
  test("单张竖版人物参考也会先组成 16:9 横版参考板", async () => {
    const { root, imagePath } = await temporaryImage(600, 900, "#bfdbfe");
    process.env.STORAGE_DIR = root;
    const dataUrl = await composeCourseImageReferences([path.relative(root, imagePath)]);
    const metadata = await sharp(Buffer.from(dataUrl.split(",")[1]!, "base64")).metadata();
    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(864);
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

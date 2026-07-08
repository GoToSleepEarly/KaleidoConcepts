import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCourseImageStorageTarget, downloadCourseImage } from "./course-images";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "course-images-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("course image storage", () => {
  it("builds deterministic storage and public paths", () => {
    const target = buildCourseImageStorageTarget({ storageDir: root, courseId: "course-1", imageId: "image-1" });

    expect(target.storagePath).toBe(path.join(root, "course-images", "course-1", "image-1.png"));
    expect(target.publicUrl).toBe("/api/course-images/course-1/image-1.png");
  });

  it("downloads a remote image into storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );

    const result = await downloadCourseImage({
      sourceUrl: "https://example.com/image.png",
      storageDir: root,
      courseId: "course-1",
      imageId: "image-1",
    });

    expect(await readFile(result.storagePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.publicUrl).toBe("/api/course-images/course-1/image-1.png");
  });

  it("throws when remote download fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await expect(
      downloadCourseImage({
        sourceUrl: "https://example.com/image.png",
        storageDir: root,
        courseId: "course-1",
        imageId: "image-1",
      }),
    ).rejects.toThrow("图片下载失败：403");
  });
});

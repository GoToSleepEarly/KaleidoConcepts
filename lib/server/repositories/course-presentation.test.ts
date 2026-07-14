import { describe, expect, test } from "vitest";

import { CoursePublishStatusError } from "./course-preview";
import {
  assertEditable,
  defaultPresentation,
  normalizePresentationUpdate,
} from "./course-presentation";
import type { CourseStatus } from "@/lib/contracts/api";

describe("course-presentation helpers", () => {
  test("defaultPresentation returns valid defaults", () => {
    const cfg = defaultPresentation();
    expect(cfg.coverTheme).toBe("dark");
    expect(cfg.coverTitleFontSize).toBe(1.0);
    expect(cfg.chapterTheme).toBe("blue-purple");
    expect(cfg.slideOverrides).toEqual({});
  });

  test("normalizePresentationUpdate applies defaults for missing fields", () => {
    const result = normalizePresentationUpdate({
      coverTheme: "warm",
      coverTitleFontSize: 0.8,
      chapterTheme: "green-teal",
      slideOverrides: { "shot-1": { textBlocks: [{ blockId: "s1", overriddenText: "hi" }] } },
    });
    expect(result.coverTheme).toBe("warm");
    expect(result.coverTitleFontSize).toBe(0.8);
    expect(result.chapterTheme).toBe("green-teal");
  });

  test("assertEditable passes for draft/ready/build_failed", () => {
    const ok: CourseStatus[] = ["draft", "ready", "building_resources", "build_failed"];
    for (const s of ok) {
      expect(() => assertEditable(s)).not.toThrow();
    }
  });

  test("assertEditable throws for published", () => {
    expect(() => assertEditable("published")).toThrow(CoursePublishStatusError);
  });
});

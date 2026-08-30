import { describe, expect, test } from "vitest";

import presetData from "./preset-data.json";

describe("expanded story presets", () => {
  test("contains ten theme categories with ten unique directions each", () => {
    const themes = presetData.presetOptions.filter((option) => option.kind === "theme");
    const categories = new Map<string | null, typeof themes>();
    for (const theme of themes) categories.set(theme.category, [...(categories.get(theme.category) ?? []), theme]);

    expect(themes).toHaveLength(100);
    expect(categories.size).toBe(10);
    for (const options of categories.values()) {
      expect(options).toHaveLength(10);
      expect(new Set(options.map((option) => option.label)).size).toBe(10);
    }
  });

  test("contains twenty unique story types and tones", () => {
    for (const kind of ["story_type", "story_tone"] as const) {
      const options = presetData.presetOptions.filter((option) => option.kind === kind);
      expect(options).toHaveLength(20);
      expect(new Set(options.map((option) => option.label)).size).toBe(20);
    }
  });
});

import { describe, expect, test } from "vitest";
import {
  visualGenerateSchema,
  visualIntentSchema,
  visualSettingsSchema,
  visualRefineSchema,
} from "./visual-resources";

describe("视觉资源输入校验", () => {
  test("只接受三种底层画面质量", () => {
    expect(visualSettingsSchema.parse({ quality: "medium" })).toEqual({ quality: "medium" });
    expect(() => visualSettingsSchema.parse({ quality: "ultra" })).toThrow();
  });

  test("图片批量并发数限制为一到五张", () => {
    expect(visualSettingsSchema.parse({ imageGenerationConcurrency: 3 })).toEqual({ imageGenerationConcurrency: 3 });
    expect(() => visualSettingsSchema.parse({ imageGenerationConcurrency: 0 })).toThrow();
    expect(() => visualSettingsSchema.parse({ imageGenerationConcurrency: 6 })).toThrow();
    expect(() => visualSettingsSchema.parse({})).toThrow();
  });

  test("外部角色只允许保持原形象或课堂原创化", () => {
    expect(visualIntentSchema.parse({ intent: "preserve_identity" })).toEqual({ intent: "preserve_identity" });
    expect(() => visualIntentSchema.parse({ intent: "model_generatable" })).toThrow();
  });

  test("聊天修改保留有意义的短指令并拒绝多余字段", () => {
    expect(visualRefineSchema.parse({ instruction: "  背景改成黄昏  " })).toEqual({ instruction: "背景改成黄昏" });
    expect(() => visualRefineSchema.parse({ instruction: "", prompt: "绕过系统" })).toThrow();
  });

  test("生成范围要求对应 id", () => {
    expect(visualGenerateSchema.parse({ scope: "slot", slotId: "slot-1" })).toEqual({ scope: "slot", slotId: "slot-1" });
    expect(() => visualGenerateSchema.parse({ scope: "slot" })).toThrow();
    expect(() => visualGenerateSchema.parse({ scope: "chapter" })).toThrow();
    expect(visualGenerateSchema.parse({ scope: "all" })).toEqual({ scope: "all" });
  });
});

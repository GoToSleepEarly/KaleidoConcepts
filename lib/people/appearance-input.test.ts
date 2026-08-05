import { describe, expect, it } from "vitest";

import { createDefaultAppearanceConfig, DEFAULT_PHOTO_STYLE_PROMPT, findClipboardImage } from "@/lib/people/appearance-input";

describe("人物形象输入", () => {
  it("为老师提供可直接修改的推荐外貌，而不是空白或不匹配", () => {
    expect(createDefaultAppearanceConfig("female")).toEqual(expect.objectContaining({
      hairstyle: "齐肩直发",
      hairColor: "自然黑",
      faceShape: "鹅蛋脸",
      bodyShape: "匀称",
      glasses: "不戴眼镜",
      temperament: "开朗",
      outfitStyle: "校园休闲",
      outfitColor: "天蓝色",
      signatureFeature: "大而明亮的眼睛",
    }));
    expect(createDefaultAppearanceConfig("male").hairstyle).toBe("短碎发");
  });

  it("从剪贴板文件中选择支持的图片并忽略其他内容", () => {
    const text = { type: "text/plain" } as File;
    const image = { type: "image/png" } as File;

    expect(findClipboardImage({ files: [text, image] } as unknown as DataTransfer)).toBe(image);
    expect(findClipboardImage({ files: [text] } as unknown as DataTransfer)).toBeNull();
  });

  it("把稳定生成约束转成老师可理解且可修改的照片风格要求", () => {
    expect(DEFAULT_PHOTO_STYLE_PROMPT).toBe("二维绘本风格，单人全身，正面自然站立，背景简洁明亮；保留照片中的五官和辨识特征。");
  });
});

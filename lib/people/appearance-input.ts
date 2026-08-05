import type { Gender, AppearanceConfig } from "@/lib/contracts/api";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const DEFAULT_PHOTO_STYLE_PROMPT = "二维绘本风格，单人全身，正面自然站立，背景简洁明亮；保留照片中的五官和辨识特征。";

export function createDefaultAppearanceConfig(gender: Gender): AppearanceConfig {
  return {
    hairstyle: gender === "female" ? "齐肩直发" : "短碎发",
    hairColor: "自然黑",
    faceShape: "鹅蛋脸",
    bodyShape: "匀称",
    glasses: "不戴眼镜",
    temperament: "开朗",
    outfitStyle: "校园休闲",
    outfitColor: "天蓝色",
    signatureFeature: "大而明亮的眼睛",
  };
}

export function findClipboardImage(data: Pick<DataTransfer, "files">): File | null {
  return Array.from(data.files).find((file) => supportedImageTypes.has(file.type)) ?? null;
}

export function isSupportedImage(file: Pick<File, "type">): boolean {
  return supportedImageTypes.has(file.type);
}

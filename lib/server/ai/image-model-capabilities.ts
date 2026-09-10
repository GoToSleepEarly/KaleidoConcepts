import type { CourseImageQuality } from "@/lib/contracts/api";

const FIXED_PRICE_MAX_QUALITY_MODELS = new Set(["gpt-image-2-c"]);

function canonicalModelName(model: string) {
  return model.trim().toLowerCase().split("/").at(-1) ?? "";
}

export function usesFixedPriceMaxQuality(model: string) {
  return FIXED_PRICE_MAX_QUALITY_MODELS.has(canonicalModelName(model));
}

export function imageQualityForModel(model: string, requested: CourseImageQuality): CourseImageQuality {
  return usesFixedPriceMaxQuality(model) ? "high" : requested;
}

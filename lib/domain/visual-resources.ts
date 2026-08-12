import { createHash } from "node:crypto";

export { hasInFlightVisualVersion, needsInitialVisualGeneration, shouldGenerateVisualSlot } from "./visual-resource-status";

export type ImageQuality = "low" | "medium" | "high";
export type CharacterVisualIntent = "preserve_identity" | "originalize";
export type CharacterSourceType = "person" | "referenced" | "original";

const imageQualityLabels: Record<ImageQuality, "中" | "高" | "极高"> = {
  low: "中",
  medium: "高",
  high: "极高",
};

export function imageQualityLabel(quality: ImageQuality) {
  return imageQualityLabels[quality];
}

export function defaultCharacterVisualIntent(sourceType: CharacterSourceType): CharacterVisualIntent | null {
  if (sourceType === "referenced") return "preserve_identity";
  if (sourceType === "original") return "originalize";
  return null;
}

export function canGenerateVisualSlot(characterIds: string[], readyCharacterIds: Set<string>) {
  const missingCharacterIds = [...new Set(characterIds)].filter((id) => !readyCharacterIds.has(id));
  return { allowed: missingCharacterIds.length === 0, missingCharacterIds };
}

type CoursePersonIdentity = { personId: string; chineseName: string; englishName: string };

function normalizedIdentity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

export function matchCoursePersonForCharacter(
  character: { sourcePersonId?: string | null; displayName: string },
  people: CoursePersonIdentity[],
) {
  if (character.sourcePersonId) {
    const direct = people.find((person) => person.personId === character.sourcePersonId);
    if (direct) return direct;
  }
  const displayName = normalizedIdentity(character.displayName);
  return people.find((person) => [person.chineseName, person.englishName].some((name) => normalizedIdentity(name) === displayName)) ?? null;
}

function normalizedPrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

export function visualGenerationFingerprint(input: {
  prompt: string;
  quality: ImageQuality;
  referenceAssetIds: string[];
}) {
  return createHash("sha256").update(JSON.stringify({
    prompt: normalizedPrompt(input.prompt),
    quality: input.quality,
    referenceAssetIds: [...new Set(input.referenceAssetIds)].sort(),
    version: "course-visual-v1",
  })).digest("hex");
}

export function hasInFlightVisualVersion(versions: Array<{ status: string }>) {
  return versions.some((asset) => asset.status === "pending" || asset.status === "submitting" || asset.status === "generating");
}

export function needsInitialVisualGeneration(slot: {
  activeAssetId: string | null;
  versions: Array<{ status: string }>;
}) {
  return !slot.activeAssetId
    && !slot.versions.some((asset) => asset.status === "succeeded")
    && !hasInFlightVisualVersion(slot.versions);
}

type VisualGenerationScope =
  | { scope: "all" }
  | { scope: "cover" }
  | { scope: "chapter"; chapterId?: string }
  | { scope: "slot"; slotId?: string };

export function shouldGenerateVisualSlot(
  slot: {
    id: string;
    slotType: string;
    chapterId: string | null;
    activeAssetId: string | null;
    versions: Array<{ status: string }>;
  },
  input: VisualGenerationScope,
) {
  if (input.scope === "slot") {
    return slot.id === input.slotId && !hasInFlightVisualVersion(slot.versions);
  }
  if (input.scope === "cover") {
    return slot.slotType === "visual_cover" && needsInitialVisualGeneration(slot);
  }
  if (input.scope === "chapter") {
    return slot.chapterId === input.chapterId && needsInitialVisualGeneration(slot);
  }
  return needsInitialVisualGeneration(slot);
}

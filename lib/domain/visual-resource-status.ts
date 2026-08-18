export function hasInFlightVisualVersion(
  versions: Array<{ status: string; planRevision?: number }>,
  planRevision?: number | null,
) {
  return versions.some((asset) => {
    const isCurrentPlan = !planRevision || asset.planRevision === undefined || asset.planRevision === planRevision;
    return isCurrentPlan && (asset.status === "pending" || asset.status === "submitting" || asset.status === "generating");
  });
}

export function needsInitialVisualGeneration(slot: {
  activeAssetId: string | null;
  versions: Array<{ status: string; planRevision?: number }>;
}, planRevision?: number | null) {
  const current = (asset: { planRevision?: number }) => !planRevision || asset.planRevision === undefined || asset.planRevision === planRevision;
  const activeIsCurrent = Boolean(slot.activeAssetId && slot.versions.some((asset) => current(asset) && asset.status === "succeeded"));
  return !activeIsCurrent && !hasInFlightVisualVersion(slot.versions, planRevision);
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
    versions: Array<{ status: string; planRevision?: number }>;
  },
  input: VisualGenerationScope,
  planRevision?: number | null,
) {
  if (input.scope === "slot") {
    return slot.id === input.slotId && !hasInFlightVisualVersion(slot.versions, planRevision);
  }
  if (input.scope === "cover") {
    return slot.slotType === "visual_cover" && needsInitialVisualGeneration(slot, planRevision);
  }
  if (input.scope === "chapter") {
    return slot.chapterId === input.chapterId && needsInitialVisualGeneration(slot, planRevision);
  }
  return needsInitialVisualGeneration(slot, planRevision);
}

type VisualNode = {
  id: string;
  parentAssetId: string | null;
  status: string;
};

export type VisualWorkspaceMode = "create" | "refine";

export function resolveVisualWorkspaceMode(
  visuals: VisualNode[],
): VisualWorkspaceMode {
  return visuals.some((visual) => visual.status !== "failed")
    ? "refine"
    : "create";
}

export function buildVisualRevisionChain<T extends VisualNode>(
  visuals: T[],
  selectedId: string | null,
): T[] {
  if (!selectedId) return [];

  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  const chain: T[] = [];
  const visited = new Set<string>();
  let current = byId.get(selectedId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentAssetId
      ? byId.get(current.parentAssetId)
      : undefined;
  }

  return chain;
}

const AVATAR_PALETTE = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#14B8A6",
  "#0EA5E9",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#64748B",
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function avatarBackgroundColor(seed: string): string {
  return AVATAR_PALETTE[hashSeed(seed) % AVATAR_PALETTE.length];
}

export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return Array.from(trimmed)[0];
}

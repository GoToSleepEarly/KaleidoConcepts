import path from "node:path";

function storageRoot() {
  const root = process.env.STORAGE_DIR;
  if (!root) throw new Error("STORAGE_DIR is required");
  return path.resolve(root);
}

export function createStorageKey(...segments: string[]) {
  if (!segments.length || segments.some((segment) => !segment || path.isAbsolute(segment) || segment.split(/[\\/]+/).includes(".."))) {
    throw new Error("存储键无效");
  }
  return segments.map((segment) => segment.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")).join("/");
}

export function resolveStorageKey(key: string) {
  if (path.isAbsolute(key)) throw new Error("存储键必须是相对路径");
  const root = storageRoot();
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("存储键超出存储目录");
  return resolved;
}

export function resolveStorageDirectory(...segments: string[]) {
  return resolveStorageKey(createStorageKey(...segments));
}

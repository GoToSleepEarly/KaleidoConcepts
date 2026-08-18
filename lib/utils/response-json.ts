export async function readJsonResponse<T extends object>(response: Response): Promise<Partial<T>> {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed as Partial<T> : {};
  } catch {
    return {};
  }
}

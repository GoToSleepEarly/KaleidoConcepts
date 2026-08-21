export const AUTH_USER_COOKIE = "kaleido.user-id";
export const REMEMBERED_AUTH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const REMEMBERED_AUTH_MAX_AGE_MS = REMEMBERED_AUTH_MAX_AGE_SECONDS * 1000;

export function authenticatedUserId(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const encodedValue = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_USER_COOKIE}=`))
    ?.slice(AUTH_USER_COOKIE.length + 1);

  if (!encodedValue) return null;
  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return null;
  }
}

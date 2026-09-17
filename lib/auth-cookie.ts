export const AUTH_USER_COOKIE = "kaleido.user-id";
export const REMEMBERED_AUTH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const REMEMBERED_AUTH_MAX_AGE_MS = REMEMBERED_AUTH_MAX_AGE_SECONDS * 1000;

export function authCookieSecure() {
  const override = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

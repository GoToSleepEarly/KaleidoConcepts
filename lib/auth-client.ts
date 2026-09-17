export type AuthSession = {
  user: { id: string; displayName: string };
  createdAt: string;
};

export type ServerAuthState =
  | { status: "authenticated"; session: AuthSession }
  | { status: "unauthenticated"; reason: "missing" | "session-upgrade" | "session-expired" };

const authInvalidEvent = "kaleido.auth.invalid";

export function getAuthInvalidEventName() {
  return authInvalidEvent;
}

export async function readServerAuthSession(): Promise<ServerAuthState> {
  const response = await fetch("/api/auth/session", { method: "GET", cache: "no-store" });
  if (response.ok) {
    return { status: "authenticated", session: (await response.json()) as AuthSession };
  }
  if (response.status !== 401) throw new Error("登录状态检查失败");
  const body = await response.json().catch(() => ({})) as { code?: string };
  const reason = body.code === "AUTH_SESSION_UPGRADE_REQUIRED"
    ? "session-upgrade"
    : body.code === "AUTH_SESSION_MISSING" ? "missing" : "session-expired";
  return { status: "unauthenticated", reason };
}

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = init === undefined ? await fetch(input) : await fetch(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(authInvalidEvent));
  }
  return response;
}

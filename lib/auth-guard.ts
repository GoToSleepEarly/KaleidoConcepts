import type { MockSession } from "@/lib/auth-session";

export type AuthGuardState =
  | { status: "authenticated"; session: MockSession }
  | { status: "unauthenticated"; session: null };

export function resolveAuthGuardState(session: MockSession | null): AuthGuardState {
  if (session) {
    return { status: "authenticated", session };
  }

  return { status: "unauthenticated", session: null };
}

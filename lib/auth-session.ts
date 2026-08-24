import { parseAiGateway } from "@/lib/ai-gateway";
import { REMEMBERED_AUTH_MAX_AGE_MS } from "@/lib/auth-cookie";

export type MockSession = {
  user: {
    id?: string;
    displayName: string;
    aiGateway?: "quickrouter" | "crazyrouter";
  };
  createdAt: string;
};

const sessionKey = "kaleido.mock.session";
const sessionChangeEvent = "kaleido.mock.session.change";
let cachedStoredSession: string | null = null;
let cachedSession: MockSession | null = null;

function notifyAuthSessionChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(sessionChangeEvent));
}

function rememberedSessionExpired(session: MockSession | null) {
  if (!session) return true;
  const createdAt = Date.parse(session.createdAt);
  return !Number.isFinite(createdAt) || Date.now() - createdAt >= REMEMBERED_AUTH_MAX_AGE_MS;
}

export function getAuthSessionChangeEventName() {
  return sessionChangeEvent;
}

export function saveAuthSession(session: MockSession, remember: boolean) {
  const serialized = JSON.stringify(session);
  sessionStorage.setItem(sessionKey, serialized);
  cachedStoredSession = serialized;
  cachedSession = session;

  if (remember) {
    localStorage.setItem(sessionKey, serialized);
  } else {
    localStorage.removeItem(sessionKey);
  }

  notifyAuthSessionChanged();
}

export function getStoredSession(): MockSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = sessionStorage.getItem(sessionKey) ?? localStorage.getItem(sessionKey);

  if (!stored) {
    cachedStoredSession = null;
    cachedSession = null;
    return null;
  }

  const isRemembered = localStorage.getItem(sessionKey) === stored;
  if (stored === cachedStoredSession) {
    if (isRemembered && rememberedSessionExpired(cachedSession)) {
      clearAuthSession();
      return null;
    }
    return cachedSession;
  }

  try {
    cachedStoredSession = stored;
    const parsed = JSON.parse(stored) as MockSession;
    if (isRemembered && rememberedSessionExpired(parsed)) {
      clearAuthSession();
      return null;
    }
    cachedSession = {
      ...parsed,
      user: { ...parsed.user, aiGateway: parseAiGateway(parsed.user.aiGateway) },
    };
    return cachedSession;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(sessionKey);
  localStorage.removeItem(sessionKey);
  cachedStoredSession = null;
  cachedSession = null;
  notifyAuthSessionChanged();
}

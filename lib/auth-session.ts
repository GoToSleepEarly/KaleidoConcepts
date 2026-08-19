import { parseAiGateway } from "@/lib/ai-gateway";

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

export function updateStoredAiGateway(aiGateway: "quickrouter" | "crazyrouter") {
  const session = getStoredSession();
  if (!session) return;
  const updated = JSON.stringify({ ...session, user: { ...session.user, aiGateway } });
  sessionStorage.setItem(sessionKey, updated);
  if (localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, updated);
  cachedStoredSession = updated;
  cachedSession = JSON.parse(updated) as MockSession;
  notifyAuthSessionChanged();
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

  if (stored === cachedStoredSession) {
    return cachedSession;
  }

  try {
    cachedStoredSession = stored;
    const parsed = JSON.parse(stored) as MockSession;
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

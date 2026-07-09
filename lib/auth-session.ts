export type MockSession = {
  user: {
    displayName: string;
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
    cachedSession = JSON.parse(stored) as MockSession;
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

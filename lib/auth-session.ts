export const mockAuth = {
  username: "teacher",
  password: "123456",
  displayName: "教师账号",
};

export type MockSession = {
  user: {
    displayName: string;
  };
  createdAt: string;
};

const sessionKey = "kaleido.mock.session";

export function saveAuthSession(session: MockSession, remember: boolean) {
  const serialized = JSON.stringify(session);
  sessionStorage.setItem(sessionKey, serialized);

  if (remember) {
    localStorage.setItem(sessionKey, serialized);
  } else {
    localStorage.removeItem(sessionKey);
  }
}

export function getStoredSession(): MockSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = sessionStorage.getItem(sessionKey) ?? localStorage.getItem(sessionKey);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as MockSession;
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
}

import type {
  AuthResponse,
  LoginInput,
  PublicUser,
  RegisterInput,
} from "@animeshadow/shared";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiRequest, setAuthToken } from "@/lib/api";
import { queryClient } from "@/lib/query";
import type { TelegramAuthData } from "@/lib/telegram-auth";

const STORAGE_KEY = "animeshadow.auth.v1";

interface StoredSession {
  v: 1;
  token: string;
  user: PublicUser;
}

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login: (input: LoginInput) => Promise<void>;
  /** Step 1 of signup — emails a code. No session changes: nobody is
   * created or signed in until `confirmRegistration` succeeds. */
  requestRegistration: (input: RegisterInput) => Promise<void>;
  /** Step 2 — the code was right, the account now actually exists, and this
   * applies the session exactly like `login` does. */
  confirmRegistration: (email: string, code: string) => Promise<void>;
  loginWithTelegram: (data: TelegramAuthData) => Promise<void>;
  logout: () => void;
  /** Patch the cached user (e.g. after an avatar/name change) without a full re-login. */
  updateUser: (patch: Partial<PublicUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.v !== 1 || !parsed.token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / storage disabled — session stays in memory only */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const applySession = useCallback((session: StoredSession) => {
    setAuthToken(session.token);
    writeSession(session);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const updateUser = useCallback((patch: Partial<PublicUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const session = readSession();
      if (session) writeSession({ ...session, user: next });
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    writeSession(null);
    setUser(null);
    setStatus("anonymous");
    queryClient.removeQueries({ queryKey: ["library"] });
  }, []);

  // Restore + revalidate a stored session on load.
  useEffect(() => {
    const session = readSession();
    if (!session) {
      setStatus("anonymous");
      return;
    }
    setAuthToken(session.token);
    setUser(session.user);
    setStatus("authenticated");

    apiRequest<{ user: PublicUser }>("/auth/me")
      .then(({ user: fresh }) => applySession({ ...session, user: fresh }))
      .catch(() => clearSession());
  }, [applySession, clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: input,
      });
      applySession({ v: 1, token: res.token, user: res.user });
    },
    [applySession],
  );

  const requestRegistration = useCallback(async (input: RegisterInput) => {
    // 202, empty body — no session to apply. See AuthService.requestRegistration.
    await apiRequest<void>("/auth/register", { method: "POST", body: input });
  }, []);

  const confirmRegistration = useCallback(
    async (email: string, code: string) => {
      const res = await apiRequest<AuthResponse>("/auth/register/confirm", {
        method: "POST",
        body: { email, code },
      });
      applySession({ v: 1, token: res.token, user: res.user });
    },
    [applySession],
  );

  const loginWithTelegram = useCallback(
    async (data: TelegramAuthData) => {
      const res = await apiRequest<AuthResponse>("/auth/telegram", {
        method: "POST",
        body: data,
      });
      applySession({ v: 1, token: res.token, user: res.user });
    },
    [applySession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      requestRegistration,
      confirmRegistration,
      loginWithTelegram,
      logout: clearSession,
      updateUser,
    }),
    [
      status,
      user,
      login,
      requestRegistration,
      confirmRegistration,
      loginWithTelegram,
      clearSession,
      updateUser,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

const FALLBACK_AUTH: AuthContextValue = {
  status: "anonymous",
  user: null,
  login: async () => {},
  requestRegistration: async () => {},
  confirmRegistration: async () => {},
  loginWithTelegram: async () => {},
  logout: () => {},
  updateUser: () => {},
};

export function useAuth(): AuthContextValue {
  return use(AuthContext) ?? FALLBACK_AUTH;
}

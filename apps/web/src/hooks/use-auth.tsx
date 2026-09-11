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
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
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

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: input,
      });
      applySession({ v: 1, token: res.token, user: res.user });
    },
    [applySession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout: clearSession }),
    [status, user, login, register, clearSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

const FALLBACK_AUTH: AuthContextValue = {
  status: "anonymous",
  user: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
};

export function useAuth(): AuthContextValue {
  return use(AuthContext) ?? FALLBACK_AUTH;
}

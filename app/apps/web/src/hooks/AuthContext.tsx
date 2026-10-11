import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "../api";
import { hasActiveSocket } from "../socketLifecycle";
import type { User } from "../types";

export type Credentials = { username: string; password: string };
type AuthValue = {
  user: User | null;
  ready: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);
const accessRefreshDelay = 14 * 60 * 1000;

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useRef<() => void>(() => undefined);
  const activeUserId = useRef<string | null>(null);
  // Bumped by login/logout so a late auth response from a previous account lifecycle
  // can never re-apply its user, token, or socket after that lifecycle ended.
  const generation = useRef(0);

  const refreshSession = useCallback(
    async (
      restoreUser: boolean,
      isActive: () => boolean = () => true,
    ): Promise<void> => {
      const captured = generation.current;
      const alive = (): boolean =>
        captured === generation.current && isActive();
      const dropSession = async (): Promise<void> => {
        setAccessToken(null);
        setUser(null);
        activeUserId.current = null;
        queryClient.clear();
        // Avoid loading the socket chunk when no socket was ever created (N07).
        if (!hasActiveSocket()) return;
        const { getSocket, disconnectSocket } = await import("../socket");
        // A lifecycle that started while the chunk loaded (e.g. another login) owns the
        // current socket now; this stale drop must not disconnect it (N03).
        if (!alive()) return;
        if (getSocket()) disconnectSocket();
      };
      try {
        const response = await api.api.auth.refresh.$post();
        if (!alive()) return;
        if (!response.ok) {
          await dropSession();
          return;
        }
        const data = await response.json();
        if (!alive()) return;
        setAccessToken(data.accessToken);
        if (restoreUser) {
          const me = await api.api.auth.me.$get();
          if (!alive()) return;
          if (!me.ok) {
            await dropSession();
            return;
          }
          const restoredUser = (await me.json()).user;
          if (!alive()) return;
          if (activeUserId.current !== restoredUser.id) queryClient.clear();
          activeUserId.current = restoredUser.id;
          setUser(restoredUser);
        }
        // Refresh rotation re-authenticates the persistent socket with the new token; subscriptions stay intact.
        const { connectSocket } = await import("../socket");
        if (!alive()) return;
        connectSocket(data.accessToken);
        scheduleRefresh.current();
      } catch {
        if (!alive()) return;
        await dropSession();
      } finally {
        if (restoreUser && alive()) setReady(true);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    scheduleRefresh.current = () => {
      if (refreshTimer.current !== null)
        window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void refreshSession(false);
      }, accessRefreshDelay);
    };
    const restoreTimer = window.setTimeout(() => {
      void refreshSession(true, () => active);
    }, 0);
    return () => {
      active = false;
      // Invalidate every in-flight auth operation (login/logout/refresh): their captured
      // generations no longer match, so a continuation resolving after unmount cannot create
      // a socket or re-register the refresh timer for an unmounted provider (N03).
      generation.current += 1;
      window.clearTimeout(restoreTimer);
      if (refreshTimer.current !== null)
        window.clearTimeout(refreshTimer.current);
    };
  }, [refreshSession]);

  async function login(credentials: Credentials): Promise<void> {
    generation.current += 1;
    const captured = generation.current;
    const response = await api.api.auth.login.$post({ json: credentials });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "사용자명 또는 비밀번호가 올바르지 않습니다"
          : "로그인 요청을 완료하지 못했습니다",
      );
    const data = await response.json();
    if (captured !== generation.current) return;
    if (activeUserId.current !== data.user.id) queryClient.clear();
    activeUserId.current = data.user.id;
    setAccessToken(data.accessToken);
    setUser(data.user);
    // Keep socket.io-client out of the unauthenticated entry bundle; connect only after login succeeds.
    const { connectSocket, disconnectSocket } = await import("../socket");
    if (captured !== generation.current) return;
    disconnectSocket();
    connectSocket(data.accessToken);
    scheduleRefresh.current();
  }

  async function register(credentials: Credentials): Promise<void> {
    generation.current += 1;
    const captured = generation.current;
    const response = await api.api.auth.register.$post({ json: credentials });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "이미 사용 중인 사용자명입니다"
          : "가입할 수 없습니다. 입력 내용을 확인해 주세요",
      );
    if (captured !== generation.current) return;
    await login(credentials);
  }

  async function logout(): Promise<void> {
    generation.current += 1;
    const captured = generation.current;
    if (refreshTimer.current !== null)
      window.clearTimeout(refreshTimer.current);
    activeUserId.current = null;
    queryClient.clear();
    // Skip the socket chunk entirely when this lifecycle never created a socket (N07).
    if (hasActiveSocket()) {
      const { getSocket, disconnectSocket } = await import("../socket");
      if (captured !== generation.current) return;
      if (getSocket()) disconnectSocket();
    }
    try {
      await api.api.auth.logout.$post();
    } finally {
      if (captured === generation.current) {
        setAccessToken(null);
        setUser(null);
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}

import { Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import { ThemeProvider } from "./hooks/ThemeContext";
import "./styles/tokens.css";
import "./styles/global.css";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RoomListPage = lazy(() => import("./pages/RoomListPage"));
const RoomPage = lazy(() => import("./pages/RoomPage"));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return <main className="loading-screen">대화를 준비하고 있어요…</main>;
  return user ? children : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { user, ready } = useAuth();
  if (!ready)
    return <main className="loading-screen">대화를 준비하고 있어요…</main>;
  return user ? <Navigate to="/rooms" replace /> : <LoginPage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Suspense
              fallback={
                <main className="loading-screen">화면을 불러오는 중…</main>
              }
            >
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route
                  path="/rooms"
                  element={
                    <ProtectedRoute>
                      <RoomListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/rooms/:roomId"
                  element={
                    <ProtectedRoute>
                      <RoomPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/rooms" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

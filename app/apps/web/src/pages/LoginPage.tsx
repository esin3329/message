import { useActionState, useState, type ReactElement } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../hooks/AuthContext";
import { PasswordInput, ThemeToggle } from "../components/Inputs";

type FormState = { error: string | null };
const initialState: FormState = { error: null };

export default function LoginPage(): ReactElement {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const navigate = useNavigate();
  const [state, action, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const username = String(formData.get("username") ?? "");
      const password = String(formData.get("password") ?? "");
      try {
        if (mode === "register") await register({ username, password });
        else await login({ username, password });
        navigate("/rooms");
        return initialState;
      } catch (error) {
        const passwordInput = document.getElementById(
          "password",
        ) as HTMLInputElement | null;
        if (passwordInput) passwordInput.value = "";
        return {
          error:
            mode === "login" &&
            error instanceof Error &&
            error.message.includes("올바르지 않습니다")
              ? "사용자명 또는 비밀번호가 올바르지 않습니다"
              : error instanceof Error
                ? error.message
                : "요청을 완료하지 못했습니다",
        };
      }
    },
    initialState,
  );

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <header className="auth-header">
          <a className="brand" href="/login">
            <span className="brand-icon" aria-hidden="true">
              m
            </span>{" "}
            모아
          </a>
          <ThemeToggle />
        </header>
        <div className="auth-intro">
          <span className="eyebrow">MESSAGE, BETTER</span>
          <h1>{mode === "login" ? "다시 만나 반가워요" : "함께 대화해요"}</h1>
          <p>
            {mode === "login"
              ? "로그인하고 이어서 대화를 나눠보세요."
              : "계정을 만들고 대화방에 참여해 보세요."}
          </p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="인증 방식">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
          >
            회원가입
          </button>
        </div>
        <form action={action} className="auth-form">
          {state.error && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          <label htmlFor="username">사용자명</label>
          <input
            id="username"
            name="username"
            type="text"
            minLength={3}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "auth-error" : undefined}
          />
          {state.error && (
            <span className="sr-only" id="auth-error">
              {state.error}
            </span>
          )}
          <label htmlFor="password">비밀번호</label>
          <PasswordInput
            id="password"
            name="password"
            minLength={12}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "auth-error" : undefined}
          />
          <p className="field-hint">최소 12자 · 영문, 숫자, 기호 사용 가능</p>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "처리 중…" : mode === "login" ? "로그인" : "계정 만들기"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
        <footer className="auth-footnote">
          안전한 대화를 위해 비밀번호는 암호화되어 저장됩니다.
        </footer>
      </section>
    </main>
  );
}

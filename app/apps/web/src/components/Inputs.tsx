import { useState, type InputHTMLAttributes, type ReactElement } from "react";
import { useTheme } from "../hooks/ThemeContext";

export function PasswordInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
): ReactElement {
  const [visible, setVisible] = useState(false);
  const inputId = props.id ?? "password";
  return (
    <div className="password-field">
      <input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        spellCheck={false}
        autoCapitalize="none"
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "숨기기" : "비밀번호 보기"}
      </button>
    </div>
  );
}

export function ThemeToggle(): ReactElement {
  const { theme, setTheme } = useTheme();
  const next =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label =
    theme === "system"
      ? "시스템 테마"
      : theme === "dark"
        ? "다크 테마"
        : "라이트 테마";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`테마: ${label}`}
      onClick={() => setTheme(next)}
    >
      {label}
    </button>
  );
}

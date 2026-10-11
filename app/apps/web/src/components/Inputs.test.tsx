import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PasswordInput, ThemeToggle } from "./Inputs";
import { ThemeProvider } from "../hooks/ThemeContext";

describe("accessible inputs and theme preference", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
  });

  it("toggles password visibility with its changing accessible label", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="test-password">비밀번호</label>
        <PasswordInput id="test-password" />
      </>,
    );
    const password = screen.getByLabelText("비밀번호");
    const show = screen.getByRole("button", { name: "비밀번호 보기" });
    expect(password.getAttribute("type")).toBe("password");
    expect(show.getAttribute("type")).toBe("button");
    expect(show.getAttribute("aria-controls")).toBe("test-password");
    expect(show.getAttribute("aria-pressed")).toBeNull();

    await user.click(show);
    expect(password.getAttribute("type")).toBe("text");
    expect(
      screen.getByRole("button", { name: "비밀번호 숨기기" }).textContent,
    ).toContain("숨기기");
  });

  it("persists all three theme choices and updates browser color-scheme", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole("button", { name: "테마: 시스템 테마" });

    await user.click(toggle);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("only light");
    await user.click(screen.getByRole("button", { name: "테마: 라이트 테마" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "테마: 다크 테마" }));
    expect(localStorage.getItem("theme")).toBe("system");
    expect(document.documentElement.style.colorScheme).toBe("light dark");
  });
});

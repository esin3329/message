import type { AppType } from "@repo/api/app-type";
import { hc } from "hono/client";

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export const api = hc<AppType>("http://localhost:3000", {
  init: { credentials: "include" },
  fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    else headers.delete("Authorization");
    return fetch(input, { ...init, headers, credentials: "include" });
  },
});

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { errorBody } from "../lib/errors.js";
import { getRealtimeServer } from "../lib/realtime.js";
import {
  createSession,
  revokeRefreshToken,
  rotateSession,
} from "../lib/session.js";
import {
  authenticateUser,
  getUserProfile,
  normalizeUsername,
  registerUser,
} from "../services/auth.service.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(12).max(128),
});
const credentialsValidator = zValidator(
  "json",
  credentialsSchema,
  (result, c) => {
    if (!result.success)
      return c.json(
        errorBody(
          "INVALID_INPUT",
          "사용자명 또는 비밀번호 형식이 올바르지 않습니다",
        ),
        400,
      );
  },
);
const cookieOptions = {
  path: "/api/auth",
  httpOnly: true,
  secure: true,
  sameSite: "Strict" as const,
  maxAge: 7 * 24 * 60 * 60,
};
const refreshCookie = "refreshToken";

function putRefreshCookie(
  c: Context<{ Variables: AuthVariables }>,
  token: string,
): void {
  setCookie(c, refreshCookie, token, cookieOptions);
}

const loginLimit = rateLimiter({
  windowMs: 60_000,
  limit: 5,
  keyGenerator: async (c) => {
    let username = "invalid";
    try {
      const body: unknown = await c.req.raw.clone().json();
      if (
        typeof body === "object" &&
        body !== null &&
        "username" in body &&
        typeof body.username === "string"
      )
        username = normalizeUsername(body.username) || "invalid";
    } catch {
      username = "invalid";
    }
    let address = "local";
    try {
      address = getConnInfo(c).remote.address ?? address;
    } catch {
      address = "local";
    }
    return `${username}:${address}`;
  },
  handler: (c) =>
    c.json(errorBody("RATE_LIMITED", "요청 횟수를 초과했습니다"), 429),
});

const auth = new Hono<{ Variables: AuthVariables }>()
  .post("/register", credentialsValidator, async (c) => {
    const body = c.req.valid("json");
    const result = await registerUser(
      normalizeUsername(body.username),
      body.password,
    );
    if (result.status === "taken")
      return c.json(
        errorBody("USERNAME_TAKEN", "이미 사용 중인 사용자명입니다"),
        409,
      );
    return c.json({ user: result.user }, 201);
  })
  .post("/login", loginLimit, credentialsValidator, async (c) => {
    const body = c.req.valid("json");
    const user = await authenticateUser(
      normalizeUsername(body.username),
      body.password,
    );
    if (!user)
      return c.json(
        errorBody(
          "INVALID_CREDENTIALS",
          "사용자명 또는 비밀번호가 올바르지 않습니다",
        ),
        401,
      );
    const session = await createSession(user.id);
    putRefreshCookie(c, session.refreshToken);
    return c.json({ accessToken: session.accessToken, user });
  })
  .post("/refresh", async (c) => {
    const token = getCookie(c, refreshCookie);
    if (!token)
      return c.json(
        errorBody("INVALID_SESSION", "세션을 복원할 수 없습니다"),
        401,
      );
    const result = await rotateSession(token);
    if (result.status !== "ok") {
      if (result.revokedFamilyId)
        getRealtimeServer()
          ?.in(`session:${result.revokedFamilyId}`)
          .disconnectSockets(true);
      deleteCookie(c, refreshCookie, {
        path: "/api/auth",
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      });
      return c.json(
        errorBody("INVALID_SESSION", "세션을 복원할 수 없습니다"),
        401,
      );
    }
    putRefreshCookie(c, result.refreshToken);
    return c.json({ accessToken: result.accessToken });
  })
  .post("/logout", async (c) => {
    const familyId = await revokeRefreshToken(getCookie(c, refreshCookie));
    if (familyId)
      getRealtimeServer()?.in(`session:${familyId}`).disconnectSockets(true);
    deleteCookie(c, refreshCookie, {
      path: "/api/auth",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
    return c.body(null, 204);
  })
  .get("/me", requireAuth, async (c) => {
    return c.json({ user: await getUserProfile(c.get("userId")) });
  });

export default auth;

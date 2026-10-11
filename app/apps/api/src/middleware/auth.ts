import type { MiddlewareHandler } from "hono";
import { verifyAccessToken } from "../lib/session.js";
import type { AccessClaims } from "../lib/session.js";
import { prisma } from "../lib/db.js";
import { errorBody } from "../lib/errors.js";

export type AuthVariables = { userId: string; sessionId: string };
export const requireAuth: MiddlewareHandler<{
  Variables: AuthVariables;
}> = async (c, next) => {
  const authorization = c.req.header("Authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  let claims: AccessClaims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    return c.json(errorBody("UNAUTHENTICATED", "인증이 필요합니다"), 401);
  }
  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true, expiresAt: true, revokedAt: true },
  });
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    return c.json(errorBody("UNAUTHENTICATED", "인증이 필요합니다"), 401);
  }
  c.set("userId", claims.userId);
  c.set("sessionId", claims.sessionId);
  await next();
};

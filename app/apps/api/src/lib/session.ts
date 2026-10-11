import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db.js";

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32)
  throw new Error("JWT_SECRET must contain at least 32 bytes");
const key = new TextEncoder().encode(secret);
export const issuer = process.env.JWT_ISSUER ?? "message-api";
export const audience = process.env.JWT_AUDIENCE ?? "message-web";
export const accessLifetimeSeconds = 15 * 60;
export const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

// In-process registry of session families revoked by this process (F01). A family is marked
// synchronously at the moment revocation is decided — BEFORE the async DB write that records
// it — so a broadcast continuation that runs after the revocation flow began observes the
// revocation without an async gap. The DB stays authoritative across restarts; this registry
// only closes the check/send race within a single process lifetime.
// A committed revocation is recorded as a single boolean per family — one constant entry
// regardless of how many revoke requests succeed afterwards (N09). A boolean alone is not
// enough while attempts can still roll back: if attempt B commits its revocation and a
// slower attempt A had marked the same family, A's rollback must not erase the record of
// B's committed revocation, or a held stale batch could still be delivered (F01
// mark-overwrite race). An entry therefore keeps the count of outstanding in-flight
// attempts alongside the committed flag, and disappears only when no committed revocation
// remains and every in-flight attempt has rolled back.
type RevocationMark = {
  committed: boolean;
  pending: number;
  committedAt: number;
};
const revokedFamilies = new Map<string, RevocationMark>();
// Tracks marks made by attempts that are still inside their DB write, so a failed attempt
// rolls back only marks it still owns (F01 unmark-ownership race).
const pendingMarks = new Map<symbol, string>();
let lastRegistrySweep = 0;

export function markFamilyRevoked(familyId: string): symbol {
  const owner = Symbol(familyId);
  const existing = revokedFamilies.get(familyId);
  if (existing) {
    existing.pending += 1;
  } else {
    revokedFamilies.set(familyId, {
      committed: false,
      pending: 1,
      committedAt: 0,
    });
  }
  pendingMarks.set(owner, familyId);
  const now = Date.now();
  if (now - lastRegistrySweep < 60_000) return owner;
  lastRegistrySweep = now;
  // Entries become useless once the family's absolute expiry has passed; bound the map.
  // `pending` marks are at most one per in-flight request, so only `committed` entries
  // need their age swept — and a fresh mark must not push that sweep back (N09).
  for (const [id, mark] of revokedFamilies)
    if (mark.committed && now - mark.committedAt > refreshLifetimeMs)
      revokedFamilies.delete(id);
  return owner;
}

// Records that the revoking attempt's DB write committed. From this point the family is
// remembered revoked with a constant-size entry; the attempt's own rollback token is
// released because a committed revocation never rolls back (F01, N09).
export function commitFamilyRevoked(familyId: string, owner: symbol): void {
  if (!pendingMarks.delete(owner)) return;
  const mark = revokedFamilies.get(familyId);
  if (!mark) return;
  if (!mark.committed) {
    mark.committed = true;
    mark.committedAt = Date.now();
  }
  mark.pending -= 1;
}

// Rolls back an in-memory mark when the DB write meant to record it failed, so a family the
// DB still considers valid is not left disconnected until process restart (availability).
// Only the attempt's own mark is removed; the entry survives while a committed revocation
// or another in-flight attempt still holds it (F01).
export function unmarkFamilyRevoked(familyId: string, owner: symbol): void {
  if (!pendingMarks.delete(owner)) return;
  const mark = revokedFamilies.get(familyId);
  if (!mark) return;
  mark.pending -= 1;
  if (!mark.committed && mark.pending <= 0) revokedFamilies.delete(familyId);
}

export function isFamilyRevoked(familyId: string): boolean {
  return revokedFamilies.has(familyId);
}

export type AccessClaims = { userId: string; sessionId: string };
export async function issueAccessToken(
  userId: string,
  sessionId: string,
): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${accessLifetimeSeconds}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer,
    audience,
  });
  if (
    protectedHeader.alg !== "HS256" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.exp !== "number"
  )
    throw new Error("Invalid access token claims");
  return { userId: payload.sub, sessionId: payload.sid };
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
export async function createSession(
  userId: string,
): Promise<{ sessionId: string; refreshToken: string; accessToken: string }> {
  const sessionId = randomBytes(24).toString("base64url");
  const refreshToken = randomBytes(48).toString("base64url");
  await prisma.session.create({
    data: {
      id: sessionId,
      familyId: sessionId,
      userId,
      refreshHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshLifetimeMs),
    },
  });
  return {
    sessionId,
    refreshToken,
    accessToken: await issueAccessToken(userId, sessionId),
  };
}

export type RefreshResult =
  | { status: "ok"; refreshToken: string; accessToken: string }
  | { status: "invalid"; revokedFamilyId: string | null }
  | { status: "reused"; revokedFamilyId: string };
export async function rotateSession(
  refreshToken: string,
): Promise<RefreshResult> {
  const refreshHash = hashToken(refreshToken);
  const replacement = randomBytes(48).toString("base64url");
  const replacementId = randomBytes(24).toString("base64url");
  // Families marked during this attempt, with the owner token of each mark, so a failed
  // transaction rolls back only marks it still owns (F01 unmark-ownership race).
  const markedFamilies: { familyId: string; owner: symbol }[] = [];
  const mark = (familyId: string): void => {
    // Mark BEFORE the recording write: any broadcast continuation that runs from this
    // synchronous point on observes the revocation, closing the commit/teardown gap (F01).
    const owner = markFamilyRevoked(familyId);
    markedFamilies.push({ familyId, owner });
  };
  try {
    const result = await prisma.$transaction(
      async (tx): Promise<RefreshResult> => {
        const session = await tx.session.findUnique({ where: { refreshHash } });
        if (!session) return { status: "invalid", revokedFamilyId: null };
        const now = new Date();
        if (session.usedAt || session.revokedAt) {
          mark(session.familyId);
          if (!session.revokedAt)
            await tx.session.updateMany({
              where: { familyId: session.familyId, revokedAt: null },
              data: { revokedAt: now },
            });
          return { status: "reused", revokedFamilyId: session.familyId };
        }
        if (session.expiresAt <= now) {
          mark(session.familyId);
          await tx.session.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { status: "invalid", revokedFamilyId: session.familyId };
        }
        const claimed = await tx.session.updateMany({
          where: { id: session.id, usedAt: null, revokedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) {
          mark(session.familyId);
          await tx.session.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { status: "reused", revokedFamilyId: session.familyId };
        }
        await tx.session.create({
          data: {
            id: replacementId,
            familyId: session.familyId,
            userId: session.userId,
            refreshHash: hashToken(replacement),
            expiresAt: session.expiresAt,
          },
        });
        return {
          status: "ok",
          refreshToken: replacement,
          accessToken: await issueAccessToken(session.userId, replacementId),
        };
      },
    );
    // The transaction committed: convert every mark of this attempt into a constant
    // committed record so later revocations of the same family add no state (N09).
    for (const { familyId, owner } of markedFamilies)
      commitFamilyRevoked(familyId, owner);
    return result;
  } catch (error) {
    for (const { familyId, owner } of markedFamilies)
      unmarkFamilyRevoked(familyId, owner);
    throw error;
  }
}

export async function revokeRefreshToken(
  refreshToken: string | undefined,
): Promise<string | null> {
  if (!refreshToken) return null;
  const session = await prisma.session.findUnique({
    where: { refreshHash: hashToken(refreshToken) },
    select: { familyId: true },
  });
  if (!session) return null;
  // Mark before the recording write so an in-flight broadcast observes the logout (F01).
  const owner = markFamilyRevoked(session.familyId);
  try {
    await prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch (error) {
    unmarkFamilyRevoked(session.familyId, owner);
    throw error;
  }
  commitFamilyRevoked(session.familyId, owner);
  return session.familyId;
}

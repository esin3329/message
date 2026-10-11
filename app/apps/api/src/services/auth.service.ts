import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

export type UserProfile = { id: string; username: string };

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export type RegisterResult =
  { status: "ok"; user: UserProfile } | { status: "taken" };

export async function registerUser(
  username: string,
  password: string,
): Promise<RegisterResult> {
  try {
    const user = await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password) },
      select: { id: true, username: true },
    });
    return { status: "ok", user };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002")
      return { status: "taken" };
    throw error;
  }
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return null;
  return { id: user.id, username: user.username };
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "인증이 필요합니다");
  return user;
}

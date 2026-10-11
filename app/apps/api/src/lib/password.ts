import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

const parameters = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      { ...parameters, message: Buffer.from(password), nonce: salt },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `argon2id$m=${parameters.memory},t=${parameters.passes},p=${parameters.parallelism}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (
    parts.length !== 4 ||
    parts[0] !== "argon2id" ||
    parts[1] !== "m=19456,t=2,p=1"
  )
    return false;
  try {
    const salt = Buffer.from(parts[2]!, "base64url");
    const expected = Buffer.from(parts[3]!, "base64url");
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

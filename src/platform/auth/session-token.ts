import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

/** A fresh, high-entropy opaque session token. This value goes in the browser cookie. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Session tokens are already random and high-entropy (unlike passwords), so a
 * fast keyed hash (HMAC-SHA256) is the correct — and standard — choice here,
 * not a slow KDF. Keyed with NEXTAUTH_SECRET so a stolen database alone
 * cannot be used to forge or replay tokens without also knowing the secret.
 */
export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function tokensMatch(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

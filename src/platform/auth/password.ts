import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Node's built-in scrypt: an OWASP-endorsed password KDF with zero extra
 * dependencies and no native bindings — unlike bcrypt/argon2, which risk
 * breaking Vercel's serverless bundling. Cost parameters are scrypt's
 * defaults (N=16384, r=8, p=1), already tuned for interactive login latency.
 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

/** Constant-time comparison — never short-circuits on the first differing byte. */
export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

const MIN_PASSWORD_LENGTH = 12;
const DENYLISTED_PASSWORDS = new Set(["password", "password123", "12345678", "123456789", "qwertyuiop", "letmein", "changeme", "admin1234", "welcome123"]);

/** Basic strength/denylist check for bootstrap and (future) self-service password entry. */
export function isPasswordAcceptable(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (DENYLISTED_PASSWORDS.has(password.toLowerCase())) return { ok: false, reason: "This password is too common. Choose a different one." };
  return { ok: true };
}

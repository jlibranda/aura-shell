import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "@/platform/auth/password";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", async () => {
    const { hash, salt } = await hashPassword("a-strong-passphrase-2026");
    await expect(verifyPassword("a-strong-passphrase-2026", salt, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const { hash, salt } = await hashPassword("a-strong-passphrase-2026");
    await expect(verifyPassword("wrong-passphrase", salt, hash)).resolves.toBe(false);
  });

  it("never stores the plaintext password in the hash or salt", async () => {
    const password = "a-strong-passphrase-2026";
    const { hash, salt } = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(salt).not.toContain(password);
  });

  it("produces a different hash for the same password on each call (random salt)", async () => {
    const first = await hashPassword("a-strong-passphrase-2026");
    const second = await hashPassword("a-strong-passphrase-2026");
    expect(first.hash).not.toBe(second.hash);
    expect(first.salt).not.toBe(second.salt);
  });
});

describe("isPasswordAcceptable", () => {
  it("accepts a sufficiently long, non-denylisted password", () => {
    expect(isPasswordAcceptable("a-genuinely-unique-passphrase")).toEqual({ ok: true });
  });

  it("refuses a password shorter than the minimum length", () => {
    const result = isPasswordAcceptable("Short1!");
    expect(result.ok).toBe(false);
  });

  it("refuses common/default passwords even when they meet the length bar", () => {
    const result = isPasswordAcceptable("password123");
    expect(result.ok).toBe(false);
  });

  it("refuses another common denylisted password case-insensitively", () => {
    const result = isPasswordAcceptable("Welcome123");
    expect(result.ok).toBe(false);
  });
});

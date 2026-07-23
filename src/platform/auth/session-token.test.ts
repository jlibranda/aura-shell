import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken, tokensMatch } from "@/platform/auth/session-token";

describe("session tokens", () => {
  it("generates a fresh, high-entropy token on every call", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("hashes the same token+secret pair identically", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, "secret-a")).toBe(hashSessionToken(token, "secret-a"));
  });

  it("produces a different hash for a different secret (keyed, not a bare hash)", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, "secret-a")).not.toBe(hashSessionToken(token, "secret-b"));
  });

  it("tokensMatch confirms equal hashes and rejects differing ones", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token, "secret");
    expect(tokensMatch(hash, hashSessionToken(token, "secret"))).toBe(true);
    expect(tokensMatch(hash, hashSessionToken("a-different-token", "secret"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { EnvironmentValidationError, validateEnvironment } from "@/platform/env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  NEXTAUTH_SECRET: "a".repeat(32),
  APP_URL: "https://app.example.com",
};

describe("validateEnvironment", () => {
  it("returns a validated config when every required variable is present and well-formed", () => {
    expect(validateEnvironment(validEnv)).toEqual({
      nodeEnv: "test",
      databaseUrl: validEnv.DATABASE_URL,
      nextAuthSecret: validEnv.NEXTAUTH_SECRET,
      appUrl: validEnv.APP_URL,
    });
  });

  it("fails fast with every issue when required variables are missing", () => {
    expect(() => validateEnvironment({})).toThrow(EnvironmentValidationError);
    try {
      validateEnvironment({});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      const issues = (error as EnvironmentValidationError).issues;
      expect(issues).toEqual(expect.arrayContaining([
        expect.stringContaining("NODE_ENV"),
        expect.stringContaining("DATABASE_URL"),
        expect.stringContaining("NEXTAUTH_SECRET"),
        expect.stringContaining("APP_URL"),
      ]));
    }
  });

  it("rejects a non-postgresql DATABASE_URL", () => {
    expect(() => validateEnvironment({ ...validEnv, DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a NODE_ENV outside the known set", () => {
    expect(() => validateEnvironment({ ...validEnv, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("rejects a NEXTAUTH_SECRET shorter than the minimum length", () => {
    expect(() => validateEnvironment({ ...validEnv, NEXTAUTH_SECRET: "short" })).toThrow(/NEXTAUTH_SECRET/);
  });

  it("rejects an APP_URL that is not a valid http(s) URL", () => {
    expect(() => validateEnvironment({ ...validEnv, APP_URL: "not-a-url" })).toThrow(/APP_URL/);
  });

  it("never substitutes a default for a missing secret", () => {
    try {
      validateEnvironment({ ...validEnv, NEXTAUTH_SECRET: "" });
      expect.unreachable();
    } catch (error) {
      expect((error as EnvironmentValidationError).issues.join(" ")).toContain("NEXTAUTH_SECRET is required");
    }
  });
});

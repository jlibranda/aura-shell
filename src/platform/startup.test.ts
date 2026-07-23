import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
vi.mock("@/platform/persistence/prisma-client", () => ({
  getPrismaClient: () => ({ $queryRaw: queryRawMock }),
}));

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  NEXTAUTH_SECRET: "a".repeat(32),
  APP_URL: "https://app.example.com",
};

async function loadStartup() {
  return import("@/platform/startup");
}

describe("startup validation", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRawMock.mockReset();
    for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ready when environment, database, and migrations all check out", async () => {
    queryRawMock.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 0 }]);
    const { ensureStartupValidated, getStartupState } = await loadStartup();

    const result = await ensureStartupValidated();

    expect(result.status).toBe("ready");
    expect(getStartupState().status).toBe("ready");
  });

  it("reports failed with the environment check when required variables are missing", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    const { ensureStartupValidated } = await loadStartup();

    const result = await ensureStartupValidated();

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.checks.environment).toBe("invalid");
      expect(result.checks.database).toBeUndefined();
    }
  });

  it("reports failed with the database check when the database is unreachable", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("connection refused"));
    const { ensureStartupValidated } = await loadStartup();

    const result = await ensureStartupValidated();

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.checks.environment).toBe("valid");
      expect(result.checks.database).toBe("unreachable");
    }
  });

  it("reports failed with the migrations check when a migration has not finished", async () => {
    queryRawMock.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 2 }]);
    const { ensureStartupValidated } = await loadStartup();

    const result = await ensureStartupValidated();

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.checks.migrations).toBe("incompatible");
  });

  it("executes startup checks exactly once even when called concurrently", async () => {
    queryRawMock.mockResolvedValue([{ count: 0 }]);
    const { ensureStartupValidated } = await loadStartup();

    await Promise.all([ensureStartupValidated(), ensureStartupValidated(), ensureStartupValidated()]);

    // Two checks (database + migrations) per run; three concurrent calls must still only run once.
    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the resolved result on subsequent calls without re-querying the database", async () => {
    queryRawMock.mockResolvedValue([{ count: 0 }]);
    const { ensureStartupValidated } = await loadStartup();

    await ensureStartupValidated();
    await ensureStartupValidated();

    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });
});

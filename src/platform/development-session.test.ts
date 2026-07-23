import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/platform/errors";
import { getDevelopmentSession } from "@/platform/development-session";

describe("development session", () => {
  it("supplies a server-owned development identity for runtime integration", () => {
    const session = getDevelopmentSession();

    expect(session).toMatchObject({
      principal: { tenantId: "nw-ph" },
      roles: ["hr_admin"],
      actorProvenance: "development_adapter",
    });
  });

  it("fails closed in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getDevelopmentSession()).toThrow(ApplicationError);
    vi.unstubAllEnvs();
  });
});

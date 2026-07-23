import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTiming } from "@/platform/observability/timing";

describe("withTiming", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns the wrapped result and logs a success entry with a numeric duration", async () => {
    const result = await withTiming("repository", "list", async () => "ok", { extra: "field" });

    expect(result).toBe("ok");
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ component: "repository", operation: "list", outcome: "success", extra: "field" });
    expect(typeof entry.durationMs).toBe("number");
  });

  it("rethrows the original error and logs a failure entry with its error code", async () => {
    const { ValidationError } = await import("@/platform/errors");
    await expect(withTiming("command", "create", async () => { throw new ValidationError("bad input"); })).rejects.toThrow("bad input");

    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ component: "command", operation: "create", outcome: "failure", errorCode: "VALIDATION" });
  });
});

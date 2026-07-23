import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/platform/observability/logger";

describe("structured logger", () => {
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

  it("emits a single JSON line with timestamp, level, and message", () => {
    logger.info("test.event", { requestId: "req-1", correlationId: "corr-1", component: "test", operation: "op" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", message: "test.event", requestId: "req-1", correlationId: "corr-1", component: "test", operation: "op" });
    expect(typeof parsed.timestamp).toBe("string");
    expect(() => new Date(parsed.timestamp).toISOString()).not.toThrow();
  });

  it("routes error-level entries to console.error", () => {
    logger.error("test.failure", { errorCode: "BOOM" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({ level: "error", errorCode: "BOOM" });
  });

  it("includes duration when provided", () => {
    logger.info("test.timed", { durationMs: 42 });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string).durationMs).toBe(42);
  });
});

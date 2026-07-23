import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { CORRELATION_ID_HEADER } from "@/platform/observability/request-context";

describe("correlation ID middleware", () => {
  it("attaches a generated correlation ID to the response", () => {
    const response = middleware(new NextRequest("http://localhost/people"));
    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates a fresh correlation ID on every request", () => {
    const first = middleware(new NextRequest("http://localhost/people")).headers.get(CORRELATION_ID_HEADER);
    const second = middleware(new NextRequest("http://localhost/people")).headers.get(CORRELATION_ID_HEADER);
    expect(first).not.toBe(second);
  });

  it("never trusts a client-supplied correlation ID header", () => {
    const request = new NextRequest("http://localhost/people", { headers: { [CORRELATION_ID_HEADER]: "browser-supplied-value" } });
    const response = middleware(request);
    expect(response.headers.get(CORRELATION_ID_HEADER)).not.toBe("browser-supplied-value");
  });

  it("forwards the correlation ID to downstream request headers, not just the response", () => {
    const request = new NextRequest("http://localhost/people");
    const response = middleware(request);
    const forwarded = response.headers.get("x-middleware-request-" + CORRELATION_ID_HEADER);
    expect(forwarded).toBe(response.headers.get(CORRELATION_ID_HEADER));
  });
});

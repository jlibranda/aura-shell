import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/platform/auth/safe-return-to";

describe("safeReturnTo", () => {
  it("honors an internal relative path", () => {
    expect(safeReturnTo("/people/hire")).toBe("/people/hire");
  });

  it("defaults to /home when nothing was supplied", () => {
    expect(safeReturnTo(undefined)).toBe("/home");
    expect(safeReturnTo(null)).toBe("/home");
    expect(safeReturnTo("")).toBe("/home");
  });

  it("refuses an absolute URL", () => {
    expect(safeReturnTo("https://evil.example.com/phish")).toBe("/home");
  });

  it("refuses a protocol-relative URL (open-redirect classic)", () => {
    expect(safeReturnTo("//evil.example.com")).toBe("/home");
  });

  it("refuses a value embedding a scheme anywhere", () => {
    expect(safeReturnTo("/redirect?next=javascript://evil")).toBe("/home");
  });

  it("refuses a value that doesn't start with a slash", () => {
    expect(safeReturnTo("evil.example.com")).toBe("/home");
  });

  it("refuses a backslash-based open-redirect trick", () => {
    expect(safeReturnTo("/\\evil.example.com")).toBe("/home");
  });
});

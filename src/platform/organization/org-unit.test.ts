import { describe, expect, it } from "vitest";
import {
  buildOrgUnitTree,
  collectDescendantIds,
  validateCreateOrgUnitDraft,
  wouldCreateCycle,
  type OrgUnitRecord,
} from "@/platform/organization/org-unit";

function unit(id: string, parentId?: string, name = id): OrgUnitRecord {
  return Object.freeze({
    id, tenantId: "t1", code: id.toUpperCase(), name, kind: "DEPARTMENT", ...(parentId ? { parentId } : {}),
    status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("validateCreateOrgUnitDraft", () => {
  it("accepts a valid draft and normalizes code (trim + uppercase) and name", () => {
    const result = validateCreateOrgUnitDraft({ code: " fin ", name: " Finance ", kind: "DEPARTMENT" });
    expect(result.success).toBe(true);
    if (result.success) { expect(result.data.code).toBe("FIN"); expect(result.data.name).toBe("Finance"); }
  });

  it("rejects a missing/blank name and code", () => {
    const result = validateCreateOrgUnitDraft({ code: "", name: "", kind: "DEPARTMENT" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.path.join(".") === "code" && i.code === "REQUIRED")).toBe(true);
      expect(result.issues.some((i) => i.path.join(".") === "name" && i.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects an unsupported kind", () => {
    const result = validateCreateOrgUnitDraft({ code: "X1", name: "X", kind: "GUILD" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((i) => i.path.join(".") === "kind" && i.code === "UNSUPPORTED")).toBe(true);
  });

  it("rejects a malformed code", () => {
    expect(validateCreateOrgUnitDraft({ code: "has space", name: "X", kind: "TEAM" }).success).toBe(false);
    expect(validateCreateOrgUnitDraft({ code: "-bad", name: "X", kind: "TEAM" }).success).toBe(false);
  });
});

describe("buildOrgUnitTree", () => {
  it("assembles a single-parent tree with roots and ordered children", () => {
    const units = [unit("a", undefined, "Alpha"), unit("b", "a", "Bravo"), unit("c", "a", "Charlie"), unit("d", "b", "Delta")];
    const tree = buildOrgUnitTree(units);
    expect(tree.map((n) => n.id)).toEqual(["a"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["b", "c"]); // ordered by name
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["d"]);
  });

  it("treats a unit whose parent is absent from the set as a root", () => {
    const tree = buildOrgUnitTree([unit("orphan", "missing")]);
    expect(tree.map((n) => n.id)).toEqual(["orphan"]);
  });
});

describe("collectDescendantIds / wouldCreateCycle", () => {
  const units = [unit("root"), unit("a", "root"), unit("b", "a"), unit("c", "b"), unit("x", "root")];

  it("collects all transitive descendants of a node", () => {
    expect([...collectDescendantIds(units, "a")].sort()).toEqual(["b", "c"]);
    expect([...collectDescendantIds(units, "c")]).toEqual([]);
  });

  it("detects a cycle when a node is moved under itself", () => {
    expect(wouldCreateCycle(units, "a", "a")).toBe(true);
  });

  it("detects a cycle when a node is moved under one of its descendants", () => {
    expect(wouldCreateCycle(units, "a", "c")).toBe(true); // c is under a
  });

  it("permits a move that does not create a cycle", () => {
    expect(wouldCreateCycle(units, "a", "x")).toBe(false); // x is a sibling subtree
    expect(wouldCreateCycle(units, "c", "x")).toBe(false);
  });
});

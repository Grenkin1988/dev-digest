import { describe, it, expect } from "vitest";
import type { ConventionView } from "@/lib/hooks/conventions";
import { buildSkillBody, defaultDescription, evidenceLabel, isSlug } from "./helpers";

function conv(id: string, over: Partial<ConventionView> = {}): ConventionView {
  return {
    id,
    rule: `rule ${id}`,
    evidence_path: `src/${id}.ts`,
    evidence_snippet: "x",
    confidence: 0.9,
    accepted: true,
    status: "accepted",
    category: "naming",
    start_line: 3,
    end_line: 5,
    ...over,
  };
}

describe("buildSkillBody", () => {
  it("groups rules by category and cites the evidence", () => {
    const body = buildSkillBody(
      [conv("a"), conv("b", { category: "errors" }), conv("c", { category: null, start_line: null, end_line: null })],
      "repo-conventions",
    );
    expect(body).toContain("# repo-conventions");
    expect(body).toContain("## naming\n\n- rule a\n  Detected in `src/a.ts:L3-L5`");
    expect(body).toContain("## errors");
    expect(body).toContain("## general\n\n- rule c\n  Detected in `src/c.ts`");
  });

  it("excludes unchecked and rejected candidates", () => {
    const body = buildSkillBody([conv("a"), conv("b"), conv("c", { status: "rejected" })], "n", new Set(["a", "c"]));
    expect(body).toContain("rule a");
    expect(body).not.toContain("rule b");
    expect(body).not.toContain("rule c");
  });
});

describe("small helpers", () => {
  it("validates slugs", () => {
    expect(isSlug("repo-conventions")).toBe(true);
    expect(isSlug("Repo Conventions")).toBe(false);
    expect(isSlug("-x")).toBe(false);
  });
  it("describes and labels", () => {
    expect(defaultDescription(3, "o/r")).toBe("3 house conventions extracted from o/r");
    expect(defaultDescription(1, "o/r")).toBe("1 house convention extracted from o/r");
    expect(evidenceLabel({ evidence_path: "a.ts", start_line: 2, end_line: 2 })).toBe("a.ts:L2");
  });
});

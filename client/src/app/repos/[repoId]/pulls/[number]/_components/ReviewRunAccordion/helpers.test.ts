import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { blockerCount, verdictColor, verdictLabelKey } from "./helpers";

const f = (severity: string, dismissed = false) =>
  ({ severity, dismissed_at: dismissed ? "2026-11-01T00:00:00Z" : null }) as FindingRecord;

describe("ReviewRunAccordion helpers", () => {
  it("counts non-dismissed CRITICAL findings as blockers", () => {
    expect(blockerCount([f("CRITICAL"), f("CRITICAL", true), f("WARNING")])).toBe(1);
  });

  it("maps verdicts to colours and i18n keys, with fallbacks", () => {
    expect(verdictColor("request_changes")).toBe("var(--crit)");
    expect(verdictColor("unknown")).toBe("var(--text-muted)");
    expect(verdictLabelKey("request_changes")).toBe("requestChanges");
    expect(verdictLabelKey(null)).toBeNull();
  });
});

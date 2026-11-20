import { describe, it, expect } from "vitest";
import { formatTokensCompact, formatTokensFull, formatUsd, hasUsage } from "./format-cost";

describe("formatUsd", () => {
  it("renders missing data as a dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("scales precision to the magnitude", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.06)).toBe("$0.060");
    expect(formatUsd(1.5)).toBe("$1.50");
  });

  it("a genuine zero (free model) is $0", () => {
    expect(formatUsd(0)).toBe("$0");
  });
});

describe("token formatting", () => {
  it("compacts to K/M", () => {
    expect(formatTokensCompact(950)).toBe("950");
    expect(formatTokensCompact(8200)).toBe("8.2K");
    expect(formatTokensCompact(1000)).toBe("1K");
    expect(formatTokensCompact(12011)).toBe("12K");
    expect(formatTokensCompact(1_300_000)).toBe("1.3M");
  });

  it("groups full counts", () => {
    expect(formatTokensFull(9119)).toBe("9,119");
  });

  it("hasUsage is false only when there is neither cost nor tokens", () => {
    expect(hasUsage(null, 0, 0)).toBe(false);
    expect(hasUsage(null, 10, 0)).toBe(true);
    expect(hasUsage(0, 0, 0)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { canSaveImport, checkFile, formFromPreview, toBase64 } from "./helpers";

describe("checkFile", () => {
  it("accepts markdown and zip within the size cap", () => {
    expect(checkFile({ name: "rule.md", size: 10 })).toBe("ok");
    expect(checkFile({ name: "Pack.ZIP", size: 10 })).toBe("ok");
  });
  it("rejects other types and oversized files", () => {
    expect(checkFile({ name: "run.sh", size: 10 })).toBe("badType");
    expect(checkFile({ name: "big.zip", size: 3 * 1024 * 1024 })).toBe("tooLarge");
  });
});

describe("toBase64", () => {
  it("encodes bytes", () => {
    expect(toBase64(new TextEncoder().encode("hello").buffer)).toBe("aGVsbG8=");
  });
  it("handles more than one chunk", () => {
    const big = new Uint8Array(0x8000 * 2 + 5).fill(65);
    expect(atob(toBase64(big.buffer)).length).toBe(big.length);
  });
});

describe("import form", () => {
  it("takes name, description and type from the preview and needs the first two to save", () => {
    const form = formFromPreview({
      name: "n",
      description: "",
      type: "custom",
      body: "b",
      ignored_files: [],
      warnings: [],
      name_conflict: false,
    });
    expect(form).toEqual({ name: "n", description: "", type: "custom" });
    expect(canSaveImport(form)).toBe(false);
    expect(canSaveImport({ ...form, description: "d" })).toBe(true);
  });
});

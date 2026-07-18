import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * NumberEditorInput / TextEditorInput commit rules (mirrors component logic).
 */
function parseNumberInput(raw: string, integer: boolean): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = integer ? parseInt(trimmed, 10) : Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function isValidNumber(n: number, min?: number, max?: number, integer = true): boolean {
  if (min != null && n < min) return false;
  if (max != null && n > max) return false;
  if (integer && !Number.isInteger(n)) return false;
  return true;
}

function commitNumberBlur(args: {
  text: string;
  value: number | null;
  nullable?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
}): { committed: number | null | undefined; display: string } {
  const { text, value, nullable = false, min, max, integer = true } = args;
  const trimmed = text.trim();
  if (!trimmed) {
    if (nullable) return { committed: null, display: "" };
    return { committed: undefined, display: value == null ? "" : String(value) };
  }
  const parsed = parseNumberInput(trimmed, integer);
  if (parsed != null && isValidNumber(parsed, min, max, integer)) {
    return { committed: parsed, display: String(parsed) };
  }
  return { committed: undefined, display: value == null ? "" : String(value) };
}

function commitTextBlur(args: {
  text: string;
  value: string;
  allowEmpty?: boolean;
  validate?: (raw: string) => boolean;
}): { committed: string | undefined; display: string } {
  const { text, value, allowEmpty = true, validate } = args;
  const trimmed = text.trim();
  if (!trimmed) {
    if (allowEmpty) return { committed: "", display: "" };
    return { committed: undefined, display: value };
  }
  if (validate && !validate(trimmed)) {
    return { committed: undefined, display: value };
  }
  return { committed: trimmed, display: trimmed };
}

describe("NumberEditorInput commit rules", () => {
  it("reverts empty blur when not nullable", () => {
    const result = commitNumberBlur({ text: "", value: 42 });
    assert.equal(result.committed, undefined);
    assert.equal(result.display, "42");
  });

  it("commits null on empty blur when nullable", () => {
    const result = commitNumberBlur({ text: "  ", value: 42, nullable: true });
    assert.equal(result.committed, null);
    assert.equal(result.display, "");
  });

  it("commits valid integer on blur", () => {
    const result = commitNumberBlur({ text: "15", value: 10, min: 1, max: 99 });
    assert.equal(result.committed, 15);
    assert.equal(result.display, "15");
  });

  it("reverts invalid blur", () => {
    const result = commitNumberBlur({ text: "abc", value: 10 });
    assert.equal(result.committed, undefined);
    assert.equal(result.display, "10");
  });

  it("reverts out-of-range blur", () => {
    const result = commitNumberBlur({ text: "150", value: 60, min: 1, max: 100 });
    assert.equal(result.committed, undefined);
    assert.equal(result.display, "60");
  });

  it("accepts decimals when integer is false", () => {
    const result = commitNumberBlur({
      text: "12.5",
      value: 10,
      integer: false,
      min: 0,
    });
    assert.equal(result.committed, 12.5);
  });

  it("truncates decimals via parseInt when integer is true", () => {
    const result = commitNumberBlur({ text: "12.5", value: 10, integer: true });
    assert.equal(result.committed, 12);
    assert.equal(result.display, "12");
  });
});

describe("TextEditorInput commit rules", () => {
  it("commits trimmed text on blur", () => {
    const result = commitTextBlur({ text: "  60  ", value: "45" });
    assert.equal(result.committed, "60");
    assert.equal(result.display, "60");
  });

  it("reverts empty blur when allowEmpty is false", () => {
    const result = commitTextBlur({ text: "", value: "45", allowEmpty: false });
    assert.equal(result.committed, undefined);
    assert.equal(result.display, "45");
  });

  it("reverts when validate fails", () => {
    const result = commitTextBlur({
      text: "bad",
      value: "5:00",
      validate: (raw) => /^\d+:\d{2}$/.test(raw),
    });
    assert.equal(result.committed, undefined);
    assert.equal(result.display, "5:00");
  });
});

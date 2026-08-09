import { describe, expect, it } from "vitest";
import { validateAzureOutput, validateIdOutput } from "../../src/providers/validation.js";

describe("strict provider output", () => {
  it("accepts only unique requested IDs with non-empty text while retaining partial valid results", () => {
    const output = validateIdOutput(["c1", "c2", "c3"], {
      translations: [
        { id: "c1", text: "one" },
        { id: "unknown", text: "bad" },
        { id: "c2", text: "" },
        { id: "c3", text: "first" },
        { id: "c3", text: "duplicate" },
      ],
    });
    expect(output.translations).toEqual([{ id: "c1", text: "one" }]);
    expect(output.missingIds.sort()).toEqual(["c2", "c3"]);
  });

  it("rejects malformed/refusal JSON and preserves sanitized usage only", () => {
    expect(() => validateIdOutput(["c1"], "not-json")).toThrow(/MALFORMED_PROVIDER_OUTPUT/);
    expect(() => validateIdOutput(["c1"], { refusal: "policy" })).toThrow(/PROVIDER_REFUSAL/);
    expect(
      validateIdOutput(["c1"], {
        translations: [{ id: "c1", text: "one" }],
        usage: { input: 3, output: 4, secret: "drop" },
      }).usage,
    ).toEqual({ input: 3, output: 4 });
  });

  it("accepts Azure only with exact positional count and shape", () => {
    expect(validateAzureOutput(["c1"], { value: [{ translations: [{ text: "one" }] }] })).toEqual([
      { id: "c1", text: "one" },
    ]);
    expect(() =>
      validateAzureOutput(["c1", "c2"], { value: [{ translations: [{ text: "one" }] }] }),
    ).toThrow(/AZURE_POSITIONAL_MISMATCH/);
  });
});

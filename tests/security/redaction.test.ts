import { describe, expect, it } from "vitest";
import { diagnostic, safeRequestId } from "../../src/domain/logging.js";

describe("allowlist-only diagnostics", () => {
  it("copies safe metadata and drops bodies, headers, credentials and subtitle text", () => {
    const output = diagnostic({
      code: "PROVIDER_HTTP",
      category: "http",
      statusCode: 503,
      requestId: "req-123",
      authorization: "Bearer secret",
      body: "private subtitle",
      credential: "key-value",
    });
    expect(output).toEqual({
      code: "PROVIDER_HTTP",
      category: "http",
      statusCode: 503,
      requestId: "req-123",
    });
    expect(JSON.stringify(output)).not.toContain("secret");
    expect(JSON.stringify(output)).not.toContain("subtitle");
  });

  it("sanitizes provider request IDs", () => {
    expect(safeRequestId("safe_Request-42.abc")).toBe("safe_Request-42.abc");
    expect(safeRequestId("bad\nAuthorization: secret")).toBeUndefined();
  });
});

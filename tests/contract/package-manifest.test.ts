import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("IINA package manifest", () => {
  it("declares the player and global entry fields understood by IINA", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../Info.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.entry).toBe("dist/main.js");
    expect(manifest.globalEntry).toBe("dist/global.js");
    expect(manifest).not.toHaveProperty("global");
    expect(manifest.permissions).toEqual(["network-request", "file-system", "show-alert"]);
  });
});

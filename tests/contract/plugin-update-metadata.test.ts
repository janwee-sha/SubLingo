import { describe, expect, it } from "vitest";

import {
  expectedGithubVersion,
  validatePluginUpdateMetadata,
} from "../../scripts/plugin-update-metadata.mjs";

const validManifest = {
  version: "0.3.3",
  ghRepo: "janwee-sha/SubLingo",
  ghVersion: 3003,
};

describe("plugin update metadata", () => {
  it("derives a strictly ordered IINA update version from stable SemVer", () => {
    expect(expectedGithubVersion("0.3.2")).toBe(3002);
    expect(expectedGithubVersion("0.3.3")).toBe(3003);
    expect(expectedGithubVersion("0.4.0")).toBe(4000);
    expect(expectedGithubVersion("1.0.0")).toBe(1_000_000);
  });

  it("accepts the canonical SubLingo 0.3.3 update identity", () => {
    expect(validatePluginUpdateMetadata(validManifest)).toEqual({
      githubRepository: "janwee-sha/SubLingo",
      githubVersion: 3003,
    });
  });

  it.each([
    ["version", undefined],
    ["version", "0.3.3-rc.1"],
    ["version", "0.1000.0"],
    ["ghRepo", undefined],
    ["ghRepo", "another/repository"],
    ["ghVersion", undefined],
    ["ghVersion", 0],
    ["ghVersion", 3002],
    ["ghVersion", 3003.5],
    ["ghVersion", "3003"],
  ])("rejects invalid %s metadata", (field, value) => {
    expect(() => validatePluginUpdateMetadata({ ...validManifest, [field]: value })).toThrow(
      /version|repository|ghVersion|update/i,
    );
  });
});

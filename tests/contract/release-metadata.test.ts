import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readReleaseMetadata, validateReleaseMetadata } from "../../scripts/release-metadata.mjs";

const validInput = {
  infoVersion: "0.1.0",
  packageVersion: "0.1.0",
  lockVersion: "0.1.0",
  lockRootVersion: "0.1.0",
  packageLicense: "GPL-3.0-only",
  lockRootLicense: "GPL-3.0-only",
  licenseText: "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007",
  readme: [
    "[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)]",
    "(https://github.com/janwee-sha/SubLingo/blob/main/LICENSE)",
  ].join(""),
  packScript: [
    'ARTIFACT="$STAGE_PARENT/SubLingo-0.1.0.iinaplgz"',
    '"$ROOT_DIR"/build/package/SubLingo-0.1.0.iinaplgz) ;;',
  ].join("\n"),
};

describe("release metadata", () => {
  it("derives the immutable release identity from matching project versions", () => {
    expect(validateReleaseMetadata(validInput)).toEqual({
      version: "0.1.0",
      tag: "v0.1.0",
      artifactName: "SubLingo-0.1.0.iinaplgz",
      artifactPath: "build/package/SubLingo-0.1.0.iinaplgz",
      license: "GPL-3.0-only",
    });
  });

  it.each(["1", "1.2", "01.2.3", "1.2.3-rc.1", "v1.2.3", "1.2.3+build"])(
    "rejects non-stable version %s",
    (version) => {
      expect(() => validateReleaseMetadata({ ...validInput, infoVersion: version })).toThrow(
        /stable SemVer/,
      );
    },
  );

  it.each([
    ["Info.json", "infoVersion"],
    ["package.json", "packageVersion"],
    ["package-lock.json", "lockVersion"],
    ['package-lock.json packages[""].version', "lockRootVersion"],
  ] as const)("rejects a mismatched %s version", (_, field) => {
    expect(() => validateReleaseMetadata({ ...validInput, [field]: "0.2.0" })).toThrow(
      /version mismatch/,
    );
  });

  it("rejects an artifact path that uses another version", () => {
    expect(() =>
      validateReleaseMetadata({
        ...validInput,
        packScript: validInput.packScript.replaceAll("0.1.0", "0.2.0"),
      }),
    ).toThrow(/pack script/);
  });

  it.each([
    ["package.json", "packageLicense"],
    ['package-lock.json packages[""].license', "lockRootLicense"],
  ] as const)("rejects a mismatched %s license", (_, field) => {
    expect(() => validateReleaseMetadata({ ...validInput, [field]: "MIT" })).toThrow(
      /license mismatch/,
    );
  });

  it("requires the standard GPL v3 text and repository badge", () => {
    expect(() => validateReleaseMetadata({ ...validInput, licenseText: "modified" })).toThrow(
      /GPL v3/,
    );
    expect(() => validateReleaseMetadata({ ...validInput, readme: "missing" })).toThrow(
      /license badge/,
    );
  });

  it("keeps repository license sources consistent", () => {
    const metadata = readReleaseMetadata(fileURLToPath(new URL("../../", import.meta.url)));
    expect(metadata.license).toBe("GPL-3.0-only");
  });
});

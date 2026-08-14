import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildReleaseNotes,
  validateArchiveEntries,
  validateArtifactIdentity,
  validateHelperFacts,
} from "../../scripts/audit-release.mjs";

const regularMode = 0o100644;
const executableMode = 0o100755;

const validEntries = [
  { name: "Info.json", unixMode: regularMode, encrypted: false },
  { name: "README.md", unixMode: regularMode, encrypted: false },
  { name: "LICENSE", unixMode: regularMode, encrypted: false },
  { name: "THIRD_PARTY_NOTICES.txt", unixMode: regularMode, encrypted: false },
  { name: "dist/", unixMode: 0o040755, encrypted: false },
  { name: "dist/main.js", unixMode: regularMode, encrypted: false },
  { name: "dist/global.js", unixMode: regularMode, encrypted: false },
  {
    name: "dist/ui/sidebar.html",
    unixMode: regularMode,
    encrypted: false,
  },
  {
    name: "dist/native/sublingo-transport",
    unixMode: executableMode,
    encrypted: false,
  },
];

describe("release archive audit", () => {
  it("loads in the supported Node.js runtime", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/audit-release.mjs", import.meta.url))],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required option");
    expect(result.stderr).not.toContain("SyntaxError");
  });

  it("accepts the minimal runtime archive", () => {
    expect(validateArchiveEntries(validEntries).map((entry) => entry.name)).toEqual(
      validEntries.map((entry) => entry.name),
    );
  });

  it.each(["LICENSE", "THIRD_PARTY_NOTICES.txt"])("requires compliance file %s", (name) => {
    expect(() =>
      validateArchiveEntries(validEntries.filter((entry) => entry.name !== name)),
    ).toThrow(/required archive entry/i);
  });

  it("rejects a compliance file that differs from its repository source", () => {
    const entries = validEntries.map((entry) =>
      entry.name === "LICENSE" ? { ...entry, content: "modified" } : entry,
    );
    expect(() => validateArchiveEntries(entries, { LICENSE: "expected" })).toThrow(
      /compliance file/i,
    );
  });

  it.each([
    "../Info.json",
    "/Info.json",
    "dist/../Info.json",
    "dist\\main.js",
    "dist//main.js",
    "dist/./main.js",
    "dist/bad\nname",
  ])("rejects unsafe path %s", (name) => {
    expect(() =>
      validateArchiveEntries([...validEntries, { name, unixMode: regularMode }]),
    ).toThrow(/unsafe archive path/i);
  });

  it.each([
    "package.json",
    "dist/src/main.ts",
    "dist/tests/main.test.js",
    "dist/node_modules/module/index.js",
    "dist/main.js.map",
    "dist/.env",
    "dist/credentials.json",
    "dist/private.key",
    "dist/@data/cache.json",
  ])("rejects forbidden archive entry %s", (name) => {
    expect(() =>
      validateArchiveEntries([...validEntries, { name, unixMode: regularMode }]),
    ).toThrow(/forbidden archive entry|root entry/i);
  });

  it("rejects paths that collide on a case-insensitive filesystem", () => {
    expect(() =>
      validateArchiveEntries([...validEntries, { name: "dist/Main.js", unixMode: regularMode }]),
    ).toThrow(/duplicate archive entry/i);
  });

  it("rejects symbolic links before extraction", () => {
    expect(() =>
      validateArchiveEntries([...validEntries, { name: "dist/link", unixMode: 0o120777 }]),
    ).toThrow(/symbolic link/);
  });

  it("rejects encrypted entries", () => {
    expect(() =>
      validateArchiveEntries([
        ...validEntries,
        { name: "dist/secret", unixMode: regularMode, encrypted: true },
      ]),
    ).toThrow(/encrypted/i);
  });

  it("rejects artifact name or package version drift", () => {
    expect(() =>
      validateArtifactIdentity({
        artifactName: "SubLingo-0.2.0.iinaplgz",
        packageVersion: "0.1.0",
        expectedVersion: "0.1.0",
      }),
    ).toThrow(/artifact name/);
    expect(() =>
      validateArtifactIdentity({
        artifactName: "SubLingo-0.1.0.iinaplgz",
        packageVersion: "0.2.0",
        expectedVersion: "0.1.0",
      }),
    ).toThrow(/package version/);
  });

  it.each([
    { architectures: ["arm64"], executable: true, signed: true },
    { architectures: ["arm64", "x86_64"], executable: false, signed: true },
    { architectures: ["arm64", "x86_64"], executable: true, signed: false },
  ])("rejects missing native helper properties", (facts) => {
    expect(() => validateHelperFacts("package helper", facts)).toThrow();
  });

  it("builds Chinese evidence with all gates and explicit host limitations", () => {
    const notes = buildReleaseNotes({
      version: "0.1.0",
      commit: "a".repeat(40),
      packageVersion: "0.1.0",
      artifactName: "SubLingo-0.1.0.iinaplgz",
      byteSize: 42,
      sha256: "b".repeat(64),
      entries: validEntries.map((entry) => entry.name),
      gates: {
        test: true,
        typecheck: true,
        lint: true,
        buildNative: true,
        testNative: true,
        build: true,
        verifyPackage: true,
        pack: true,
      },
      buildHelper: {
        architectures: ["arm64", "x86_64"],
        executable: true,
        signed: true,
        signature: "adhoc",
      },
      packageHelper: {
        architectures: ["arm64", "x86_64"],
        executable: true,
        signed: true,
        signature: "adhoc",
      },
    });

    expect(notes.match(/通过/g)).toHaveLength(8);
    expect(notes).toContain("真实安装：CI 未覆盖");
    expect(notes).toContain("真实卸载：CI 未覆盖");
    expect(notes).toContain("实际播放：CI 未覆盖");
  });
});

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildReleaseNotes,
  parseOtoolDependencies,
  validateArchiveEntries,
  validateArtifactIdentity,
  validateFFmpegSource,
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
  {
    name: "dist/native/sublingo-subtitle-extractor",
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

  it("requires both exact native executables", () => {
    expect(() =>
      validateArchiveEntries(
        validEntries.filter((entry) => entry.name !== "dist/native/sublingo-subtitle-extractor"),
      ),
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
    {
      architectures: ["arm64"],
      minimumMacos: ["12.0"],
      executable: true,
      signed: true,
      dependencies: [],
      sha256: "a".repeat(64),
    },
    {
      architectures: ["arm64", "x86_64"],
      minimumMacos: ["12.0"],
      executable: false,
      signed: true,
      dependencies: [],
      sha256: "a".repeat(64),
    },
    {
      architectures: ["arm64", "x86_64"],
      minimumMacos: ["12.0"],
      executable: true,
      signed: false,
      dependencies: [],
      sha256: "a".repeat(64),
    },
    {
      architectures: ["arm64", "x86_64"],
      minimumMacos: ["13.0"],
      executable: true,
      signed: true,
      dependencies: [],
      sha256: "a".repeat(64),
    },
    {
      architectures: ["arm64", "x86_64"],
      minimumMacos: ["12.0"],
      executable: true,
      signed: true,
      dependencies: ["/private/libffmpeg.dylib"],
      sha256: "a".repeat(64),
    },
  ])("rejects missing native helper properties", (facts) => {
    expect(() => validateHelperFacts("package helper", facts)).toThrow();
  });

  it("ignores absolute universal-binary headers when parsing dynamic dependencies", () => {
    expect(
      parseOtoolDependencies(
        [
          "/tmp/sublingo-transport (architecture x86_64):",
          "\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)",
          "/tmp/sublingo-transport (architecture arm64):",
          "\t/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation (compatibility version 300.0.0)",
        ].join("\n"),
      ),
    ).toEqual([
      "/usr/lib/libSystem.B.dylib",
      "/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation",
    ]);
  });

  it("validates the lock-named FFmpeg source and digest", () => {
    const source = Buffer.from("locked source");
    const lock = {
      version: "8.1.2",
      sourceAssetName: "ffmpeg-8.1.2.tar.xz",
      sha256: createHash("sha256").update(source).digest("hex"),
      license: "LGPL-2.1-or-later",
      sourceDistribution: {
        assetName: "ffmpeg-8.1.2.tar.xz",
        checksumAssetName: "ffmpeg-8.1.2.tar.xz.sha256",
      },
    };
    expect(validateFFmpegSource(lock, "ffmpeg-8.1.2.tar.xz", source)).toMatchObject({
      version: "8.1.2",
      assetName: "ffmpeg-8.1.2.tar.xz",
      checksumAssetName: "ffmpeg-8.1.2.tar.xz.sha256",
      sha256: lock.sha256,
    });
    expect(() => validateFFmpegSource(lock, "ffmpeg-8.1.2.tar.xz", Buffer.from("drift"))).toThrow(
      /FFmpeg source/i,
    );
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
      buildHelpers: {
        "sublingo-transport": helperFacts("c"),
        "sublingo-subtitle-extractor": helperFacts("d"),
      },
      packageHelpers: {
        "sublingo-transport": helperFacts("c"),
        "sublingo-subtitle-extractor": helperFacts("d"),
      },
      ffmpeg: {
        version: "8.1.2",
        license: "LGPL-2.1-or-later",
        assetName: "ffmpeg-8.1.2.tar.xz",
        checksumAssetName: "ffmpeg-8.1.2.tar.xz.sha256",
        sha256: "e".repeat(64),
      },
    });

    expect(notes.match(/通过/g)).toHaveLength(8);
    expect(notes).toContain("真实安装：CI 未覆盖");
    expect(notes).toContain("真实卸载：CI 未覆盖");
    expect(notes).toContain("实际播放：CI 未覆盖");
    expect(notes).toContain("## 自愿支持");
    expect(notes).toContain("https://ko-fi.com/ianhsia");
    expect(notes).toContain(
      "https://www.ifdian.net/item/ea1ff37a97ed11f19a9f52540025c377?utm_source=copylink&utm_medium=link",
    );
    expect(notes).toContain("免费完整使用");
    expect(notes).toContain("不会解锁额外功能、优先翻译或专属版本");
    expect(notes).toContain("不包含翻译服务 API 额度");
    expect(notes).toContain("sublingo-transport");
    expect(notes).toContain("sublingo-subtitle-extractor");
    expect(notes).toContain("ffmpeg-8.1.2.tar.xz");
  });
});

function helperFacts(seed: string) {
  return {
    architectures: ["arm64", "x86_64"],
    minimumMacos: ["12.0"],
    executable: true,
    signed: true,
    signature: "adhoc",
    dependencies: ["/usr/lib/libSystem.B.dylib"],
    sha256: seed.repeat(64),
  };
}

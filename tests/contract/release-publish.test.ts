import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertPublishedRelease,
  decideReleaseAction,
  planAssetOperations,
} from "../../scripts/publish-release.mjs";

const commit = "a".repeat(40);
const body = "release evidence";

describe("release publication state", () => {
  it("loads in the supported Node.js runtime", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/publish-release.mjs", import.meta.url))],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required option");
    expect(result.stderr).not.toContain("SyntaxError");
  });

  it("creates a draft for a new version", () => {
    expect(
      decideReleaseAction({
        release: undefined,
        tagCommit: undefined,
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toEqual({ kind: "create", useExistingTag: false });
  });

  it("uses an existing tag only when it points to the triggering commit", () => {
    expect(
      decideReleaseAction({
        release: undefined,
        tagCommit: commit,
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toEqual({ kind: "create", useExistingTag: true });
    expect(() =>
      decideReleaseAction({
        release: undefined,
        tagCommit: "b".repeat(40),
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toThrow(/tag target/);
  });

  it("skips a published stable release without comparing a later commit", () => {
    expect(
      decideReleaseAction({
        release: {
          id: 1,
          draft: false,
          prerelease: false,
          targetCommitish: "older-main-commit",
          body: "existing body",
          assets: [],
        },
        tagCommit: "b".repeat(40),
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toEqual({ kind: "skip" });
  });

  it("resumes only a matching stable draft", () => {
    expect(
      decideReleaseAction({
        release: {
          id: 1,
          draft: true,
          prerelease: false,
          targetCommitish: commit,
          body,
          assets: [],
        },
        tagCommit: undefined,
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toEqual({ kind: "resume", releaseId: 1 });
  });

  it.each([
    { targetCommitish: "b".repeat(40), body, prerelease: false },
    { targetCommitish: commit, body: "different", prerelease: false },
    { targetCommitish: commit, body, prerelease: true },
  ])("rejects a conflicting draft", (draft) => {
    expect(() =>
      decideReleaseAction({
        release: { id: 1, draft: true, assets: [], ...draft },
        tagCommit: undefined,
        expectedCommit: commit,
        expectedBody: body,
      }),
    ).toThrow(/draft|prerelease/i);
  });

  it("reuses identical assets, uploads missing assets, and never overwrites", () => {
    expect(
      planAssetOperations(
        [
          { name: "SubLingo-0.1.0.iinaplgz", sha256: "a".repeat(64) },
          { name: "SubLingo-0.1.0.iinaplgz.sha256", sha256: "b".repeat(64) },
        ],
        [{ name: "SubLingo-0.1.0.iinaplgz", sha256: "a".repeat(64) }],
      ),
    ).toEqual([
      { kind: "reuse", name: "SubLingo-0.1.0.iinaplgz" },
      { kind: "upload", name: "SubLingo-0.1.0.iinaplgz.sha256" },
    ]);

    expect(() =>
      planAssetOperations(
        [{ name: "SubLingo-0.1.0.iinaplgz", sha256: "a".repeat(64) }],
        [{ name: "SubLingo-0.1.0.iinaplgz", sha256: "c".repeat(64) }],
      ),
    ).toThrow(/asset content/);
  });

  it("rejects unexpected draft assets", () => {
    expect(() =>
      planAssetOperations(
        [{ name: "SubLingo-0.1.0.iinaplgz", sha256: "a".repeat(64) }],
        [{ name: "unexpected.txt", sha256: "a".repeat(64) }],
      ),
    ).toThrow(/unexpected asset/i);
  });

  it("requires the published release and tag to match the triggering commit", () => {
    expect(() =>
      assertPublishedRelease({ draft: false, prerelease: false }, "b".repeat(40), commit),
    ).toThrow(/published tag/i);
    expect(() =>
      assertPublishedRelease({ draft: true, prerelease: false }, commit, commit),
    ).toThrow(/not public/);
    expect(() =>
      assertPublishedRelease({ id: 1, draft: false, prerelease: false }, commit, commit, 2),
    ).toThrow(/not Latest/);
  });
});

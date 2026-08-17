import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertPublishedRelease,
  decideReleaseAction,
  hasExpectedAssetNames,
  isPublishedStateReady,
  planAssetOperations,
  pollRemoteState,
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

  it("waits for a newly created draft to become visible", async () => {
    const states = [undefined, { id: 1, draft: true }];
    const pauses: number[] = [];
    const result = await pollRemoteState(() => states.shift(), Boolean, {
      retryDelays: [0, 10],
      pause: async (milliseconds: number) => {
        pauses.push(milliseconds);
      },
    });

    expect(result).toEqual({ matched: true, state: { id: 1, draft: true } });
    expect(pauses).toEqual([10]);
  });

  it("waits for uploaded assets to become visible", async () => {
    const expectedAssets = [{ name: "archive" }, { name: "checksum" }];
    const states = [{ assets: [] }, { assets: [{ name: "archive" }, { name: "checksum" }] }];
    const result = await pollRemoteState(
      () => states.shift(),
      (release) => hasExpectedAssetNames(release, expectedAssets),
      { retryDelays: [0, 0] },
    );

    expect(result.matched).toBe(true);
  });

  it("waits for the public release, tag and Latest state to converge", async () => {
    const states = [
      {
        release: { id: 1, draft: true },
        tagCommit: undefined,
        latestReleaseId: undefined,
      },
      {
        release: { id: 1, draft: false },
        tagCommit: commit,
        latestReleaseId: 1,
      },
    ];
    const result = await pollRemoteState(
      () => states.shift(),
      (state) => isPublishedStateReady(state, commit),
      { retryDelays: [0, 0] },
    );

    expect(result.matched).toBe(true);
  });

  it("stops after the configured remote-state retries", async () => {
    const pauses: number[] = [];
    let attempts = 0;
    const result = await pollRemoteState(
      () => {
        attempts += 1;
        return undefined;
      },
      Boolean,
      {
        retryDelays: [0, 10, 20],
        pause: async (milliseconds: number) => {
          pauses.push(milliseconds);
        },
      },
    );

    expect(result).toEqual({ matched: false, state: undefined });
    expect(attempts).toBe(3);
    expect(pauses).toEqual([10, 20]);
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

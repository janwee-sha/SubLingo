import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("../../ui/sidebar-state.js");
});

function createState() {
  return globalThis.createSubLingoSidebarState([
    { profileId: "deleted", revision: 2 },
    { profileId: "retained", revision: 1 },
  ]);
}

describe("Sidebar authoritative profile deletion", () => {
  it("filters immediately, records a tombstone and clears every matching transient state", () => {
    const state = createState();
    state.setProfileContext({
      editingProfileId: "deleted",
      selectedProfileId: "deleted",
      credentialDisplayProfileId: "deleted",
    });
    state.setProfileTest("deleted", { revision: 2, state: "passed" });
    state.beginOperation({
      requestId: "delete-request",
      regionId: "profile-row:deleted",
      actionId: "delete",
      profileId: "deleted",
    });

    const result = state.deleteSucceeded({
      requestId: "delete-request",
      profileId: "deleted",
      message: "Profile and saved credential deleted.",
    });

    expect(result.createdResultSlot).toBe(true);
    expect(state.snapshot.profiles.map((profile) => profile.profileId)).toEqual(["retained"]);
    expect(state.snapshot.deletedProfileIds).toEqual(["deleted"]);
    expect(state.snapshot.editingProfileId).toBeNull();
    expect(state.snapshot.selectedProfileId).toBeNull();
    expect(state.snapshot.credentialDisplayProfileId).toBeNull();
    expect(state.snapshot.profileTests.deleted).toBeUndefined();
    expect(state.snapshot.requests["delete-request"]).toBeUndefined();
    expect(state.snapshot.deletedResults).toHaveLength(1);
  });

  it("filters late snapshots and treats repeated success as idempotent", () => {
    const state = createState();
    state.beginOperation({
      requestId: "delete-request",
      regionId: "profile-row:deleted",
      actionId: "delete",
      profileId: "deleted",
    });
    state.deleteSucceeded({ requestId: "delete-request", profileId: "deleted", message: "Done" });
    state.applyProfiles([
      { profileId: "deleted", revision: 2 },
      { profileId: "retained", revision: 2 },
    ]);
    state.deleteSucceeded({ requestId: "delete-request", profileId: "deleted", message: "Done" });

    expect(state.snapshot.profiles).toEqual([{ profileId: "retained", revision: 2 }]);
    expect(state.snapshot.deletedProfileIds).toEqual(["deleted"]);
    expect(state.snapshot.deletedResults).toHaveLength(1);
  });

  it("does not create a success slot for another window without a local request", () => {
    const state = createState();
    const result = state.deleteSucceeded({
      requestId: "other-window-request",
      profileId: "deleted",
      message: "Done",
    });

    expect(result.createdResultSlot).toBe(false);
    expect(state.snapshot.profiles.map((profile) => profile.profileId)).toEqual(["retained"]);
    expect(state.snapshot.deletedResults).toEqual([]);
  });

  it.each(["cancelled", "error"] as const)("retains business state after %s", (phase) => {
    const state = createState();
    state.setProfileContext({ editingProfileId: "deleted", selectedProfileId: "deleted" });
    state.beginOperation({
      requestId: "delete-request",
      regionId: "profile-row:deleted",
      actionId: "delete",
      profileId: "deleted",
    });
    state.finishOperation("delete-request", phase, "Not deleted");

    expect(state.snapshot.profiles.map((profile) => profile.profileId)).toEqual([
      "deleted",
      "retained",
    ]);
    expect(state.snapshot.editingProfileId).toBe("deleted");
    expect(state.snapshot.selectedProfileId).toBe("deleted");
  });
});

describe("Sidebar operation feedback ownership", () => {
  it("keeps regional request ownership while exposing only the latest global message", () => {
    const state = createState();
    const regions = [
      "translation-toggle",
      "language-settings",
      "profile-editor",
      "profile-row:retained",
      "subtitle-retry",
    ];
    for (const [index, regionId] of regions.entries()) {
      state.beginOperation(
        { requestId: `request-${regionId}`, regionId, actionId: regionId },
        "Busy",
        index * 10,
      );
      expect(state.snapshot.activeFeedback).toMatchObject({
        requestId: `request-${regionId}`,
        regionId,
        phase: "busy",
        message: "Busy",
        expiresAt: index * 10 + 1_000,
      });
    }
    expect(Object.keys(state.snapshot.latestRequestByRegion)).toHaveLength(5);
    expect(state.snapshot.activeFeedback?.regionId).toBe("subtitle-retry");

    state.beginOperation(
      {
        requestId: "new-editor-request",
        regionId: "profile-editor",
        actionId: "save-profile",
      },
      "Saving",
      100,
    );
    expect(state.finishOperation("request-profile-editor", "success", "Old").accepted).toBe(false);
    expect(state.snapshot.latestRequestByRegion["profile-editor"]).toMatchObject({
      requestId: "new-editor-request",
      actionId: "save-profile",
    });
    expect(state.snapshot.activeFeedback).toMatchObject({
      requestId: "new-editor-request",
      phase: "busy",
      message: "Saving",
    });
    expect(state.finishOperation("new-editor-request", "success", "Saved", 250).accepted).toBe(
      true,
    );
    expect(state.snapshot.activeFeedback).toMatchObject({
      regionId: "profile-editor",
      phase: "success",
      message: "Saved",
      expiresAt: 1_250,
    });
  });

  it("gives busy and terminal writes distinct expiry identities", () => {
    const state = createState();
    state.beginOperation(
      {
        requestId: "test-request",
        regionId: "profile-row:retained",
        actionId: "test",
        profileId: "retained",
        revision: 1,
      },
      "Testing",
      100,
    );
    const busyMessageId = state.snapshot.activeFeedback?.messageId;

    expect(state.snapshot.requests["test-request"]).toMatchObject({
      actionId: "test",
      profileId: "retained",
    });
    expect(state.finishOperation("unknown", "error", "Unknown").accepted).toBe(false);
    expect(state.finishOperation("test-request", "success", "Passed", 500).accepted).toBe(true);
    const terminalMessageId = state.snapshot.activeFeedback?.messageId;
    expect(terminalMessageId).not.toBe(busyMessageId);
    expect(state.snapshot.activeFeedback?.expiresAt).toBe(1_500);
    expect(state.expireFeedback(busyMessageId!)).toBe(false);
    expect(state.snapshot.activeFeedback?.message).toBe("Passed");
    expect(state.finishOperation("test-request", "error", "Duplicate").accepted).toBe(false);
    expect(state.snapshot.activeFeedback).toMatchObject({
      actionId: "test",
      phase: "success",
      message: "Passed",
    });
    expect(state.expireFeedback(terminalMessageId!)).toBe(true);
    expect(state.snapshot.activeFeedback).toBeNull();
  });

  it("expires a busy message without clearing its pending request or busy ownership", () => {
    const state = createState();
    state.setProfileContext({
      editingProfileId: "retained",
      selectedProfileId: "retained",
      credentialDisplayProfileId: "retained",
    });
    state.setProfileTest("retained", { revision: 1, state: "passed" });
    state.beginProfileSave("profile-save", true);
    state.beginOperation(
      {
        requestId: "language-request",
        regionId: "language-settings",
        actionId: "languages",
      },
      "Saving languages…",
      10,
    );
    const messageId = state.snapshot.activeFeedback!.messageId;

    expect(state.expireFeedback(messageId)).toBe(true);
    expect(state.snapshot.activeFeedback).toBeNull();
    expect(state.snapshot.requests["language-request"]).toBeDefined();
    expect(state.snapshot.latestRequestByRegion["language-settings"]).toEqual({
      requestId: "language-request",
      actionId: "languages",
    });
    expect(state.snapshot.editingProfileId).toBe("retained");
    expect(state.snapshot.selectedProfileId).toBe("retained");
    expect(state.snapshot.credentialDisplayProfileId).toBe("retained");
    expect(state.snapshot.profileTests.retained).toEqual({ revision: 1, state: "passed" });
    expect(state.snapshot.pendingProfileSave?.requestId).toBe("profile-save");
    expect(state.snapshot.deletedProfileIds).toEqual([]);
  });

  it("lets a later accepted result from another pending region become the global message", () => {
    const state = createState();
    state.beginOperation(
      { requestId: "translation", regionId: "translation-toggle", actionId: "translation" },
      "Enabling…",
      0,
    );
    state.beginOperation(
      { requestId: "languages", regionId: "language-settings", actionId: "languages" },
      "Saving…",
      10,
    );

    expect(state.finishOperation("translation", "success", "Enabled.", 20).accepted).toBe(true);
    expect(state.snapshot.activeFeedback).toMatchObject({
      requestId: "translation",
      regionId: "translation-toggle",
      message: "Enabled.",
    });
    expect(state.snapshot.requests.languages).toBeDefined();
  });

  it("makes the deletion result slot participate in replacement and expiry", () => {
    const state = createState();
    state.beginOperation(
      {
        requestId: "delete-request",
        regionId: "profile-row:deleted",
        actionId: "delete",
        profileId: "deleted",
      },
      "Deleting…",
      0,
    );
    state.deleteSucceeded({
      requestId: "delete-request",
      profileId: "deleted",
      message: "Deleted.",
      writtenAt: 20,
    });
    const deletedMessageId = state.snapshot.activeFeedback!.messageId;

    expect(state.snapshot.activeFeedback).toMatchObject({
      placement: "deleted-result",
      message: "Deleted.",
      expiresAt: 1_020,
    });
    expect(state.snapshot.deletedResults).toHaveLength(1);

    state.beginOperation(
      { requestId: "retry", regionId: "subtitle-retry", actionId: "retry-preparation" },
      "Retrying…",
      30,
    );
    expect(state.snapshot.deletedResults).toEqual([]);
    expect(state.expireFeedback(deletedMessageId)).toBe(false);
    expect(state.snapshot.deletedProfileIds).toContain("deleted");
  });

  it("keeps different Profile rows independently eligible to publish accepted results", () => {
    const state = createState();
    state.beginOperation(
      {
        requestId: "deleted-row-test",
        regionId: "profile-row:deleted",
        actionId: "test",
        profileId: "deleted",
      },
      "Testing deleted…",
      0,
    );
    state.beginOperation(
      {
        requestId: "retained-row-test",
        regionId: "profile-row:retained",
        actionId: "test",
        profileId: "retained",
      },
      "Testing retained…",
      10,
    );

    expect(
      state.finishOperation("deleted-row-test", "success", "First row passed.", 20).accepted,
    ).toBe(true);
    expect(state.snapshot.activeFeedback?.regionId).toBe("profile-row:deleted");
    expect(
      state.finishOperation("retained-row-test", "error", "Second row failed.", 30).accepted,
    ).toBe(true);
    expect(state.snapshot.activeFeedback).toMatchObject({
      regionId: "profile-row:retained",
      phase: "error",
      message: "Second row failed.",
    });
  });
});

describe("Sidebar Profile name source", () => {
  it("follows Service type labels only while the name is system-owned", () => {
    const state = createState();
    state.resetProfileName("OpenAI-compatible");
    expect(state.snapshot.profileName).toEqual({
      value: "OpenAI-compatible",
      mode: "system",
      serviceTypeLabel: "OpenAI-compatible",
    });

    state.changeServiceTypeLabel("Ollama");
    expect(state.snapshot.profileName.value).toBe("Ollama");
    expect(state.snapshot.profileName.mode).toBe("system");
  });

  it.each(["Custom", "", "   ", "OpenAI-compatible"])(
    "protects user input %j from later Service type changes",
    (value) => {
      const state = createState();
      state.resetProfileName("OpenAI-compatible");
      state.inputProfileName(value);
      state.changeServiceTypeLabel("Ollama");

      expect(state.snapshot.profileName).toEqual({
        value,
        mode: "user",
        serviceTypeLabel: "Ollama",
      });
    },
  );

  it("protects a saved name and lets New restore system ownership", () => {
    const state = createState();
    state.loadProfileName("Saved profile", "OpenAI-compatible");
    state.changeServiceTypeLabel("Ollama");
    expect(state.snapshot.profileName.value).toBe("Saved profile");
    expect(state.snapshot.profileName.mode).toBe("saved");

    state.resetProfileName("Ollama");
    expect(state.snapshot.profileName).toEqual({
      value: "Ollama",
      mode: "system",
      serviceTypeLabel: "Ollama",
    });
  });
});

describe("Sidebar two-stage Profile Update", () => {
  it.each([false, true])(
    "preserves selection invalidation through credentialPending=%s",
    (credentialPending) => {
      const state = createState();
      state.beginProfileSave("save-request", credentialPending);
      expect(
        state.profileRevisionCreated("save-request", {
          profileId: "retained",
          revision: 2,
          selectionInvalidated: true,
        }),
      ).toEqual({ accepted: true, waitingForCredential: credentialPending });
      expect(state.snapshot.pendingProfileSave?.selectionInvalidated).toBe(true);

      expect(state.completeProfileSave("save-request", "Profile saved.")).toBe(
        "Profile updated. Select it again for translation.",
      );
      expect(state.snapshot.pendingProfileSave).toBeNull();
    },
  );
});

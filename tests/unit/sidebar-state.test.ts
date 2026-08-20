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
  it("keeps five regions independent and makes the latest request win within one region", () => {
    const state = createState();
    for (const regionId of [
      "translation-toggle",
      "language-settings",
      "profile-editor",
      "profile-row:retained",
      "subtitle-retry",
    ]) {
      state.beginOperation(
        { requestId: `request-${regionId}`, regionId, actionId: regionId },
        "Busy",
      );
    }
    expect(Object.keys(state.snapshot.feedback)).toHaveLength(5);

    state.beginOperation(
      {
        requestId: "new-editor-request",
        regionId: "profile-editor",
        actionId: "save-profile",
      },
      "Saving",
    );
    expect(state.finishOperation("request-profile-editor", "success", "Old").accepted).toBe(false);
    expect(state.snapshot.feedback["profile-editor"]).toMatchObject({
      latestRequestId: "new-editor-request",
      phase: "busy",
      message: "Saving",
    });
    expect(state.finishOperation("new-editor-request", "success", "Saved").accepted).toBe(true);
    expect(state.snapshot.feedback["profile-editor"]?.message).toBe("Saved");
    expect(state.snapshot.feedback["language-settings"]?.phase).toBe("busy");
  });

  it("ignores unknown and duplicate results while exposing action identity across redraws", () => {
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
    );

    expect(state.snapshot.requests["test-request"]).toMatchObject({
      actionId: "test",
      profileId: "retained",
    });
    expect(state.finishOperation("unknown", "error", "Unknown").accepted).toBe(false);
    expect(state.finishOperation("test-request", "success", "Passed").accepted).toBe(true);
    expect(state.finishOperation("test-request", "error", "Duplicate").accepted).toBe(false);
    expect(state.snapshot.feedback["profile-row:retained"]).toMatchObject({
      actionId: "test",
      phase: "success",
      message: "Passed",
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

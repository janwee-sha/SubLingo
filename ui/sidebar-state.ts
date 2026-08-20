type SidebarFeedbackPhase = "busy" | "success" | "error" | "cancelled";

interface SidebarStateProfile {
  profileId: string;
  revision: number;
  [key: string]: unknown;
}

interface SidebarOperationRequest {
  requestId: string;
  regionId: string;
  actionId: string;
  profileId?: string;
  revision?: number;
  busyMessage?: string;
}

interface SidebarRegionRequest {
  requestId: string;
  actionId: string;
}

interface SidebarFeedback {
  messageId: number;
  requestId: string;
  regionId: string;
  actionId: string;
  phase: SidebarFeedbackPhase;
  message: string;
  expiresAt: number;
  placement: "region" | "deleted-result";
}

interface SidebarDeletedResult {
  messageId: number;
  requestId: string;
  profileId: string;
  message: string;
  position: number;
  expiresAt: number;
}

interface ProfileNameState {
  value: string;
  mode: "system" | "user" | "saved";
  serviceTypeLabel: string;
}

interface PendingProfileSaveState {
  requestId: string;
  profileId: string | null;
  revision: number | null;
  credentialPending: boolean;
  selectionInvalidated: boolean;
}

interface SidebarStateSnapshot {
  profiles: SidebarStateProfile[];
  deletedProfileIds: string[];
  editingProfileId: string | null;
  selectedProfileId: string | null;
  credentialDisplayProfileId: string | null;
  profileTests: Record<string, unknown>;
  requests: Record<string, SidebarOperationRequest>;
  latestRequestByRegion: Record<string, SidebarRegionRequest>;
  activeFeedback: SidebarFeedback | null;
  deletedResults: SidebarDeletedResult[];
  profileName: ProfileNameState;
  pendingProfileSave: PendingProfileSaveState | null;
}

interface SidebarStateCoordinator {
  readonly snapshot: SidebarStateSnapshot;
  applyProfiles(profiles: SidebarStateProfile[]): SidebarStateProfile[];
  setProfileContext(context: {
    editingProfileId?: string | null;
    selectedProfileId?: string | null;
    credentialDisplayProfileId?: string | null;
  }): void;
  setProfileTest(profileId: string, value: unknown): void;
  beginOperation(
    request: SidebarOperationRequest,
    message?: string,
    writtenAt?: number,
  ): SidebarFeedback;
  finishOperation(
    requestId: string,
    phase: SidebarFeedbackPhase,
    message: string,
    writtenAt?: number,
  ): { accepted: boolean; request?: SidebarOperationRequest; feedback?: SidebarFeedback };
  deleteSucceeded(input: {
    requestId: string;
    profileId: string;
    message: string;
    writtenAt?: number;
  }): {
    createdResultSlot: boolean;
    feedback?: SidebarFeedback;
  };
  expireFeedback(messageId: number): boolean;
  resetProfileName(serviceTypeLabel: string): void;
  changeServiceTypeLabel(serviceTypeLabel: string): void;
  inputProfileName(value: string): void;
  loadProfileName(value: string, serviceTypeLabel: string): void;
  beginProfileSave(requestId: string, credentialPending: boolean): void;
  profileRevisionCreated(
    requestId: string,
    result: { profileId: string; revision: number; selectionInvalidated: boolean },
  ): { accepted: boolean; waitingForCredential: boolean };
  completeProfileSave(
    requestId: string,
    fallbackMessage: string,
    succeeded?: boolean,
  ): string | null;
  cancelProfileSave(requestId: string): void;
}

interface Window {
  createSubLingoSidebarState(profiles?: SidebarStateProfile[]): SidebarStateCoordinator;
}

function createSubLingoSidebarState(
  initialProfiles: SidebarStateProfile[] = [],
): SidebarStateCoordinator {
  const snapshot: SidebarStateSnapshot = {
    profiles: [...initialProfiles],
    deletedProfileIds: [],
    editingProfileId: null,
    selectedProfileId: null,
    credentialDisplayProfileId: null,
    profileTests: {},
    requests: {},
    latestRequestByRegion: {},
    activeFeedback: null,
    deletedResults: [],
    profileName: {
      value: "OpenAI-compatible",
      mode: "system",
      serviceTypeLabel: "OpenAI-compatible",
    },
    pendingProfileSave: null,
  };
  let feedbackSequence = 0;

  const writeFeedback = (
    request: SidebarOperationRequest,
    phase: SidebarFeedbackPhase,
    message: string,
    writtenAt: number,
    placement: SidebarFeedback["placement"] = "region",
  ): SidebarFeedback => {
    feedbackSequence += 1;
    snapshot.deletedResults = [];
    snapshot.activeFeedback = {
      messageId: feedbackSequence,
      requestId: request.requestId,
      regionId: request.regionId,
      actionId: request.actionId,
      phase,
      message,
      expiresAt: writtenAt + 1_000,
      placement,
    };
    return snapshot.activeFeedback;
  };

  const applyProfiles = (profiles: SidebarStateProfile[]): SidebarStateProfile[] => {
    const deleted = new Set(snapshot.deletedProfileIds);
    snapshot.profiles = profiles.filter((profile) => !deleted.has(profile.profileId));
    return snapshot.profiles;
  };

  const setProfileContext = (context: {
    editingProfileId?: string | null;
    selectedProfileId?: string | null;
    credentialDisplayProfileId?: string | null;
  }): void => {
    if ("editingProfileId" in context) snapshot.editingProfileId = context.editingProfileId ?? null;
    if ("selectedProfileId" in context)
      snapshot.selectedProfileId = context.selectedProfileId ?? null;
    if ("credentialDisplayProfileId" in context)
      snapshot.credentialDisplayProfileId = context.credentialDisplayProfileId ?? null;
  };

  const setProfileTest = (profileId: string, value: unknown): void => {
    snapshot.profileTests[profileId] = value;
  };

  const beginOperation = (
    request: SidebarOperationRequest,
    message = "",
    writtenAt = Date.now(),
  ): SidebarFeedback => {
    const pendingRequest = { ...request, busyMessage: message };
    snapshot.requests[request.requestId] = pendingRequest;
    snapshot.latestRequestByRegion[request.regionId] = {
      requestId: request.requestId,
      actionId: request.actionId,
    };
    return writeFeedback(pendingRequest, "busy", message, writtenAt);
  };

  const finishOperation = (
    requestId: string,
    phase: SidebarFeedbackPhase,
    message: string,
    writtenAt = Date.now(),
  ): { accepted: boolean; request?: SidebarOperationRequest; feedback?: SidebarFeedback } => {
    const request = snapshot.requests[requestId];
    if (!request) return { accepted: false };
    delete snapshot.requests[requestId];
    const current = snapshot.latestRequestByRegion[request.regionId];
    if (current?.requestId !== requestId) return { accepted: false, request };
    return {
      accepted: true,
      request,
      feedback: writeFeedback(request, phase, message, writtenAt),
    };
  };

  const deleteSucceeded = (input: {
    requestId: string;
    profileId: string;
    message: string;
    writtenAt?: number;
  }): { createdResultSlot: boolean; feedback?: SidebarFeedback } => {
    const request = snapshot.requests[input.requestId];
    const position = snapshot.profiles.findIndex(
      (profile) => profile.profileId === input.profileId,
    );
    const localDelete =
      request?.actionId === "delete" &&
      request.profileId === input.profileId &&
      position >= 0 &&
      snapshot.latestRequestByRegion[request.regionId]?.requestId === input.requestId;
    const isNewDeletion = !snapshot.deletedProfileIds.includes(input.profileId);
    if (isNewDeletion) snapshot.deletedProfileIds.push(input.profileId);
    snapshot.profiles = snapshot.profiles.filter(
      (profile) => profile.profileId !== input.profileId,
    );
    if (snapshot.editingProfileId === input.profileId) snapshot.editingProfileId = null;
    if (snapshot.selectedProfileId === input.profileId) snapshot.selectedProfileId = null;
    if (snapshot.credentialDisplayProfileId === input.profileId)
      snapshot.credentialDisplayProfileId = null;
    delete snapshot.profileTests[input.profileId];
    for (const [requestId, pending] of Object.entries(snapshot.requests)) {
      if (pending.profileId === input.profileId) delete snapshot.requests[requestId];
    }
    for (const regionId of Object.keys(snapshot.latestRequestByRegion)) {
      if (regionId === `profile-row:${input.profileId}`)
        delete snapshot.latestRequestByRegion[regionId];
    }
    if (localDelete && request) {
      const feedback = writeFeedback(
        request,
        "success",
        input.message,
        input.writtenAt ?? Date.now(),
        "deleted-result",
      );
      snapshot.deletedResults.push({
        messageId: feedback.messageId,
        requestId: input.requestId,
        profileId: input.profileId,
        message: input.message,
        position,
        expiresAt: feedback.expiresAt,
      });
      return { createdResultSlot: true, feedback };
    }
    return { createdResultSlot: false };
  };

  const expireFeedback = (messageId: number): boolean => {
    if (snapshot.activeFeedback?.messageId !== messageId) return false;
    snapshot.activeFeedback = null;
    snapshot.deletedResults = snapshot.deletedResults.filter(
      (result) => result.messageId !== messageId,
    );
    return true;
  };

  const resetProfileName = (serviceTypeLabel: string): void => {
    snapshot.profileName = {
      value: serviceTypeLabel,
      mode: "system",
      serviceTypeLabel,
    };
  };

  const changeServiceTypeLabel = (serviceTypeLabel: string): void => {
    snapshot.profileName = {
      value: snapshot.profileName.mode === "system" ? serviceTypeLabel : snapshot.profileName.value,
      mode: snapshot.profileName.mode,
      serviceTypeLabel,
    };
  };

  const inputProfileName = (value: string): void => {
    snapshot.profileName = {
      value,
      mode: "user",
      serviceTypeLabel: snapshot.profileName.serviceTypeLabel,
    };
  };

  const loadProfileName = (value: string, serviceTypeLabel: string): void => {
    snapshot.profileName = { value, mode: "saved", serviceTypeLabel };
  };

  const beginProfileSave = (requestId: string, credentialPending: boolean): void => {
    snapshot.pendingProfileSave = {
      requestId,
      profileId: null,
      revision: null,
      credentialPending,
      selectionInvalidated: false,
    };
  };

  const profileRevisionCreated = (
    requestId: string,
    result: { profileId: string; revision: number; selectionInvalidated: boolean },
  ): { accepted: boolean; waitingForCredential: boolean } => {
    const pending = snapshot.pendingProfileSave;
    if (!pending || pending.requestId !== requestId)
      return { accepted: false, waitingForCredential: false };
    snapshot.pendingProfileSave = {
      ...pending,
      profileId: result.profileId,
      revision: result.revision,
      selectionInvalidated: pending.selectionInvalidated || result.selectionInvalidated,
    };
    return { accepted: true, waitingForCredential: pending.credentialPending };
  };

  const completeProfileSave = (
    requestId: string,
    fallbackMessage: string,
    succeeded = true,
  ): string | null => {
    const pending = snapshot.pendingProfileSave;
    if (!pending || pending.requestId !== requestId) return null;
    snapshot.pendingProfileSave = null;
    return succeeded && pending.selectionInvalidated
      ? "Profile updated. Select it again for translation."
      : fallbackMessage;
  };

  const cancelProfileSave = (requestId: string): void => {
    if (snapshot.pendingProfileSave?.requestId === requestId) snapshot.pendingProfileSave = null;
  };

  return {
    snapshot,
    applyProfiles,
    setProfileContext,
    setProfileTest,
    beginOperation,
    finishOperation,
    deleteSucceeded,
    expireFeedback,
    resetProfileName,
    changeServiceTypeLabel,
    inputProfileName,
    loadProfileName,
    beginProfileSave,
    profileRevisionCreated,
    completeProfileSave,
    cancelProfileSave,
  };
}

(globalThis as typeof globalThis & Window).createSubLingoSidebarState = createSubLingoSidebarState;

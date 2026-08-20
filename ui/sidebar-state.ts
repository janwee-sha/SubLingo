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
}

interface SidebarFeedback {
  latestRequestId: string;
  actionId: string;
  phase: SidebarFeedbackPhase;
  message: string;
}

interface SidebarDeletedResult {
  requestId: string;
  profileId: string;
  message: string;
  position: number;
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
  feedback: Record<string, SidebarFeedback>;
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
  beginOperation(request: SidebarOperationRequest, message?: string): void;
  finishOperation(
    requestId: string,
    phase: SidebarFeedbackPhase,
    message: string,
  ): { accepted: boolean; request?: SidebarOperationRequest };
  deleteSucceeded(input: { requestId: string; profileId: string; message: string }): {
    createdResultSlot: boolean;
  };
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
    feedback: {},
    deletedResults: [],
    profileName: {
      value: "OpenAI-compatible",
      mode: "system",
      serviceTypeLabel: "OpenAI-compatible",
    },
    pendingProfileSave: null,
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

  const beginOperation = (request: SidebarOperationRequest, message = ""): void => {
    snapshot.requests[request.requestId] = { ...request };
    snapshot.feedback[request.regionId] = {
      latestRequestId: request.requestId,
      actionId: request.actionId,
      phase: "busy",
      message,
    };
  };

  const finishOperation = (
    requestId: string,
    phase: SidebarFeedbackPhase,
    message: string,
  ): { accepted: boolean; request?: SidebarOperationRequest } => {
    const request = snapshot.requests[requestId];
    if (!request) return { accepted: false };
    delete snapshot.requests[requestId];
    const current = snapshot.feedback[request.regionId];
    if (current?.latestRequestId !== requestId) return { accepted: false, request };
    snapshot.feedback[request.regionId] = {
      latestRequestId: requestId,
      actionId: request.actionId,
      phase,
      message,
    };
    return { accepted: true, request };
  };

  const deleteSucceeded = (input: {
    requestId: string;
    profileId: string;
    message: string;
  }): { createdResultSlot: boolean } => {
    const request = snapshot.requests[input.requestId];
    const position = snapshot.profiles.findIndex(
      (profile) => profile.profileId === input.profileId,
    );
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
    const localDelete =
      request?.actionId === "delete" && request.profileId === input.profileId && position >= 0;
    if (
      localDelete &&
      !snapshot.deletedResults.some((item) => item.requestId === input.requestId)
    ) {
      snapshot.deletedResults.push({
        requestId: input.requestId,
        profileId: input.profileId,
        message: input.message,
        position,
      });
    }
    return { createdResultSlot: localDelete };
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

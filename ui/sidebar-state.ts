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
  requestId: string;
  regionId: string;
  actionId: string;
  phase: SidebarFeedbackPhase;
  message: string;
  placement: "region" | "deleted-result";
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

interface ModelControlState {
  value: string;
  mode: "known" | "custom";
  knownModelIds: string[];
  contextKey: string;
  refreshState: "idle" | "busy" | "success" | "error";
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
  modelControl: ModelControlState;
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
  setModelContext(contextKey: string, value: string): void;
  applyModelCatalog(contextKey: string, models: string[]): boolean;
  setModelRefreshState(state: ModelControlState["refreshState"]): void;
  setModelValue(value: string): void;
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
      value: "OpenAI",
      mode: "system",
      serviceTypeLabel: "OpenAI",
    },
    pendingProfileSave: null,
    modelControl: {
      value: "",
      mode: "custom",
      knownModelIds: [],
      contextKey: "",
      refreshState: "idle",
    },
  };
  const writeFeedback = (
    request: SidebarOperationRequest,
    phase: SidebarFeedbackPhase,
    message: string,
    placement: SidebarFeedback["placement"] = "region",
  ): void => {
    snapshot.deletedResults = [];
    snapshot.activeFeedback = {
      requestId: request.requestId,
      regionId: request.regionId,
      actionId: request.actionId,
      phase,
      message,
      placement,
    };
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
    const pendingRequest = { ...request, busyMessage: message };
    snapshot.requests[request.requestId] = pendingRequest;
    snapshot.latestRequestByRegion[request.regionId] = {
      requestId: request.requestId,
      actionId: request.actionId,
    };
    writeFeedback(pendingRequest, "busy", message);
  };

  const finishOperation = (
    requestId: string,
    phase: SidebarFeedbackPhase,
    message: string,
  ): { accepted: boolean; request?: SidebarOperationRequest } => {
    const request = snapshot.requests[requestId];
    if (!request) return { accepted: false };
    delete snapshot.requests[requestId];
    const current = snapshot.latestRequestByRegion[request.regionId];
    if (current?.requestId !== requestId) return { accepted: false, request };
    writeFeedback(request, phase, message);
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
      writeFeedback(request, "success", input.message, "deleted-result");
      snapshot.deletedResults.push({
        requestId: input.requestId,
        profileId: input.profileId,
        message: input.message,
        position,
      });
      return { createdResultSlot: true };
    }
    return { createdResultSlot: false };
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

  const classifyModelValue = (): void => {
    snapshot.modelControl.mode = snapshot.modelControl.knownModelIds.includes(
      snapshot.modelControl.value,
    )
      ? "known"
      : "custom";
  };

  const setModelContext = (contextKey: string, value: string): void => {
    if (snapshot.modelControl.contextKey !== contextKey) {
      snapshot.modelControl.contextKey = contextKey;
      snapshot.modelControl.knownModelIds = [];
      snapshot.modelControl.refreshState = "idle";
    }
    snapshot.modelControl.value = value;
    classifyModelValue();
  };

  const applyModelCatalog = (contextKey: string, models: string[]): boolean => {
    if (snapshot.modelControl.contextKey !== contextKey) return false;
    const seen = new Set<string>();
    snapshot.modelControl.knownModelIds = models.filter((model) => {
      if (!model || seen.has(model)) return false;
      seen.add(model);
      return true;
    });
    snapshot.modelControl.refreshState = "success";
    classifyModelValue();
    return true;
  };

  const setModelValue = (value: string): void => {
    snapshot.modelControl.value = value;
    classifyModelValue();
  };

  const setModelRefreshState = (state: ModelControlState["refreshState"]): void => {
    snapshot.modelControl.refreshState = state;
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
    setModelContext,
    applyModelCatalog,
    setModelRefreshState,
    setModelValue,
  };
}

(globalThis as typeof globalThis & Window).createSubLingoSidebarState = createSubLingoSidebarState;

type SessionStatus =
  | "disabled"
  | "waitingForSubtitle"
  | "detectingLanguage"
  | "languageUnrecognized"
  | "languageUnsupported"
  | "noTranslationNeeded"
  | "waitingForConfiguration"
  | "preparing"
  | "running"
  | "partialFailure"
  | "serviceUnavailable";

type ProviderKind = "openai" | "ollama";

interface SessionProviderError {
  category?: string;
  statusCode?: number;
  providerCode?: string;
  userAction?: string;
}

interface ProfileView {
  profileId: string;
  revision: number;
  displayName: string;
  kind: ProviderKind;
  endpoint: string;
  endpointFingerprint: string;
  proxyMode: "system" | "direct";
  model?: string;
  credentialConfigured: boolean;
}

type ProfileTestState = "not tested" | "passed" | "failed";

type SourcePreparationState =
  | "preparing"
  | "ready"
  | "unsupportedType"
  | "remoteUnsupported"
  | "emptyOrUnreadable"
  | "timedOut"
  | "failed"
  | "invalidated";

const labels: Record<SessionStatus, string> = {
  disabled: "Translation is off",
  waitingForSubtitle: "Select a readable external SRT or ASS subtitle",
  detectingLanguage: "Detecting subtitle language…",
  languageUnrecognized: "Subtitle language could not be identified; playback continues",
  languageUnsupported: "This subtitle language is not supported; playback continues",
  noTranslationNeeded: "The subtitle already matches the target language",
  waitingForConfiguration: "Select and test a translation service",
  preparing: "Preparing nearby translations…",
  running: "Translations are running",
  partialFailure: "Some cues could not be translated; playback continues",
  serviceUnavailable: "Translation service unavailable; playback continues",
};

const sourceIssueLabels: Record<string, string> = {
  "not-external": "Select an external SRT or ASS subtitle track.",
  unreadable: "IINA has not exposed readable subtitle data yet; reselect the external subtitle.",
  "unsupported-format": "The selected external subtitle is not readable SRT or ASS text.",
  "unsupported-encoding": "The selected subtitle encoding is not supported.",
  empty: "The selected subtitle contains no readable cues.",
};

const sourcePreparationLabels: Record<SourcePreparationState, string> = {
  preparing: "Preparing the selected embedded subtitle…",
  ready: "",
  unsupportedType: "This subtitle type is not supported. Select a text subtitle in IINA.",
  remoteUnsupported: "Embedded subtitles in remote media are not supported.",
  emptyOrUnreadable: "The selected subtitle is empty or unreadable.",
  timedOut: "Subtitle preparation timed out. Playback continues.",
  failed: "Subtitle preparation failed. Playback continues.",
  invalidated: "The subtitle selection changed. Reselect a subtitle in IINA.",
};

function safeProviderErrorDetail(error: SessionProviderError | null | undefined): string {
  if (!error) return "";
  if (typeof error.statusCode === "number") return `HTTP ${error.statusCode}`;
  const category: Record<string, string> = {
    network: "Network request failed",
    timeout: "Provider request timed out",
    authentication: "Authentication failed",
    model: "Model is unavailable",
    quota: "Quota or rate limit reached",
    protocol: "Provider response was incompatible",
    configuration: "Provider configuration was rejected",
  };
  return category[error.category ?? ""] ?? "Provider request failed";
}

const statusMessage = document.querySelector<HTMLParagraphElement>("#status")!;
const statusDot = document.querySelector<HTMLSpanElement>("#status-dot")!;
const sourcePreparationControls = document.querySelector<HTMLElement>(
  "#source-preparation-controls",
)!;
const retrySubtitleButton = document.querySelector<HTMLButtonElement>("#retry-subtitle")!;
const translationStatus = document.querySelector<HTMLParagraphElement>("#translation-status")!;
const languageStatus = document.querySelector<HTMLParagraphElement>("#language-status")!;
const profileEditorStatus = document.querySelector<HTMLParagraphElement>("#profile-editor-status")!;
const subtitleRetryStatus = document.querySelector<HTMLParagraphElement>("#subtitle-retry-status")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const targetLanguage = document.querySelector<HTMLSelectElement>("#target-language")!;
const sourceSummary = document.querySelector<HTMLElement>("#source-summary")!;
const providerKind = document.querySelector<HTMLSelectElement>("#provider-kind")!;
const profileName = document.querySelector<HTMLInputElement>("#profile-name")!;
const providerEndpoint = document.querySelector<HTMLInputElement>("#provider-endpoint")!;
const providerModel = document.querySelector<HTMLInputElement>("#provider-model")!;
const providerProxyMode = document.querySelector<HTMLSelectElement>("#provider-proxy-mode")!;
const providerKey = document.querySelector<HTMLInputElement>("#provider-key")!;
const saveLanguagesButton = document.querySelector<HTMLButtonElement>("#save-languages")!;
const saveProfileButton = document.querySelector<HTMLButtonElement>("#save-profile")!;
const newProfileButton = document.querySelector<HTMLButtonElement>("#new-profile")!;
const profilesElement = document.querySelector<HTMLElement>("#profiles")!;
const requestUrl = document.querySelector<HTMLElement>("#request-url")!;
const credentialState = document.querySelector<HTMLElement>("#credential-state")!;

const providerDrafts: Record<
  ProviderKind,
  { endpoint: string; model: string; proxyMode: "system" | "direct" }
> = {
  openai: { endpoint: "https://api.openai.com/v1", model: "", proxyMode: "system" },
  ollama: { endpoint: "http://127.0.0.1:11434", model: "", proxyMode: "system" },
};
const profiles = new Map<string, ProfileView>();
const sidebarState = window.createSubLingoSidebarState();
const profileUpdatedSelectionMessage = "Profile updated. Select it again for translation.";
const profileTestStates = new Map<string, { revision: number; state: ProfileTestState }>();
const pendingProfileTests = new Map<string, { profileId: string; revision: number }>();
const pendingOperations = new Set<string>();
let activeProviderKind: ProviderKind = "openai";
let editingProfile: ProfileView | null = null;
let selectedProfileId: string | null = null;
let pendingProfileSave: { requestId: string; secret: string | null } | null = null;
let requestSequence = 0;
let renderedProfilesSignature = "";
let targetLanguageRevision = 1;
let committedTargetLanguage = "zh-Hans";
let targetLanguageHydrated = false;
let targetLanguageDirty = false;
let pendingLanguageSaveRequestId: string | null = null;
let renderedLanguageCatalogSignature = "";

function nextRequestId(): string {
  requestSequence += 1;
  return `ui-${Date.now()}-${requestSequence}`;
}

function envelope(
  payload: Record<string, unknown>,
  requestId = nextRequestId(),
  revision = 1,
): Record<string, unknown> {
  return { requestId, revision, payload };
}

function statusForRegion(regionId: string): HTMLParagraphElement | null {
  if (regionId === "translation-toggle") return translationStatus;
  if (regionId === "language-settings") return languageStatus;
  if (regionId === "profile-editor") return profileEditorStatus;
  if (regionId === "subtitle-retry") return subtitleRetryStatus;
  if (!regionId.startsWith("profile-row:")) return null;
  const profileId = regionId.slice("profile-row:".length);
  return (
    Array.from(
      profilesElement.querySelectorAll<HTMLParagraphElement>(".profile-operation-status"),
    ).find((status) => status.dataset.profileId === profileId) ?? null
  );
}

function controlForAction(
  actionId: string,
  profileId?: string,
): HTMLButtonElement | HTMLInputElement | null {
  if (actionId === "translation") return enabled;
  if (actionId === "languages") return saveLanguagesButton;
  if (actionId === "save-profile") return saveProfileButton;
  if (actionId === "retry-preparation") return retrySubtitleButton;
  if (!profileId) return null;
  return (
    Array.from(profilesElement.querySelectorAll<HTMLButtonElement>("button[data-action]")).find(
      (button) => button.dataset.action === actionId && button.dataset.profileId === profileId,
    ) ?? null
  );
}

function idleLabelForAction(actionId: string, profileId?: string): string {
  if (actionId === "languages") return "Save Languages";
  if (actionId === "save-profile") return editingProfile ? "Update profile" : "Save profile";
  if (actionId === "retry-preparation") return "Retry";
  if (actionId === "select") return selectedProfileId === profileId ? "Selected" : "Select";
  if (actionId === "test") return "Test";
  if (actionId === "delete") return "Delete";
  return "";
}

function setActionBusy(
  actionId: string,
  profileId: string | undefined,
  busy: boolean,
  busyLabel = "",
): void {
  const control = controlForAction(actionId, profileId);
  if (!control) return;
  control.disabled = busy || (actionId === "select" && selectedProfileId === profileId);
  if (busy) control.setAttribute("aria-busy", "true");
  else control.removeAttribute("aria-busy");
  if (control instanceof HTMLButtonElement)
    control.textContent = busy ? busyLabel : idleLabelForAction(actionId, profileId);
}

function renderRegionFeedback(regionId: string): void {
  const status = statusForRegion(regionId);
  const feedback = sidebarState.snapshot.feedback[regionId];
  if (!status || !feedback) return;
  status.dataset.state = feedback.phase;
  status.textContent = feedback.message;
}

function beginOperation(
  regionId: string,
  actionId: string,
  busyLabel: string,
  profileId?: string,
  revision?: number,
): string {
  const requestId = nextRequestId();
  const previousId = sidebarState.snapshot.feedback[regionId]?.latestRequestId;
  const previous = previousId ? sidebarState.snapshot.requests[previousId] : undefined;
  if (previous) setActionBusy(previous.actionId, previous.profileId, false);
  sidebarState.beginOperation(
    {
      requestId,
      regionId,
      actionId,
      ...(profileId ? { profileId } : {}),
      ...(revision === undefined ? {} : { revision }),
    },
    busyLabel,
  );
  pendingOperations.add(requestId);
  setActionBusy(actionId, profileId, true, busyLabel);
  renderRegionFeedback(regionId);
  return requestId;
}

function finishOperation(
  requestId: unknown,
  message: string,
  phase: Exclude<SidebarFeedbackPhase, "busy"> = "success",
): boolean {
  if (typeof requestId !== "string" || !pendingOperations.has(requestId)) return false;
  const request = sidebarState.snapshot.requests[requestId];
  const finished = sidebarState.finishOperation(requestId, phase, message);
  pendingOperations.delete(requestId);
  if (!request) return false;
  const latestId = sidebarState.snapshot.feedback[request.regionId]?.latestRequestId;
  const latest = latestId ? sidebarState.snapshot.requests[latestId] : undefined;
  if (!latest || latest.actionId !== request.actionId)
    setActionBusy(request.actionId, request.profileId, false);
  if (!finished.accepted) return false;
  renderRegionFeedback(request.regionId);
  return true;
}

function saveActiveDraft(): void {
  providerDrafts[activeProviderKind] = {
    endpoint: providerEndpoint.value,
    model: providerModel.value,
    proxyMode: providerProxyMode.value === "direct" ? "direct" : "system",
  };
}

function updateRequestUrl(): void {
  const value = providerEndpoint.value.trim().replace(/\/+$/, "");
  requestUrl.textContent =
    providerKind.value === "openai"
      ? value
        ? `Actual request: ${value}/chat/completions`
        : "Requests append /chat/completions to this API root."
      : value
        ? `Ollama API root: ${value}`
        : "Enter the Ollama server root.";
}

function selectedServiceTypeLabel(): string {
  return providerKind.selectedOptions.item(0)?.textContent?.trim() ?? "";
}

function applyProviderKind(): void {
  const kind = providerKind.value as ProviderKind;
  activeProviderKind = kind;
  providerEndpoint.value = providerDrafts[kind].endpoint;
  providerModel.value = providerDrafts[kind].model;
  providerProxyMode.value = providerDrafts[kind].proxyMode;
  sidebarState.changeServiceTypeLabel(selectedServiceTypeLabel());
  profileName.value = sidebarState.snapshot.profileName.value;
  document.querySelector<HTMLElement>("#credential-row")!.hidden = kind === "ollama";
  document.querySelector<HTMLElement>("#endpoint-hint")!.textContent =
    kind === "openai"
      ? "Enter a complete HTTP(S) API root. Every value receives /chat/completions."
      : "Enter a complete HTTP(S) Ollama server root.";
  document.querySelector<HTMLElement>("#model-hint")!.textContent =
    kind === "openai"
      ? "Enter the exact model identifier exposed by this service."
      : "Enter the exact Ollama tag, for example translategemma:12b or qwen3:14b.";
  providerModel.placeholder = kind === "openai" ? "e.g. gpt-translate-fast" : "e.g. qwen3:14b";
  updateRequestUrl();
}

providerKind.addEventListener("change", () => {
  saveActiveDraft();
  applyProviderKind();
});
providerEndpoint.addEventListener("input", updateRequestUrl);
profileName.addEventListener("input", () => {
  sidebarState.inputProfileName(profileName.value);
});

function loadEditor(profile: ProfileView): void {
  editingProfile = profile;
  sidebarState.setProfileContext({
    editingProfileId: profile.profileId,
    credentialDisplayProfileId: profile.profileId,
  });
  providerKind.value = profile.kind;
  sidebarState.loadProfileName(profile.displayName, selectedServiceTypeLabel());
  profileName.value = sidebarState.snapshot.profileName.value;
  activeProviderKind = profile.kind;
  providerDrafts[profile.kind] = {
    endpoint: profile.endpoint,
    model: profile.model ?? "",
    proxyMode: profile.proxyMode,
  };
  applyProviderKind();
  providerKey.value = "";
  providerKey.placeholder = profile.credentialConfigured
    ? "Leave blank to keep saved key"
    : "Not shown after saving";
  saveProfileButton.textContent = "Update profile";
  newProfileButton.hidden = false;
}

function resetEditor(): void {
  editingProfile = null;
  sidebarState.setProfileContext({ editingProfileId: null, credentialDisplayProfileId: null });
  sidebarState.resetProfileName(selectedServiceTypeLabel());
  profileName.value = sidebarState.snapshot.profileName.value;
  providerProxyMode.value = "system";
  providerKey.value = "";
  providerKey.placeholder = "Not shown after saving";
  saveProfileButton.textContent = "Save profile";
  newProfileButton.hidden = true;
  profileEditorStatus.dataset.state = "success";
  profileEditorStatus.textContent = "Ready to create a new profile.";
}

enabled.addEventListener("change", () => {
  const requestId = beginOperation(
    "translation-toggle",
    "translation",
    enabled.checked ? "Enabling translation…" : "Disabling translation…",
  );
  window.iina?.postMessage(
    "translation:set-enabled",
    envelope({ enabled: enabled.checked }, requestId),
  );
});

saveLanguagesButton.addEventListener("click", () => {
  if (pendingLanguageSaveRequestId) return;
  const requestId = beginOperation("language-settings", "languages", "Saving languages…");
  pendingLanguageSaveRequestId = requestId;
  window.iina?.postMessage(
    "defaults:save",
    envelope({ targetLanguage: targetLanguage.value }, requestId, targetLanguageRevision),
  );
});

targetLanguage.addEventListener("change", () => {
  targetLanguageDirty = targetLanguage.value !== committedTargetLanguage;
});

retrySubtitleButton.addEventListener("click", () => {
  const requestId = beginOperation("subtitle-retry", "retry-preparation", "Retrying…");
  window.iina?.postMessage("subtitle:retry-preparation", envelope({}, requestId));
});

saveProfileButton.addEventListener("click", () => {
  const requestId = beginOperation(
    "profile-editor",
    "save-profile",
    editingProfile ? "Updating profile…" : "Saving profile…",
    editingProfile?.profileId,
    editingProfile?.revision,
  );
  pendingProfileSave = { requestId, secret: providerKey.value || null };
  sidebarState.beginProfileSave(requestId, Boolean(pendingProfileSave.secret));
  window.iina?.postMessage(
    "profile:save",
    envelope(
      {
        ...(editingProfile
          ? { profileId: editingProfile.profileId, expectedRevision: editingProfile.revision }
          : {}),
        displayName: profileName.value.trim(),
        kind: providerKind.value,
        endpoint: providerEndpoint.value.trim(),
        proxyMode: providerProxyMode.value,
        model: providerModel.value.trim() || undefined,
      },
      requestId,
    ),
  );
});

newProfileButton.addEventListener("click", resetEditor);

profilesElement.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  const profile = profiles.get(button.dataset.profileId ?? "");
  if (!profile) return;
  const selection = {
    profileId: profile.profileId,
    revision: profile.revision,
    endpointFingerprint: profile.endpointFingerprint,
  };
  switch (button.dataset.action) {
    case "edit":
      loadEditor(profile);
      profileEditorStatus.dataset.state = "success";
      profileEditorStatus.textContent = `Editing ${profile.displayName}.`;
      break;
    case "select": {
      loadEditor(profile);
      const requestId = beginOperation(
        `profile-row:${profile.profileId}`,
        "select",
        "Selecting…",
        profile.profileId,
        profile.revision,
      );
      window.iina?.postMessage("profile:select", envelope(selection, requestId));
      break;
    }
    case "test": {
      const requestId = beginOperation(
        `profile-row:${profile.profileId}`,
        "test",
        "Testing…",
        profile.profileId,
        profile.revision,
      );
      pendingProfileTests.set(requestId, {
        profileId: profile.profileId,
        revision: profile.revision,
      });
      window.iina?.postMessage("provider:test", envelope(selection, requestId));
      break;
    }
    case "delete": {
      const requestId = beginOperation(
        `profile-row:${profile.profileId}`,
        "delete",
        "Confirming…",
        profile.profileId,
        profile.revision,
      );
      window.iina?.postMessage(
        "profile:delete-request",
        envelope(
          {
            profileId: profile.profileId,
            expectedRevision: profile.revision,
            displayName: profile.displayName,
          },
          requestId,
        ),
      );
      break;
    }
  }
});

window.iina?.onMessage("profile:revision-created", (raw: unknown) => {
  const result = raw as {
    requestId?: string;
    profile?: ProfileView;
    selectionInvalidated?: boolean;
  };
  if (!result.profile || !pendingProfileSave || result.requestId !== pendingProfileSave.requestId)
    return;
  const transition = sidebarState.profileRevisionCreated(result.requestId, {
    profileId: result.profile.profileId,
    revision: result.profile.revision,
    selectionInvalidated: result.selectionInvalidated === true,
  });
  if (!transition.accepted) return;
  profileTestStates.delete(result.profile.profileId);
  loadEditor(result.profile);
  if (pendingProfileSave.secret) {
    window.iina?.postMessage(
      "secret:set",
      envelope(
        {
          profileId: result.profile.profileId,
          expectedRevision: result.profile.revision,
          fields: { apiKey: pendingProfileSave.secret },
        },
        pendingProfileSave.requestId,
      ),
    );
  } else {
    const message =
      sidebarState.completeProfileSave(result.requestId, "Profile saved.") ??
      profileUpdatedSelectionMessage;
    finishOperation(result.requestId, message);
    pendingProfileSave = null;
  }
  window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("profile:selected", (raw: unknown) => {
  const result = raw as { requestId?: string; selection?: { profileId?: string } };
  selectedProfileId = result.selection?.profileId ?? selectedProfileId;
  sidebarState.setProfileContext({ selectedProfileId });
  finishOperation(result.requestId, "Profile selected for translation.");
});

window.iina?.onMessage("profile:deleted", (raw: unknown) => {
  const result = raw as { requestId?: string; profileId?: string };
  if (typeof result.requestId !== "string" || typeof result.profileId !== "string") return;
  sidebarState.deleteSucceeded({
    requestId: result.requestId,
    profileId: result.profileId,
    message: "Profile and saved credential deleted.",
  });
  if (editingProfile?.profileId === result.profileId) resetEditor();
  if (selectedProfileId === result.profileId) {
    selectedProfileId = null;
    sidebarState.setProfileContext({ selectedProfileId: null });
  }
  profileTestStates.delete(result.profileId);
  for (const [requestId, tested] of pendingProfileTests) {
    if (tested.profileId === result.profileId) pendingProfileTests.delete(requestId);
  }
  pendingOperations.delete(result.requestId);
  renderedProfilesSignature = "";
  renderProfiles(sidebarState.snapshot.profiles as unknown as ProfileView[]);
  window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("provider:test-result", (raw: unknown) => {
  const result = raw as {
    requestId?: string;
    ok?: boolean;
    category?: string;
    userAction?: string;
  };
  const accepted = finishOperation(
    result.requestId,
    window.sublingoProviderTestStatusMessage(result),
    result.ok === true ? "success" : "error",
  );
  if (typeof result.requestId === "string") {
    const tested = pendingProfileTests.get(result.requestId);
    pendingProfileTests.delete(result.requestId);
    if (accepted && tested) {
      const testState: { revision: number; state: ProfileTestState } = {
        revision: tested.revision,
        state: result.ok === true ? "passed" : "failed",
      };
      profileTestStates.set(tested.profileId, testState);
      sidebarState.setProfileTest(tested.profileId, testState);
    }
  }
  const currentProfiles = [...profiles.values()];
  renderedProfilesSignature = "";
  renderProfiles(currentProfiles);
});

window.iina?.onMessage("credential:state", (raw: unknown) => {
  const result = raw as {
    requestId?: string;
    state?: string;
    code?: string;
    userAction?: string;
  };
  const ready = result.state === "ready";
  const message = window.sublingoCredentialStatusMessage(result);
  credentialState.textContent = message;
  if (pendingProfileSave && result.requestId === pendingProfileSave.requestId) {
    const saveMessage = sidebarState.completeProfileSave(
      result.requestId,
      ready ? "Profile and local credential saved." : message,
      ready,
    );
    finishOperation(result.requestId, saveMessage ?? message, ready ? "success" : "error");
    pendingProfileSave = null;
  }
  if (ready) window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("operation:result", (raw: unknown) => {
  const result = raw as {
    requestId?: string;
    ok?: boolean;
    cancelled?: boolean;
    action?: string;
    targetLanguage?: string;
    targetLanguageRevision?: number;
  };
  if (result.action === "languages" && result.requestId === pendingLanguageSaveRequestId) {
    pendingLanguageSaveRequestId = null;
    if (
      result.ok === true &&
      typeof result.targetLanguage === "string" &&
      typeof result.targetLanguageRevision === "number"
    ) {
      committedTargetLanguage = result.targetLanguage;
      targetLanguageRevision = result.targetLanguageRevision;
      targetLanguage.value = result.targetLanguage;
      targetLanguageDirty = false;
      targetLanguageHydrated = true;
    }
  }
  const message = result.cancelled
    ? "Operation cancelled. Nothing was changed."
    : result.action === "languages"
      ? result.ok === true
        ? "Language settings saved."
        : "Language settings could not be saved. The previous target remains active."
      : result.action === "translation"
        ? enabled.checked
          ? "Translation enabled."
          : "Translation disabled."
        : result.action === "retry-preparation"
          ? result.ok === true
            ? "Subtitle preparation restarted."
            : "Retry is no longer available for this subtitle."
          : "Operation completed.";
  finishOperation(
    result.requestId,
    message,
    result.cancelled ? "cancelled" : result.ok === true ? "success" : "error",
  );
});

window.iina?.onMessage("operation:error", (raw: unknown) => {
  const result = raw as { requestId?: string };
  if (result.requestId === pendingLanguageSaveRequestId) pendingLanguageSaveRequestId = null;
  finishOperation(
    result.requestId,
    "The operation could not be completed. Review the service settings and try again.",
    "error",
  );
  if (pendingProfileSave?.requestId === result.requestId) pendingProfileSave = null;
  if (typeof result.requestId === "string") sidebarState.cancelProfileSave(result.requestId);
});

function renderProfiles(viewProfiles: ProfileView[]): void {
  profiles.clear();
  profilesElement.replaceChildren();
  if (!viewProfiles.length && sidebarState.snapshot.deletedResults.length === 0) {
    profilesElement.innerHTML = '<p class="empty">No saved profiles yet.</p>';
    return;
  }
  for (const profile of viewProfiles) {
    profiles.set(profile.profileId, profile);
    const article = document.createElement("article");
    article.className = `profile${selectedProfileId === profile.profileId ? " is-selected" : ""}`;
    article.innerHTML = `<div><strong></strong><span></span><code></code></div><div class="profile-actions"></div>`;
    article.querySelector("strong")!.textContent = profile.displayName;
    article.querySelector("span")!.textContent =
      `${profile.kind}${profile.model ? ` · ${profile.model}` : ""}` +
      `${profile.proxyMode === "direct" ? " · direct" : " · macOS proxy"}` +
      `${profile.credentialConfigured ? " · key saved" : profile.kind === "openai" ? " · no key saved" : ""}` +
      ` · ${profileTestStates.get(profile.profileId)?.revision === profile.revision ? profileTestStates.get(profile.profileId)!.state : "not tested"}`;
    article.querySelector("code")!.textContent = profile.endpoint;
    const actions = article.querySelector<HTMLElement>(".profile-actions")!;
    for (const [action, label] of [
      ["test", "Test"],
      ["select", selectedProfileId === profile.profileId ? "Selected" : "Select"],
      ["edit", "Edit"],
      ["delete", "Delete"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        action === "select" ? "" : `secondary${action === "delete" ? " danger" : ""}`;
      button.dataset.action = action;
      button.dataset.profileId = profile.profileId;
      button.textContent = label;
      if (action === "select" && selectedProfileId === profile.profileId) button.disabled = true;
      actions.append(button);
    }
    const rowStatus = document.createElement("p");
    rowStatus.className = "operation-status profile-operation-status";
    rowStatus.dataset.profileId = profile.profileId;
    rowStatus.setAttribute("role", "status");
    rowStatus.setAttribute("aria-live", "polite");
    article.append(rowStatus);
    profilesElement.append(article);
    const regionId = `profile-row:${profile.profileId}`;
    renderRegionFeedback(regionId);
    const latestRequestId = sidebarState.snapshot.feedback[regionId]?.latestRequestId;
    const latestRequest = latestRequestId
      ? sidebarState.snapshot.requests[latestRequestId]
      : undefined;
    if (latestRequest)
      setActionBusy(
        latestRequest.actionId,
        latestRequest.profileId,
        true,
        sidebarState.snapshot.feedback[regionId]?.message ?? "",
      );
  }
  for (const result of [...sidebarState.snapshot.deletedResults].sort(
    (left, right) => left.position - right.position,
  )) {
    const slot = document.createElement("p");
    slot.className = "deleted-profile-result";
    slot.setAttribute("role", "status");
    slot.setAttribute("aria-live", "polite");
    slot.textContent = result.message;
    const anchor = profilesElement.children.item(
      Math.min(result.position, profilesElement.children.length),
    );
    profilesElement.insertBefore(slot, anchor);
  }
}

window.iina?.onMessage("state:update", (raw: unknown) => {
  const view = raw as {
    status?: SessionStatus;
    source?: {
      format: string;
      cueCount: number;
      detectedLanguage?: string | null;
    } | null;
    cacheSize?: number;
    boundedWork?: string;
    profiles?: ProfileView[];
    selection?: { profileId: string; revision: number } | null;
    sourceIssue?: string | null;
    providerError?: SessionProviderError | null;
    sourcePreparation?: {
      state: SourcePreparationState;
      canRetry: boolean;
      canReselect: boolean;
    } | null;
    targetLanguage?: string;
    targetLanguageRevision?: number;
    targetLanguages?: Array<{ id: string; displayName: string; order: number }>;
  };
  if (view.targetLanguages) {
    const signature = JSON.stringify(view.targetLanguages);
    if (signature !== renderedLanguageCatalogSignature) {
      renderedLanguageCatalogSignature = signature;
      targetLanguage.replaceChildren();
      for (const language of [...view.targetLanguages].sort(
        (left, right) => left.order - right.order,
      )) {
        const option = document.createElement("option");
        option.value = language.id;
        option.textContent = language.displayName;
        targetLanguage.append(option);
      }
    }
  }
  if (typeof view.targetLanguage === "string" && typeof view.targetLanguageRevision === "number") {
    committedTargetLanguage = view.targetLanguage;
    targetLanguageRevision = view.targetLanguageRevision;
    if (!targetLanguageHydrated || (!targetLanguageDirty && !pendingLanguageSaveRequestId)) {
      targetLanguage.value = committedTargetLanguage;
      targetLanguageDirty = false;
      targetLanguageHydrated = true;
    }
  }
  if (view.status && labels[view.status]) {
    statusMessage.textContent = labels[view.status];
    statusDot.dataset.state = view.status;
    enabled.checked = view.status !== "disabled";
    if (view.status === "partialFailure" || view.status === "serviceUnavailable") {
      const detail = safeProviderErrorDetail(view.providerError);
      if (detail) statusMessage.textContent = `${labels[view.status]} — ${detail}`;
    }
  }
  if (
    view.status === "waitingForSubtitle" &&
    view.sourceIssue &&
    sourceIssueLabels[view.sourceIssue]
  )
    statusMessage.textContent = sourceIssueLabels[view.sourceIssue]!;
  const retryFeedback = sidebarState.snapshot.feedback["subtitle-retry"];
  if (view.sourcePreparation && view.sourcePreparation.state !== "ready") {
    sourcePreparationControls.hidden = !view.sourcePreparation.canRetry && !retryFeedback;
    retrySubtitleButton.hidden = !view.sourcePreparation.canRetry;
    statusMessage.textContent = sourcePreparationLabels[view.sourcePreparation.state];
    statusDot.dataset.state = view.sourcePreparation.state;
  } else {
    sourcePreparationControls.hidden = !retryFeedback;
    retrySubtitleButton.hidden = true;
  }
  if (view.source) {
    sourceSummary.hidden = false;
    document.querySelector<HTMLElement>("#source-format")!.textContent =
      view.source.format.toUpperCase();
    document.querySelector<HTMLElement>("#source-cues")!.textContent = String(view.source.cueCount);
    document.querySelector<HTMLElement>("#source-detected-language")!.textContent =
      view.source.detectedLanguage ?? "Unknown";
  } else if (view.source === null) {
    sourceSummary.hidden = true;
  }
  if (typeof view.cacheSize === "number")
    document.querySelector<HTMLElement>("#cache-size")!.textContent = `${view.cacheSize} cues`;
  if (view.boundedWork)
    document.querySelector<HTMLElement>("#work-bound")!.textContent = view.boundedWork;
  selectedProfileId = view.selection?.profileId ?? null;
  sidebarState.setProfileContext({ selectedProfileId });
  if (view.profiles) {
    const visibleProfiles = sidebarState.applyProfiles(
      view.profiles as unknown as SidebarStateProfile[],
    ) as unknown as ProfileView[];
    const signature = JSON.stringify({
      selectedProfileId,
      deletedProfileIds: sidebarState.snapshot.deletedProfileIds,
      deletedResults: sidebarState.snapshot.deletedResults,
      profiles: visibleProfiles.map((profile) => [
        profile.profileId,
        profile.revision,
        profile.displayName,
        profile.kind,
        profile.endpoint,
        profile.proxyMode,
        profile.model,
        profile.credentialConfigured,
        profileTestStates.get(profile.profileId)?.revision === profile.revision
          ? profileTestStates.get(profile.profileId)!.state
          : "not tested",
      ]),
    });
    if (signature !== renderedProfilesSignature) {
      renderedProfilesSignature = signature;
      renderProfiles(visibleProfiles);
    }
    if (editingProfile) {
      const latest = profiles.get(editingProfile.profileId);
      if (latest) editingProfile = latest;
    }
  }
});

window.iina?.postMessage("ui:ready", envelope({}));
window.setInterval(() => window.iina?.postMessage("ui:poll", envelope({})), 750);
applyProviderKind();

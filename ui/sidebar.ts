type SessionStatus =
  | "disabled"
  | "waitingForSubtitle"
  | "waitingForLanguage"
  | "nativeNoTranslation"
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

interface PendingOperation {
  button: HTMLButtonElement | null;
  idleLabel: string;
}

type ProfileTestState = "not tested" | "passed" | "failed";

const labels: Record<SessionStatus, string> = {
  disabled: "Translation is off",
  waitingForSubtitle: "Select a readable external SRT or ASS subtitle",
  waitingForLanguage: "Confirm the subtitle language before sending text",
  nativeNoTranslation: "The subtitle already matches your mother language",
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
const operationStatus = document.querySelector<HTMLParagraphElement>("#operation-status")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const targetLanguage = document.querySelector<HTMLSelectElement>("#target-language")!;
const sourceLanguage = document.querySelector<HTMLInputElement>("#source-language")!;
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
const profileTestStates = new Map<string, { revision: number; state: ProfileTestState }>();
const pendingProfileTests = new Map<string, { profileId: string; revision: number }>();
const pendingOperations = new Map<string, PendingOperation>();
let activeProviderKind: ProviderKind = "openai";
let editingProfile: ProfileView | null = null;
let selectedProfileId: string | null = null;
let pendingProfileSave: { requestId: string; secret: string | null } | null = null;
let requestSequence = 0;
let renderedProfilesSignature = "";

function nextRequestId(): string {
  requestSequence += 1;
  return `ui-${Date.now()}-${requestSequence}`;
}

function envelope(
  payload: Record<string, unknown>,
  requestId = nextRequestId(),
): Record<string, unknown> {
  return { requestId, revision: 1, payload };
}

function beginOperation(button: HTMLButtonElement | null, busyLabel: string): string {
  const requestId = nextRequestId();
  const idleLabel = button?.textContent ?? "";
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = busyLabel;
  }
  pendingOperations.set(requestId, { button, idleLabel });
  operationStatus.dataset.state = "busy";
  operationStatus.textContent = busyLabel;
  return requestId;
}

function finishOperation(requestId: unknown, message: string, ok = true): void {
  if (typeof requestId !== "string") return;
  const pending = pendingOperations.get(requestId);
  if (pending?.button) {
    pending.button.disabled = false;
    pending.button.removeAttribute("aria-busy");
    pending.button.textContent = pending.idleLabel;
  }
  pendingOperations.delete(requestId);
  operationStatus.dataset.state = ok ? "success" : "error";
  operationStatus.textContent = message;
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

function applyProviderKind(): void {
  const kind = providerKind.value as ProviderKind;
  activeProviderKind = kind;
  providerEndpoint.value = providerDrafts[kind].endpoint;
  providerModel.value = providerDrafts[kind].model;
  providerProxyMode.value = providerDrafts[kind].proxyMode;
  document.querySelector<HTMLElement>("#credential-row")!.hidden = kind === "ollama";
  document.querySelector<HTMLElement>("#endpoint-hint")!.textContent =
    kind === "openai"
      ? "Enter an API root. Every value is treated as a root and receives /chat/completions."
      : "Ollama server root; local HTTP loopback is allowed.";
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

function loadEditor(profile: ProfileView): void {
  editingProfile = profile;
  profileName.value = profile.displayName;
  providerKind.value = profile.kind;
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
  profileName.value = "My translator";
  providerProxyMode.value = "system";
  providerKey.value = "";
  providerKey.placeholder = "Not shown after saving";
  saveProfileButton.textContent = "Save profile";
  newProfileButton.hidden = true;
  operationStatus.dataset.state = "success";
  operationStatus.textContent = "Ready to create a new profile.";
}

enabled.addEventListener("change", () => {
  const requestId = beginOperation(
    null,
    enabled.checked ? "Enabling translation…" : "Disabling translation…",
  );
  window.iina?.postMessage(
    "translation:set-enabled",
    envelope({ enabled: enabled.checked }, requestId),
  );
});

saveLanguagesButton.addEventListener("click", () => {
  const requestId = beginOperation(saveLanguagesButton, "Saving languages…");
  window.iina?.postMessage(
    "defaults:save",
    envelope(
      {
        targetLanguage: targetLanguage.value,
        sourceLanguage: sourceLanguage.value.trim() || null,
        sourceLanguageMode: sourceLanguage.value.trim() ? "manual" : "track",
      },
      requestId,
    ),
  );
});

saveProfileButton.addEventListener("click", () => {
  const requestId = beginOperation(
    saveProfileButton,
    editingProfile ? "Updating profile…" : "Saving profile…",
  );
  pendingProfileSave = { requestId, secret: providerKey.value || null };
  window.iina?.postMessage(
    "profile:save",
    envelope(
      {
        ...(editingProfile
          ? { profileId: editingProfile.profileId, expectedRevision: editingProfile.revision }
          : {}),
        displayName: profileName.value.trim() || "Provider",
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
      operationStatus.dataset.state = "success";
      operationStatus.textContent = `Editing ${profile.displayName}.`;
      break;
    case "select": {
      loadEditor(profile);
      const requestId = beginOperation(button, "Selecting…");
      window.iina?.postMessage("profile:select", envelope(selection, requestId));
      break;
    }
    case "test": {
      const requestId = beginOperation(button, "Testing…");
      pendingProfileTests.set(requestId, {
        profileId: profile.profileId,
        revision: profile.revision,
      });
      window.iina?.postMessage("provider:test", envelope(selection, requestId));
      break;
    }
    case "delete": {
      const requestId = beginOperation(button, "Confirming…");
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
    finishOperation(
      result.requestId,
      result.selectionInvalidated
        ? "Profile updated. Select it again to authorize translation."
        : "Profile saved.",
    );
    pendingProfileSave = null;
  }
  window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("profile:selected", (raw: unknown) => {
  const result = raw as { requestId?: string; selection?: { profileId?: string } };
  selectedProfileId = result.selection?.profileId ?? selectedProfileId;
  finishOperation(result.requestId, "Profile selected for translation.");
});

window.iina?.onMessage("profile:deleted", (raw: unknown) => {
  const result = raw as { requestId?: string; profileId?: string };
  if (editingProfile?.profileId === result.profileId) resetEditor();
  if (selectedProfileId === result.profileId) selectedProfileId = null;
  if (result.profileId) profileTestStates.delete(result.profileId);
  finishOperation(result.requestId, "Profile and saved credential deleted.");
  window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("provider:test-result", (raw: unknown) => {
  const result = raw as {
    requestId?: string;
    ok?: boolean;
    category?: string;
    userAction?: string;
  };
  finishOperation(
    result.requestId,
    window.sublingoProviderTestStatusMessage(result),
    result.ok === true,
  );
  if (typeof result.requestId === "string") {
    const tested = pendingProfileTests.get(result.requestId);
    pendingProfileTests.delete(result.requestId);
    if (tested)
      profileTestStates.set(tested.profileId, {
        revision: tested.revision,
        state: result.ok === true ? "passed" : "failed",
      });
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
    finishOperation(
      result.requestId,
      ready ? "Profile and local credential saved." : message,
      ready,
    );
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
  };
  const message = result.cancelled
    ? "Operation cancelled. Nothing was changed."
    : result.action === "languages"
      ? "Language settings saved."
      : result.action === "translation"
        ? enabled.checked
          ? "Translation enabled."
          : "Translation disabled."
        : "Operation completed.";
  finishOperation(result.requestId, message, result.ok === true || result.cancelled === true);
});

window.iina?.onMessage("operation:error", (raw: unknown) => {
  const result = raw as { requestId?: string };
  finishOperation(
    result.requestId,
    "The operation could not be completed. Review the service settings and try again.",
    false,
  );
  if (pendingProfileSave?.requestId === result.requestId) pendingProfileSave = null;
});

function renderProfiles(viewProfiles: ProfileView[]): void {
  profiles.clear();
  profilesElement.replaceChildren();
  if (!viewProfiles.length) {
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
    profilesElement.append(article);
  }
}

window.iina?.onMessage("state:update", (raw: unknown) => {
  const view = raw as {
    status?: SessionStatus;
    source?: {
      format: string;
      cueCount: number;
      language: string | null;
      detectedLanguage?: string | null;
    } | null;
    cacheSize?: number;
    boundedWork?: string;
    profiles?: ProfileView[];
    selection?: { profileId: string; revision: number } | null;
    sourceIssue?: string | null;
    providerError?: SessionProviderError | null;
  };
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
  if (view.source) {
    sourceSummary.hidden = false;
    document.querySelector<HTMLElement>("#source-format")!.textContent =
      view.source.format.toUpperCase();
    document.querySelector<HTMLElement>("#source-cues")!.textContent = String(view.source.cueCount);
    document.querySelector<HTMLElement>("#source-detected-language")!.textContent =
      view.source.detectedLanguage ?? "Unknown";
    if (!sourceLanguage.value && view.source.language) sourceLanguage.value = view.source.language;
  } else if (view.source === null) {
    sourceSummary.hidden = true;
  }
  if (typeof view.cacheSize === "number")
    document.querySelector<HTMLElement>("#cache-size")!.textContent = `${view.cacheSize} cues`;
  if (view.boundedWork)
    document.querySelector<HTMLElement>("#work-bound")!.textContent = view.boundedWork;
  selectedProfileId = view.selection?.profileId ?? null;
  if (view.profiles) {
    const signature = JSON.stringify({
      selectedProfileId,
      profiles: view.profiles.map((profile) => [
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
      renderProfiles(view.profiles);
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

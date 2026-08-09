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

const statusMessage = document.querySelector<HTMLParagraphElement>("#status")!;
const statusDot = document.querySelector<HTMLSpanElement>("#status-dot")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const targetLanguage = document.querySelector<HTMLSelectElement>("#target-language")!;
const sourceLanguage = document.querySelector<HTMLInputElement>("#source-language")!;
const sourceSummary = document.querySelector<HTMLElement>("#source-summary")!;
const providerKind = document.querySelector<HTMLSelectElement>("#provider-kind")!;
const providerEndpoint = document.querySelector<HTMLInputElement>("#provider-endpoint")!;
const providerModel = document.querySelector<HTMLInputElement>("#provider-model")!;
const providerKey = document.querySelector<HTMLInputElement>("#provider-key")!;
const profilesElement = document.querySelector<HTMLElement>("#profiles")!;
let pendingSecret: string | null = null;

type ProviderKind = "openai" | "ollama";
const providerDrafts: Record<ProviderKind, { endpoint: string; model: string }> = {
  openai: { endpoint: "https://api.openai.com/v1", model: "" },
  ollama: { endpoint: "http://127.0.0.1:11434", model: "" },
};
let activeProviderKind: ProviderKind = "openai";

function updateProviderFields(): void {
  const kind = providerKind.value as ProviderKind;
  providerDrafts[activeProviderKind] = {
    endpoint: providerEndpoint.value.trim(),
    model: providerModel.value.trim(),
  };
  activeProviderKind = kind;
  providerEndpoint.value = providerDrafts[kind].endpoint;
  providerModel.value = providerDrafts[kind].model;
  document.querySelector<HTMLElement>("#credential-row")!.hidden = kind === "ollama";
  document.querySelector<HTMLElement>("#endpoint-hint")!.textContent =
    kind === "openai"
      ? "OpenAI-compatible API root, usually ending in /v1."
      : "Ollama server root; local HTTP loopback is allowed.";
  document.querySelector<HTMLElement>("#model-hint")!.textContent =
    kind === "openai"
      ? "Enter the exact model identifier exposed by this service."
      : "Enter the exact Ollama tag, for example translategemma or qwen3:8b.";
  providerModel.placeholder = kind === "openai" ? "e.g. gpt-4.1-mini" : "e.g. translategemma";
}
providerKind.addEventListener("change", updateProviderFields);

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return { requestId: `ui-${Date.now()}`, revision: 1, payload };
}

enabled.addEventListener("change", () => {
  window.iina?.postMessage("translation:set-enabled", envelope({ enabled: enabled.checked }));
});

document.querySelector("#save-languages")?.addEventListener("click", () => {
  window.iina?.postMessage(
    "defaults:save",
    envelope({
      targetLanguage: targetLanguage.value,
      sourceLanguage: sourceLanguage.value.trim() || null,
      sourceLanguageMode: sourceLanguage.value.trim() ? "manual" : "track",
    }),
  );
});

document.querySelector("#save-profile")?.addEventListener("click", () => {
  pendingSecret = providerKey.value || null;
  window.iina?.postMessage(
    "profile:save",
    envelope({
      displayName:
        document.querySelector<HTMLInputElement>("#profile-name")!.value.trim() || "Provider",
      kind: providerKind.value,
      endpoint: providerEndpoint.value.trim(),
      model: providerModel.value.trim() || undefined,
    }),
  );
});

profilesElement.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const selection = {
    profileId: button.dataset.profileId,
    revision: Number(button.dataset.revision),
    endpointFingerprint: button.dataset.endpointFingerprint,
  };
  if (button.dataset.action === "select")
    window.iina?.postMessage("profile:select", envelope(selection));
  if (button.dataset.action === "test")
    window.iina?.postMessage("provider:test", envelope(selection));
});

document.querySelector("#reset-vault")?.addEventListener("click", () => {
  if (
    window.confirm(
      "Reset the encrypted credential vault? Saved API keys will be permanently removed.",
    )
  ) {
    window.iina?.postMessage("vault:reset", envelope({ confirmed: true }));
  }
});

window.iina?.onMessage("profile:revision-created", (raw: unknown) => {
  const profile = (raw as { profile?: { profileId: string; revision: number } }).profile;
  if (profile && pendingSecret) {
    window.iina?.postMessage(
      "secret:set",
      envelope({
        profileId: profile.profileId,
        expectedRevision: profile.revision,
        fields: { apiKey: pendingSecret },
      }),
    );
  }
  pendingSecret = null;
  providerKey.value = "";
  window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("provider:test-result", (raw: unknown) => {
  const result = raw as { ok?: boolean; code?: string };
  statusMessage.textContent = result.ok
    ? "Connection test passed. Select this profile to authorize translation."
    : "Connection test failed. Check the endpoint, credentials, model, and service status.";
});

window.iina?.onMessage("vault:state", (raw: unknown) => {
  const state = (raw as { state?: string }).state ?? "unavailable";
  document.querySelector<HTMLElement>("#vault-state")!.textContent =
    state === "ready"
      ? "Encrypted credential vault ready."
      : "Credential vault is locked or corrupt. Reset it, then re-enter credentials.";
  if (state === "ready") window.iina?.postMessage("ui:ready", envelope({}));
});

window.iina?.onMessage("operation:error", () => {
  statusMessage.textContent =
    "The operation could not be completed. Review the highlighted service settings and try again.";
});

window.iina?.onMessage("state:update", (raw: unknown) => {
  const view = raw as {
    status?: SessionStatus;
    source?: { format: string; cueCount: number; language: string | null } | null;
    cacheSize?: number;
    boundedWork?: string;
    profiles?: Array<{
      profileId: string;
      revision: number;
      displayName: string;
      kind: string;
      endpoint: string;
      endpointFingerprint: string;
      model?: string;
      credentialConfigured: boolean;
    }>;
    selection?: { profileId: string; revision: number };
  };
  if (view.status && labels[view.status]) {
    statusMessage.textContent = labels[view.status];
    statusDot.dataset.state = view.status;
    enabled.checked = view.status !== "disabled";
  }
  if (view.source) {
    sourceSummary.hidden = false;
    document.querySelector<HTMLElement>("#source-format")!.textContent =
      view.source.format.toUpperCase();
    document.querySelector<HTMLElement>("#source-cues")!.textContent = String(view.source.cueCount);
    document.querySelector<HTMLElement>("#source-detected-language")!.textContent =
      view.source.language ?? "Unknown";
    if (!sourceLanguage.value && view.source.language) sourceLanguage.value = view.source.language;
  } else if (view.source === null) {
    sourceSummary.hidden = true;
  }
  if (typeof view.cacheSize === "number") {
    document.querySelector<HTMLElement>("#cache-size")!.textContent = `${view.cacheSize} cues`;
  }
  if (view.boundedWork)
    document.querySelector<HTMLElement>("#work-bound")!.textContent = view.boundedWork;
  if (view.profiles) {
    profilesElement.replaceChildren();
    if (!view.profiles.length)
      profilesElement.innerHTML = '<p class="empty">No saved profiles yet.</p>';
    for (const profile of view.profiles) {
      const article = document.createElement("article");
      article.className = "profile";
      article.innerHTML = `<div><strong></strong><span></span><code></code></div><div class="profile-actions"></div>`;
      article.querySelector("strong")!.textContent = profile.displayName;
      article.querySelector("span")!.textContent =
        `${profile.kind}${profile.model ? ` · ${profile.model}` : ""}${profile.credentialConfigured ? " · key saved" : ""}`;
      article.querySelector("code")!.textContent = profile.endpoint;
      const actions = article.querySelector<HTMLElement>(".profile-actions")!;
      for (const [action, label] of [
        ["test", "Test"],
        ["select", "Select"],
      ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = action === "test" ? "secondary" : "";
        button.dataset.action = action;
        button.dataset.profileId = profile.profileId;
        button.dataset.revision = String(profile.revision);
        button.dataset.endpointFingerprint = profile.endpointFingerprint;
        button.textContent = label;
        actions.append(button);
      }
      profilesElement.append(article);
    }
  }
});

window.iina?.postMessage("ui:ready", envelope({}));
window.setInterval(() => window.iina?.postMessage("ui:poll", envelope({})), 750);
updateProviderFields();

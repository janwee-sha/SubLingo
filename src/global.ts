import { sha256Hex } from "./domain/identity.js";
import { normalizeProviderError } from "./domain/errors.js";
import {
  parseProfileSelection,
  parseSecretSet,
  parseTranslationBatchProgress,
  sanitizedProfileView,
} from "./domain/messages.js";
import { HelperCredentialStore, CredentialStoreError } from "./credentials/store.js";
import { createDeferredPlayerPost } from "./adapters/iina/deferred-post.js";
import { IinaLocalHttpBridge, IinaProcessLauncher } from "./adapters/iina/provider-transport.js";
import { discoverHelperExecutable, TransportProcess } from "./adapters/iina/transport-process.js";
import { ProviderBroker } from "./providers/broker.js";
import { ProviderConnectionTests } from "./providers/connection-tests.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { ProviderProfiles } from "./providers/profiles.js";
import type { ConfiguredProvider } from "./providers/provider.js";
import type { ProviderProfileSnapshot, TranslationBatchRequest } from "./providers/types.js";
import { HelperProviderTransport as ProviderTransportAdapter } from "./adapters/iina/provider-transport.js";
import { TransportClient } from "./transport/client.js";
import { TransportSupervisor } from "./transport/supervisor.js";

let idSequence = 0;
function localUuid(): string {
  const hex = sha256Hex(`sublingo:${Date.now()}:${++idSequence}`);
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const profiles = new ProviderProfiles(localUuid);
const providerCache = new Map<string, Promise<ConfiguredProvider>>();
const providerConnectionTests = new ProviderConnectionTests(localUuid);

function restoreProfileMetadata(): void {
  const raw = iina.preferences.get("providerProfilesJson");
  if (typeof raw !== "string") return;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    for (const item of saved) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const value = item as Record<string, unknown>;
      if (
        typeof value.profileId !== "string" ||
        !value.profileId ||
        typeof value.displayName !== "string" ||
        (value.kind !== "openai" && value.kind !== "ollama") ||
        typeof value.endpoint !== "string" ||
        typeof value.model !== "string"
      )
        continue;
      try {
        profiles.save({
          profileId: value.profileId,
          expectedRevision: 0,
          displayName: value.displayName,
          kind: value.kind,
          endpoint: value.endpoint,
          model: value.model,
          proxyMode: value.proxyMode === "direct" ? "direct" : "system",
          ...(value.capability === "strict-json-schema" ||
          value.capability === "json-object" ||
          value.capability === "prompt-json"
            ? { capability: value.capability }
            : {}),
        });
      } catch {
        /* Ignore one invalid preference entry without losing valid profiles. */
      }
    }
  } catch {
    /* Corrupt non-secret metadata is equivalent to no saved profiles. */
  }
}

function persistProfileMetadata(): void {
  const saved = profiles.listLatest().map((profile) => ({
    profileId: profile.profileId,
    displayName: profile.displayName,
    kind: profile.kind,
    endpoint: profile.endpoint,
    model: profile.model ?? "",
    proxyMode: profile.proxyMode ?? "system",
    ...(profile.capability ? { capability: profile.capability } : {}),
  }));
  iina.preferences.set("providerProfilesJson", JSON.stringify(saved));
  iina.preferences.sync();
}

restoreProfileMetadata();

const transport = new TransportSupervisor(async () => {
  const session = await TransportProcess.bootstrap(
    new IinaProcessLauncher(iina.utils),
    { dataDirectory: iina.utils.resolvePath("@data/.") },
    discoverHelperExecutable({
      exists: (path) => iina.file.exists(path),
      resolvePath: (path) => iina.utils.resolvePath(path),
      list: (path) => iina.file.list(path, { includeSubDir: false }),
      read: (path) => iina.file.read(path) ?? null,
    }),
  );
  return new TransportClient(session, new IinaLocalHttpBridge(iina.http));
});

const credentials = new HelperCredentialStore(transport);

function providerCacheKey(profile: ProviderProfileSnapshot): string {
  return `${profile.profileId}\u0000${profile.revision}`;
}

async function buildProvider(profile: ProviderProfileSnapshot): Promise<ConfiguredProvider> {
  const providerTransport = new ProviderTransportAdapter(transport, localUuid);
  switch (profile.kind) {
    case "openai": {
      if (!profile.model)
        throw {
          category: "model",
          retryable: false,
          providerCode: "MODEL_REQUIRED",
          userAction: "CHECK_MODEL",
        };
      const secret = await credentials.getSecret(profile.profileId);
      const openai = new OpenAICompatibleProvider(
        {
          endpoint: profile.endpoint,
          model: profile.model,
          ...(secret?.apiKey ? { apiKey: secret.apiKey } : {}),
          ...(profile.capability ? { capability: profile.capability } : {}),
          proxyMode: profile.proxyMode ?? "system",
        },
        providerTransport,
      );
      return openai;
    }
    case "ollama": {
      if (!profile.model)
        throw {
          category: "model",
          retryable: false,
          providerCode: "MODEL_REQUIRED",
          userAction: "CHECK_MODEL",
        };
      return new OllamaProvider(
        {
          endpoint: profile.endpoint,
          model: profile.model,
          proxyMode: profile.proxyMode ?? "system",
        },
        providerTransport,
      );
    }
  }
}

function providerFor(profile: ProviderProfileSnapshot): Promise<ConfiguredProvider> {
  const key = providerCacheKey(profile);
  const cached = providerCache.get(key);
  if (cached) return cached;
  const created = buildProvider(profile);
  providerCache.set(key, created);
  void created.catch(() => {
    if (providerCache.get(key) === created) providerCache.delete(key);
  });
  return created;
}

const broker = new ProviderBroker(profiles, providerFor);

function credentialFailure(error: unknown): {
  state: "unavailable";
  code: string;
  category: string;
  userAction: string;
} {
  if (error instanceof CredentialStoreError) {
    return {
      state: "unavailable",
      code: error.code,
      category: "configuration",
      userAction: "RESTART_IINA",
    };
  }
  const safe = normalizeProviderError(error);
  if (safe.providerCode && safe.providerCode !== "UNKNOWN_PROVIDER_ERROR") {
    return {
      state: "unavailable",
      code: safe.providerCode,
      category: safe.category,
      userAction: safe.userAction,
    };
  }
  return {
    state: "unavailable",
    code: "CREDENTIAL_STORE_UNAVAILABLE",
    category: "protocol",
    userAction: "RESTART_IINA",
  };
}

function payload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_MESSAGE");
  const value = (raw as Record<string, unknown>).payload;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_MESSAGE");
  return value as Record<string, unknown>;
}

function requestId(raw: unknown): string {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).requestId : undefined;
  return typeof value === "string" ? value : localUuid();
}

function supportedProviderKind(value: unknown): "openai" | "ollama" {
  if (value === "openai" || value === "ollama") return value;
  throw new Error("UNSUPPORTED_PROVIDER_KIND");
}

// IINA 1.4.4 traps when a global handler synchronously posts back through
// JavascriptAPIGlobalController. Crossing a timer boundary also keeps every
// reply outside the originating JavaScriptCore callback.
const postToPlayer = createDeferredPlayerPost(
  (playerId, name, data) => iina.global.postMessage(playerId, name, data),
  setTimeout,
);

async function profileViews(): Promise<unknown[]> {
  return Promise.all(
    profiles.listLatest().map(async (profile) => {
      let credential: Record<string, string> | null = null;
      if (profile.kind === "openai") {
        try {
          credential = await credentials.getSecret(profile.profileId);
        } catch {
          /* Profile metadata remains usable when the credential file is unavailable. */
        }
      }
      return sanitizedProfileView({ ...profile, ...(credential ? { credential } : {}) });
    }),
  );
}

iina.global.onMessage("defaults:save", (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const values = payload(raw);
    for (const key of [
      "targetLanguage",
      "sourceLanguage",
      "sourceLanguageMode",
      "enabledByDefault",
    ]) {
      const value = values[key];
      if (typeof value === "string" || typeof value === "boolean" || value === null)
        iina.preferences.set(key, value);
    }
    iina.preferences.sync();
    postToPlayer(playerId, "defaults:saved", { requestId: requestId(raw) });
  } catch {
    postToPlayer(playerId, "operation:error", {
      code: "INVALID_DEFAULTS",
      userAction: "NONE",
    });
  }
});

iina.global.onMessage("profiles:list", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  postToPlayer(playerId, "profiles:result", {
    requestId: requestId(raw),
    profiles: await profileViews(),
  });
});

iina.global.onMessage("profile:create-revision", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const values = payload(raw);
    const previousSelection = profiles.selection(playerId);
    const profile = profiles.save({
      ...(typeof values.profileId === "string" ? { profileId: values.profileId } : {}),
      ...(typeof values.expectedRevision === "number"
        ? { expectedRevision: values.expectedRevision }
        : {}),
      editingWindowId: playerId,
      displayName: String(values.displayName ?? "Provider"),
      kind: supportedProviderKind(values.kind),
      endpoint: String(values.endpoint ?? ""),
      proxyMode: values.proxyMode === "direct" ? "direct" : "system",
      ...(typeof values.model === "string" ? { model: values.model } : {}),
    });
    await Promise.all([
      broker.cancelProfile(profile.profileId),
      providerConnectionTests.cancelProfile(profile.profileId),
    ]);
    persistProfileMetadata();
    postToPlayer(playerId, "profile:revision-created", {
      requestId: requestId(raw),
      profile: sanitizedProfileView(profile),
      selectionInvalidated:
        previousSelection?.profileId === profile.profileId && profile.revision > 1,
    });
  } catch {
    postToPlayer(playerId, "operation:error", {
      requestId: requestId(raw),
      code: "PROFILE_SAVE_FAILED",
      userAction: "CHECK_ENDPOINT",
    });
  }
});

iina.global.onMessage("profile:delete", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const values = payload(raw);
    const profileId = String(values.profileId ?? "");
    const expectedRevision = Number(values.expectedRevision);
    const profile = profiles.get(profileId);
    if (!profile || profile.revision !== expectedRevision)
      throw new Error("STALE_PROFILE_REVISION");
    await broker.cancelProfile(profileId);
    await providerConnectionTests.cancelProfile(profileId);
    await credentials.deleteSecret(profileId);
    const affectedPlayerIds = profiles.delete(profileId);
    for (const key of [...providerCache.keys()])
      if (key.startsWith(`${profileId}\u0000`)) providerCache.delete(key);
    persistProfileMetadata();
    for (const target of new Set([playerId, ...affectedPlayerIds]))
      postToPlayer(target, "profile:deleted", {
        requestId: requestId(raw),
        profileId,
        selectionInvalidated: affectedPlayerIds.includes(target),
      });
  } catch {
    postToPlayer(playerId, "operation:error", {
      requestId: requestId(raw),
      code: "PROFILE_DELETE_FAILED",
      userAction: "NONE",
    });
  }
});

iina.global.onMessage("credential:set", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const secret = parseSecretSet(payload(raw));
    const profile = profiles.get(secret.profileId);
    if (!profile || profile.revision !== secret.expectedRevision)
      throw new Error("STALE_PROFILE_REVISION");
    await credentials.setSecret(secret.profileId, secret.fields);
    providerCache.delete(`${secret.profileId}\u0000${secret.expectedRevision}`);
    postToPlayer(playerId, "credential:result", {
      requestId: requestId(raw),
      state: "ready",
      profileId: secret.profileId,
    });
  } catch (error) {
    const failure = credentialFailure(error);
    postToPlayer(playerId, "credential:state", {
      requestId: requestId(raw),
      ...failure,
    });
  }
});

iina.global.onMessage("profile:select", (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const selection = parseProfileSelection(payload(raw));
    broker.select(playerId, selection.profileId, selection.revision, selection.endpointFingerprint);
    broker.lease(playerId, selection.profileId, selection.revision);
    postToPlayer(playerId, "profile:selected", { requestId: requestId(raw), selection });
  } catch {
    postToPlayer(playerId, "operation:error", {
      requestId: requestId(raw),
      code: "PROFILE_SELECTION_FAILED",
      userAction: "SELECT_PROFILE",
    });
  }
});

iina.global.onMessage("provider:test", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const externalRequestId = requestId(raw);
  let testId: string | null = null;
  try {
    const values = payload(raw);
    const profile = profiles.get(String(values.profileId));
    if (!profile || profile.revision !== Number(values.revision))
      throw new Error("PROFILE_NOT_FOUND");
    const provider = await providerFor(profile);
    if (profiles.get(profile.profileId)?.revision !== profile.revision)
      throw new Error("PROFILE_NOT_FOUND");
    const task = providerConnectionTests.start({
      playerId,
      requestId: externalRequestId,
      profileId: profile.profileId,
      profileRevision: profile.revision,
      provider,
    });
    testId = task.testId;
    const result = await provider.testConnection(task.testId);
    const completed = providerConnectionTests.complete(task.testId);
    if (!completed) return;
    testId = null;
    postToPlayer(completed.playerId, "provider:test-result", {
      requestId: completed.requestId,
      ok: true,
      result,
    });
  } catch (error) {
    const completed = testId ? providerConnectionTests.complete(testId) : null;
    if (testId && !completed) return;
    const safe = normalizeProviderError(error);
    postToPlayer(completed?.playerId ?? playerId, "provider:test-result", {
      requestId: completed?.requestId ?? externalRequestId,
      ok: false,
      category: safe.category,
      retryable: safe.retryable,
      ...(safe.statusCode === undefined ? {} : { statusCode: safe.statusCode }),
      ...(safe.providerCode ? { code: safe.providerCode } : {}),
      ...(safe.retryAfterMs === undefined ? {} : { retryAfterMs: safe.retryAfterMs }),
      userAction: safe.userAction,
    });
  }
});

iina.global.onMessage("provider:attempt", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const id = requestId(raw);
  try {
    const request = payload(raw) as unknown as TranslationBatchRequest;
    if (request.requestId !== id) throw new Error("REQUEST_ID_MISMATCH");
    const result = await broker.attempt(playerId, request, (progress) => {
      try {
        postToPlayer(playerId, "provider:attempt-progress", {
          requestId: id,
          progress: parseTranslationBatchProgress(progress),
        });
      } catch {
        return;
      }
    });
    postToPlayer(playerId, "provider:attempt-result", { requestId: id, result });
  } catch (error) {
    const safe = normalizeProviderError(error);
    postToPlayer(playerId, "provider:attempt-error", {
      requestId: id,
      error: safe,
    });
  }
});

iina.global.onMessage("provider:cancel", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const values = payload(raw);
  await broker.cancel(playerId, String(values.requestId ?? requestId(raw)));
  postToPlayer(playerId, "provider:cancelled", { requestId: requestId(raw) });
});

iina.global.onMessage("profile:release", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const values = payload(raw);
  await providerConnectionTests.cancelPlayer(playerId);
  broker.release(playerId, String(values.profileId), Number(values.revision));
});

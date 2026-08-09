import { sha256Hex } from "./domain/identity.js";
import { sanitizedProfileView, parseProfileSelection, parseSecretSet } from "./domain/messages.js";
import { IinaVaultKeychain } from "./adapters/iina/keychain.js";
import { createDeferredPlayerPost } from "./adapters/iina/deferred-post.js";
import { IinaLocalHttpBridge, IinaProcessLauncher } from "./adapters/iina/provider-transport.js";
import { discoverHelperExecutable, TransportProcess } from "./adapters/iina/transport-process.js";
import { IinaVaultFiles } from "./adapters/iina/vault-files.js";
import { ProviderBroker } from "./providers/broker.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAICompatibleProvider } from "./providers/openai.js";
import { ProviderProfiles } from "./providers/profiles.js";
import type { TranslationProvider } from "./providers/provider.js";
import type { ProviderProfileSnapshot, TranslationBatchRequest } from "./providers/types.js";
import { HelperProviderTransport as ProviderTransportAdapter } from "./adapters/iina/provider-transport.js";
import { TransportClient } from "./transport/client.js";
import { CredentialVaultStore } from "./vault/store.js";

let idSequence = 0;
function localUuid(): string {
  const hex = sha256Hex(`sublingo:${Date.now()}:${++idSequence}`);
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const profiles = new ProviderProfiles(localUuid);
let transportPromise: Promise<TransportClient> | null = null;

async function transportClient(): Promise<TransportClient> {
  if (!transportPromise) {
    transportPromise = TransportProcess.bootstrap(
      new IinaProcessLauncher(iina.utils),
      discoverHelperExecutable(iina.file),
    )
      .then((session) => new TransportClient(session, new IinaLocalHttpBridge(iina.http)))
      .catch((error) => {
        transportPromise = null;
        throw error;
      });
  }
  return transportPromise;
}

const vault = new CredentialVaultStore({
  pluginId: "io.sublingo.iina",
  files: new IinaVaultFiles(iina.file),
  keychain: new IinaVaultKeychain(iina.utils),
  random: async (length) =>
    (await transportClient()).random(length, length === 32 ? "vault-dek" : "vault-nonce"),
  id: localUuid,
});
void vault.reload();

async function providerFor(profile: ProviderProfileSnapshot): Promise<TranslationProvider> {
  const transport = new ProviderTransportAdapter(await transportClient());
  const secret = await vault.getSecret(profile.profileId);
  switch (profile.kind) {
    case "azure":
      throw {
        category: "configuration",
        retryable: false,
        providerCode: "AZURE_UNSUPPORTED",
        userAction: "SELECT_PROFILE",
      };
    case "openai":
      if (!profile.model)
        throw {
          category: "model",
          retryable: false,
          providerCode: "MODEL_REQUIRED",
          userAction: "CHECK_MODEL",
        };
      return new OpenAICompatibleProvider(
        {
          endpoint: profile.endpoint,
          model: profile.model,
          ...(secret?.apiKey ? { apiKey: secret.apiKey } : {}),
          ...(profile.capability ? { capability: profile.capability } : {}),
        },
        transport,
      );
    case "ollama":
      if (!profile.model)
        throw {
          category: "model",
          retryable: false,
          providerCode: "MODEL_REQUIRED",
          userAction: "CHECK_MODEL",
        };
      return new OllamaProvider({ endpoint: profile.endpoint, model: profile.model }, transport);
  }
}

const broker = new ProviderBroker(profiles, providerFor);

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
      const credential = await vault.getSecret(profile.profileId);
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
    const profile = profiles.save({
      ...(typeof values.profileId === "string" ? { profileId: values.profileId } : {}),
      ...(typeof values.expectedRevision === "number"
        ? { expectedRevision: values.expectedRevision }
        : {}),
      editingWindowId: playerId,
      displayName: String(values.displayName ?? "Provider"),
      kind: supportedProviderKind(values.kind),
      endpoint: String(values.endpoint ?? ""),
      ...(typeof values.model === "string" ? { model: values.model } : {}),
      ...(typeof values.region === "string" ? { region: values.region } : {}),
    });
    postToPlayer(playerId, "profile:revision-created", {
      requestId: requestId(raw),
      profile: sanitizedProfileView(profile),
    });
  } catch {
    postToPlayer(playerId, "operation:error", {
      code: "PROFILE_SAVE_FAILED",
      userAction: "CHECK_ENDPOINT",
    });
  }
});

iina.global.onMessage("vault:set-secret", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const secret = parseSecretSet(payload(raw));
    const profile = profiles.get(secret.profileId);
    if (!profile || profile.revision !== secret.expectedRevision)
      throw new Error("STALE_PROFILE_REVISION");
    await vault.setSecret(secret.profileId, secret.fields);
    postToPlayer(playerId, "vault:result", {
      requestId: requestId(raw),
      state: "ready",
      profileId: secret.profileId,
    });
  } catch {
    postToPlayer(playerId, "vault:state", {
      state: vault.state === "locked" ? "locked" : "corrupt",
      code: "VAULT_WRITE_FAILED",
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
      code: "PROFILE_SELECTION_FAILED",
      userAction: "SELECT_PROFILE",
    });
  }
});

iina.global.onMessage("provider:test", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    const values = payload(raw);
    const profile = profiles.get(String(values.profileId), Number(values.revision));
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    const provider = (await providerFor(profile)) as TranslationProvider & {
      probe?: () => Promise<unknown>;
    };
    const result = provider.probe ? await provider.probe() : { ok: true };
    postToPlayer(playerId, "provider:test-result", {
      requestId: requestId(raw),
      ok: true,
      result,
    });
  } catch {
    postToPlayer(playerId, "provider:test-result", {
      requestId: requestId(raw),
      ok: false,
      code: "CONNECTION_TEST_FAILED",
      userAction: "CHECK_ENDPOINT",
    });
  }
});

iina.global.onMessage("provider:attempt", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const id = requestId(raw);
  try {
    const result = await broker.attempt(
      playerId,
      payload(raw) as unknown as TranslationBatchRequest,
    );
    postToPlayer(playerId, "provider:attempt-result", { requestId: id, result });
  } catch (error) {
    const safe = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
    postToPlayer(playerId, "provider:attempt-error", {
      requestId: id,
      error: {
        category: typeof safe.category === "string" ? safe.category : "configuration",
        retryable: safe.retryable === true,
        providerCode:
          typeof safe.providerCode === "string" ? safe.providerCode : "PROVIDER_ATTEMPT_FAILED",
        userAction: typeof safe.userAction === "string" ? safe.userAction : "SELECT_PROFILE",
      },
    });
  }
});

iina.global.onMessage("provider:cancel", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const values = payload(raw);
  await broker.cancel(playerId, String(values.requestId ?? requestId(raw)));
  postToPlayer(playerId, "provider:cancelled", { requestId: requestId(raw) });
});

iina.global.onMessage("profile:release", (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  const values = payload(raw);
  broker.release(playerId, String(values.profileId), Number(values.revision));
});

iina.global.onMessage("vault:reset", async (raw: unknown, playerId?: string) => {
  if (!playerId) return;
  try {
    if (payload(raw).confirmed !== true) throw new Error("CONFIRMATION_REQUIRED");
    await vault.reset();
    postToPlayer(playerId, "vault:state", { state: "ready" });
  } catch {
    postToPlayer(playerId, "vault:state", {
      state: "locked",
      code: "VAULT_RESET_FAILED",
    });
  }
});

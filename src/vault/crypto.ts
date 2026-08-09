import { gcm } from "@noble/ciphers/aes.js";
import { base64Decode, base64Encode, utf8Decode, utf8Encode } from "../domain/codec.js";
import { canonicalJson } from "../domain/identity.js";
import type { CredentialVaultEnvelope, VaultEntryIndex, VaultSecrets } from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateVaultEnvelope(value: unknown): value is CredentialVaultEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (
    Object.keys(envelope).sort().join(",") !==
      "algorithm,ciphertextAndTagB64,entries,formatVersion,nonceB64,revision,vaultId" ||
    envelope.formatVersion !== 1 ||
    envelope.algorithm !== "A256GCM" ||
    typeof envelope.vaultId !== "string" ||
    !UUID.test(envelope.vaultId) ||
    !Number.isInteger(envelope.revision) ||
    (envelope.revision as number) < 1 ||
    typeof envelope.nonceB64 !== "string" ||
    typeof envelope.ciphertextAndTagB64 !== "string" ||
    !Array.isArray(envelope.entries)
  )
    return false;
  try {
    if (
      base64Decode(envelope.nonceB64).length !== 12 ||
      base64Decode(envelope.ciphertextAndTagB64).length < 16
    )
      return false;
  } catch {
    return false;
  }
  return envelope.entries.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const index = entry as Record<string, unknown>;
    return (
      Object.keys(index).sort().join(",") === "fieldNames,profileId,secretRevision" &&
      typeof index.profileId === "string" &&
      UUID.test(index.profileId) &&
      Number.isInteger(index.secretRevision) &&
      (index.secretRevision as number) >= 1 &&
      Array.isArray(index.fieldNames) &&
      new Set(index.fieldNames).size === index.fieldNames.length &&
      index.fieldNames.every((field) => typeof field === "string" && field.length > 0)
    );
  });
}

function aad(input: {
  pluginId: string;
  vaultId: string;
  revision: number;
  entries: readonly VaultEntryIndex[];
}): Uint8Array {
  return utf8Encode(
    canonicalJson({
      pluginId: input.pluginId,
      vaultId: input.vaultId,
      formatVersion: 1,
      revision: input.revision,
      entries: input.entries,
    }),
  );
}

export function createVaultEnvelope(
  input: {
    pluginId: string;
    vaultId: string;
    revision: number;
    entries: VaultEntryIndex[];
    secrets: VaultSecrets;
  },
  key: Uint8Array,
  nonce: Uint8Array,
): CredentialVaultEnvelope {
  if (key.length !== 32 || nonce.length !== 12) throw new Error("INVALID_VAULT_KEY_MATERIAL");
  const ciphertext = gcm(key, nonce, aad(input)).encrypt(utf8Encode(canonicalJson(input.secrets)));
  return {
    formatVersion: 1,
    vaultId: input.vaultId,
    revision: input.revision,
    algorithm: "A256GCM",
    nonceB64: base64Encode(nonce),
    ciphertextAndTagB64: base64Encode(ciphertext),
    entries: input.entries,
  };
}

export function decryptVaultEnvelope(
  envelope: CredentialVaultEnvelope,
  key: Uint8Array,
  pluginId: string,
): VaultSecrets {
  if (!validateVaultEnvelope(envelope) || key.length !== 32)
    throw new Error("INVALID_VAULT_ENVELOPE");
  const plaintext = gcm(
    key,
    base64Decode(envelope.nonceB64),
    aad({
      pluginId,
      vaultId: envelope.vaultId,
      revision: envelope.revision,
      entries: envelope.entries,
    }),
  ).decrypt(base64Decode(envelope.ciphertextAndTagB64));
  const parsed: unknown = JSON.parse(utf8Decode(plaintext));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("INVALID_VAULT_PLAINTEXT");
  for (const fields of Object.values(parsed as Record<string, unknown>)) {
    if (
      !fields ||
      typeof fields !== "object" ||
      Array.isArray(fields) ||
      Object.values(fields).some((value) => typeof value !== "string")
    ) {
      throw new Error("INVALID_VAULT_PLAINTEXT");
    }
  }
  return parsed as VaultSecrets;
}

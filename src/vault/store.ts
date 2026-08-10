import { base64Decode, base64Encode } from "../domain/codec.js";
import { canonicalJson } from "../domain/identity.js";
import { createVaultEnvelope, decryptVaultEnvelope, validateVaultEnvelope } from "./crypto.js";
import type { CredentialVaultEnvelope, VaultSecrets, VaultState } from "./types.js";

export interface VaultFilePort {
  read(path: string): string | null;
  write(path: string, value: string): void;
  delete(path: string): void;
}

export interface VaultKeychainPort {
  read(): string | null;
  write(value: string): boolean;
}

export class VaultStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class CredentialVaultStore {
  state: VaultState = "absent";
  private envelope: CredentialVaultEnvelope | null = null;
  private secrets: VaultSecrets = {};
  private key: Uint8Array | null = null;
  private mutation: Promise<void> = Promise.resolve();
  private readonly slots = ["@data/vault-a.json", "@data/vault-b.json"] as const;

  constructor(
    private readonly options: {
      pluginId: string;
      files: VaultFilePort;
      keychain: VaultKeychainPort;
      random(length: 12 | 32): Promise<Uint8Array>;
      id(): string;
    },
  ) {}

  async reload(): Promise<VaultState> {
    const encodedKey = this.options.keychain.read();
    if (!encodedKey) {
      this.key = null;
      this.state = this.slots.some((slot) => this.options.files.read(slot)) ? "locked" : "absent";
      return this.state;
    }
    try {
      const key = base64Decode(encodedKey);
      if (key.length !== 32) throw new Error();
      const candidates = this.slots
        .flatMap((slot) => {
          const raw = this.options.files.read(slot);
          if (!raw) return [];
          try {
            const parsed: unknown = JSON.parse(raw);
            return validateVaultEnvelope(parsed) ? [parsed] : [];
          } catch {
            return [];
          }
        })
        .sort((left, right) => right.revision - left.revision);
      if (!candidates.length) {
        this.key = key;
        this.envelope = null;
        this.secrets = {};
        this.state = "unlocked";
        return this.state;
      }
      for (const candidate of candidates) {
        try {
          const secrets = decryptVaultEnvelope(candidate, key, this.options.pluginId);
          this.key = key;
          this.envelope = candidate;
          this.secrets = secrets;
          this.state = "unlocked";
          return this.state;
        } catch {
          /* Try the older authenticated slot. */
        }
      }
    } catch {
      /* Fail closed below. */
    }
    this.key = null;
    this.envelope = null;
    this.secrets = {};
    this.state = "locked";
    return this.state;
  }

  async setSecret(profileId: string, fields: Record<string, string>): Promise<void> {
    const operation = this.mutation.then(() => this.writeSecret(profileId, fields));
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  private async writeSecret(profileId: string, fields: Record<string, string>): Promise<void> {
    if (!this.key) {
      const existingState = await this.reload();
      if (existingState === "locked") throw new VaultStoreError("KEYCHAIN_UNAVAILABLE");
    }
    if (!this.key) {
      this.state = "initializing";
      const newKey = await this.options.random(32);
      if (newKey.length !== 32 || !this.options.keychain.write(base64Encode(newKey))) {
        this.state = "locked";
        throw new VaultStoreError("KEYCHAIN_UNAVAILABLE");
      }
      this.key = newKey;
    }
    const revision = (this.envelope?.revision ?? 0) + 1;
    const existingEntry = this.envelope?.entries.find((entry) => entry.profileId === profileId);
    const entries = (this.envelope?.entries ?? []).filter((entry) => entry.profileId !== profileId);
    entries.push({
      profileId,
      secretRevision: (existingEntry?.secretRevision ?? 0) + 1,
      fieldNames: Object.keys(fields).sort(),
    });
    const secrets = { ...this.secrets, [profileId]: { ...fields } };
    const nonce = await this.options.random(12);
    const envelope = createVaultEnvelope(
      {
        pluginId: this.options.pluginId,
        vaultId: this.envelope?.vaultId ?? this.options.id(),
        revision,
        entries,
        secrets,
      },
      this.key,
      nonce,
    );
    const slot = this.slots[(revision - 1) % 2]!;
    this.state = "rewriting";
    this.options.files.write(slot, JSON.stringify(envelope));
    const verifyRaw = this.options.files.read(slot);
    if (!verifyRaw) throw new VaultStoreError("VAULT_VERIFY_FAILED");
    const verifyParsed: unknown = JSON.parse(verifyRaw);
    if (!validateVaultEnvelope(verifyParsed)) throw new VaultStoreError("VAULT_VERIFY_FAILED");
    const verified = decryptVaultEnvelope(verifyParsed, this.key, this.options.pluginId);
    if (canonicalJson(verified) !== canonicalJson(secrets))
      throw new VaultStoreError("VAULT_VERIFY_FAILED");
    this.envelope = envelope;
    this.secrets = secrets;
    this.state = "verified";
    this.state = "unlocked";
  }

  async getSecret(profileId: string): Promise<Record<string, string> | null> {
    if (!this.key) await this.reload();
    const fields = this.secrets[profileId];
    return fields ? { ...fields } : null;
  }

  async reset(): Promise<void> {
    const operation = this.mutation.then(() => this.resetVault());
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  private async resetVault(): Promise<void> {
    this.state = "rewriting";
    for (const slot of this.slots) this.options.files.delete(slot);
    this.key = null;
    this.envelope = null;
    this.secrets = {};
    try {
      const replacement = await this.options.random(32);
      if (!this.options.keychain.write(base64Encode(replacement)))
        throw new VaultStoreError("KEYCHAIN_UNAVAILABLE");
      this.key = replacement;
      this.state = "unlocked";
    } catch (error) {
      this.state = "locked";
      throw error;
    }
  }
}

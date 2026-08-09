export interface VaultEntryIndex {
  profileId: string;
  secretRevision: number;
  fieldNames: string[];
}

export interface CredentialVaultEnvelope {
  formatVersion: 1;
  vaultId: string;
  revision: number;
  algorithm: "A256GCM";
  nonceB64: string;
  ciphertextAndTagB64: string;
  entries: VaultEntryIndex[];
}

export type VaultState =
  "absent" | "initializing" | "unlocked" | "locked" | "rewriting" | "verified";

export type VaultSecrets = Record<string, Record<string, string>>;

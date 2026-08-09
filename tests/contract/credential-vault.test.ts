import { describe, expect, it } from "vitest";
import { base64Encode } from "../../src/domain/codec.js";
import {
  createVaultEnvelope,
  decryptVaultEnvelope,
  validateVaultEnvelope,
} from "../../src/vault/crypto.js";
import {
  CredentialVaultStore,
  type VaultFilePort,
  type VaultKeychainPort,
} from "../../src/vault/store.js";

const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 32);

class MemoryFiles implements VaultFilePort {
  files = new Map<string, string>();
  read = (path: string) => this.files.get(path) ?? null;
  write = (path: string, value: string) => void this.files.set(path, value);
  delete = (path: string) => void this.files.delete(path);
}

class MemoryKeychain implements VaultKeychainPort {
  value: string | null = null;
  available = true;
  read = () => (this.available ? this.value : null);
  write = (value: string) => (this.available ? Boolean((this.value = value)) : false);
}

describe("AES-256-GCM credential vault", () => {
  it("round-trips canonical AAD and rejects wrong key/AAD/tag/ciphertext", () => {
    const envelope = createVaultEnvelope(
      {
        pluginId: "io.sublingo.iina",
        vaultId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        secrets: { profile: { apiKey: "secret" } },
        entries: [
          {
            profileId: "00000000-0000-4000-8000-000000000002",
            secretRevision: 1,
            fieldNames: ["apiKey"],
          },
        ],
      },
      key,
      nonce,
    );
    expect(decryptVaultEnvelope(envelope, key, "io.sublingo.iina")).toEqual({
      profile: { apiKey: "secret" },
    });
    expect(() =>
      decryptVaultEnvelope(
        envelope,
        Uint8Array.from(key, (byte) => byte ^ 1),
        "io.sublingo.iina",
      ),
    ).toThrow();
    expect(() => decryptVaultEnvelope(envelope, key, "wrong.plugin")).toThrow();
    const tampered = {
      ...envelope,
      ciphertextAndTagB64: envelope.ciphertextAndTagB64.slice(0, -2) + "AA",
    };
    expect(() => decryptVaultEnvelope(tampered, key, "io.sublingo.iina")).toThrow();
    expect(validateVaultEnvelope({ ...envelope, nonceB64: base64Encode(new Uint8Array(11)) })).toBe(
      false,
    );
  });

  it("uses unique nonces, verifies A/B writes, recovers the highest authenticated slot and resets", async () => {
    const files = new MemoryFiles();
    const keychain = new MemoryKeychain();
    let entropyCounter = 0;
    const store = new CredentialVaultStore({
      pluginId: "io.sublingo.iina",
      files,
      keychain,
      random: async (length) =>
        Uint8Array.from({ length }, (_, index) => (index + entropyCounter++) & 0xff),
      id: () => "00000000-0000-4000-8000-000000000001",
    });
    await store.setSecret("00000000-0000-4000-8000-000000000002", { apiKey: "first" });
    const firstEnvelope = [...files.files.values()][0]!;
    await store.setSecret("00000000-0000-4000-8000-000000000002", { apiKey: "second" });
    expect([...files.files.values()][1]).not.toContain("second");
    expect([...files.files.values()][1]).not.toBe(firstEnvelope);
    expect(await store.getSecret("00000000-0000-4000-8000-000000000002")).toEqual({
      apiKey: "second",
    });
    files.files.set("@data/vault-b.json", "corrupt");
    expect(await store.reload()).toBe("unlocked");
    expect(await store.getSecret("00000000-0000-4000-8000-000000000002")).toEqual({
      apiKey: "first",
    });
    await store.reset();
    expect(files.files.size).toBe(0);
    expect(await store.getSecret("00000000-0000-4000-8000-000000000002")).toBeNull();
  });

  it("fails closed when Keychain is unavailable", async () => {
    const files = new MemoryFiles();
    const keychain = new MemoryKeychain();
    keychain.available = false;
    const store = new CredentialVaultStore({
      pluginId: "io.sublingo.iina",
      files,
      keychain,
      random: async (length) => new Uint8Array(length),
      id: () => "00000000-0000-4000-8000-000000000001",
    });
    await expect(
      store.setSecret("00000000-0000-4000-8000-000000000002", { apiKey: "never-written" }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_UNAVAILABLE" });
    expect(files.files.size).toBe(0);
  });
});

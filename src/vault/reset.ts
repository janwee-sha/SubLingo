import type { CredentialVaultStore } from "./store.js";

export async function resetVaultWithConfirmation(
  confirmed: boolean,
  store: CredentialVaultStore,
): Promise<"cancelled" | "reset"> {
  if (!confirmed) return "cancelled";
  await store.reset();
  return "reset";
}

export const VAULT_RESET_PROMPT =
  "Reset the encrypted credential vault? Saved API keys will be permanently removed. Provider profiles will be kept.";

export function confirmVaultReset(utils: { ask(prompt: string): boolean }): boolean {
  try {
    return utils.ask(VAULT_RESET_PROMPT) === true;
  } catch {
    return false;
  }
}

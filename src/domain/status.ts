export const SESSION_STATUSES = [
  "disabled",
  "waitingForSubtitle",
  "waitingForLanguage",
  "nativeNoTranslation",
  "waitingForConfiguration",
  "preparing",
  "running",
  "partialFailure",
  "serviceUnavailable",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const USER_ACTIONS = [
  "NONE",
  "CHECK_NETWORK",
  "CHECK_ENDPOINT",
  "CHECK_CREDENTIALS",
  "CHECK_MODEL",
  "CHECK_QUOTA",
  "SELECT_PROFILE",
  "CONFIRM_SOURCE_LANGUAGE",
  "RESET_VAULT",
  "RESTART_IINA",
] as const;

export type UserActionCode = (typeof USER_ACTIONS)[number];

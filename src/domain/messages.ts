export interface RpcEnvelope<T = unknown> {
  requestId: string;
  revision: number;
  payload: T;
}

export const SIDEBAR_MESSAGE_NAMES = [
  "ui:ready",
  "ui:poll",
  "defaults:save",
  "profile:save",
  "secret:set",
  "profile:select",
  "provider:test",
  "translation:set-enabled",
  "vault:reset",
] as const;

export const GLOBAL_MESSAGE_NAMES = [
  "profiles:list",
  "profile:create-revision",
  "vault:set-secret",
  "vault:reset",
  "provider:test",
  "provider:attempt",
  "provider:cancel",
  "profile:release",
] as const;

export function parseEnvelope(value: unknown): RpcEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_MESSAGE");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "payload,requestId,revision" ||
    typeof record.requestId !== "string" ||
    !/^[A-Za-z0-9_.-]{1,128}$/.test(record.requestId) ||
    !Number.isInteger(record.revision) ||
    (record.revision as number) < 1 ||
    !record.payload ||
    typeof record.payload !== "object" ||
    Array.isArray(record.payload)
  ) {
    throw new Error("INVALID_MESSAGE");
  }
  return record as unknown as RpcEnvelope;
}

export function sanitizedProfileView(profile: {
  profileId: string;
  revision: number;
  displayName: string;
  kind: "azure" | "openai" | "ollama";
  endpoint: string;
  endpointFingerprint: string;
  model?: string;
  credential?: Record<string, string>;
}): {
  profileId: string;
  revision: number;
  displayName: string;
  kind: "azure" | "openai" | "ollama";
  endpoint: string;
  endpointFingerprint: string;
  model?: string;
  credentialConfigured: boolean;
} {
  return {
    profileId: profile.profileId,
    revision: profile.revision,
    displayName: profile.displayName,
    kind: profile.kind,
    endpoint: profile.endpoint,
    endpointFingerprint: profile.endpointFingerprint,
    ...(profile.model === undefined ? {} : { model: profile.model }),
    credentialConfigured: Boolean(
      profile.credential && Object.values(profile.credential).some(Boolean),
    ),
  };
}

export function parseSecretSet(value: unknown): {
  profileId: string;
  expectedRevision: number;
  fields: Record<string, string>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_SECRET_SET");
  const input = value as Record<string, unknown>;
  if (
    typeof input.profileId !== "string" ||
    !Number.isInteger(input.expectedRevision) ||
    !input.fields ||
    typeof input.fields !== "object" ||
    Array.isArray(input.fields)
  ) {
    throw new Error("INVALID_SECRET_SET");
  }
  const fields = input.fields as Record<string, unknown>;
  if (
    Object.keys(fields).length === 0 ||
    Object.values(fields).some((field) => typeof field !== "string" || !field)
  )
    throw new Error("INVALID_SECRET_SET");
  if (Object.values(fields).some((field) => /[•●]{3,}|\*{4,}/.test(field as string)))
    throw new Error("MASKED_SECRET");
  return {
    profileId: input.profileId,
    expectedRevision: input.expectedRevision as number,
    fields: fields as Record<string, string>,
  };
}

export function parseProfileSelection(value: unknown): {
  profileId: string;
  revision: number;
  endpointFingerprint: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_SELECTION");
  const input = value as Record<string, unknown>;
  if (
    typeof input.profileId !== "string" ||
    !Number.isInteger(input.revision) ||
    (input.revision as number) < 1 ||
    typeof input.endpointFingerprint !== "string" ||
    !input.endpointFingerprint
  ) {
    throw new Error("INVALID_SELECTION");
  }
  return {
    profileId: input.profileId,
    revision: input.revision as number,
    endpointFingerprint: input.endpointFingerprint,
  };
}

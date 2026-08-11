import type {
  BatchId,
  EndpointFingerprint,
  PlayerId,
  ProfileId,
  RequestId,
  SessionId,
} from "../domain/types.js";

export type ProviderKind = "openai" | "ollama" | "fake";

export interface TranslationItem {
  id: string;
  text: string;
  context?: string;
}

export interface TranslationBatchRequest {
  playerId: PlayerId;
  requestId: RequestId;
  batchId: BatchId;
  sessionId: SessionId;
  sessionEpoch: number;
  windowEpoch: number;
  profileId: ProfileId;
  profileRevision: number;
  endpointFingerprint: EndpointFingerprint;
  sourceLanguage: string;
  targetLanguage: string;
  items: TranslationItem[];
}

export interface TranslationBatchResult {
  translations: Array<{ id: string; text: string }>;
  providerRequestId?: string;
  usage?: { input?: number; output?: number; characters?: number };
}

export interface TranslationBatchProgress {
  translations: Array<{ id: string; text: string }>;
  providerRequestId?: string;
  usage?: { input?: number; output?: number; characters?: number };
}

export type TranslationProgressHandler = (progress: TranslationBatchProgress) => void;

export type ProviderErrorCategory =
  | "network"
  | "timeout"
  | "http"
  | "authentication"
  | "configuration"
  | "model"
  | "quota"
  | "refusal"
  | "protocol"
  | "cancelled";

export interface ProviderAttemptError {
  category: ProviderErrorCategory;
  retryable: boolean;
  statusCode?: number;
  providerCode?: string;
  retryAfterMs?: number;
  providerRequestId?: string;
  userAction: string;
}

export interface ProviderProfileSnapshot {
  profileId: ProfileId;
  revision: number;
  displayName: string;
  kind: Exclude<ProviderKind, "fake">;
  endpoint: string;
  endpointFingerprint: EndpointFingerprint;
  proxyMode?: "system" | "direct";
  model?: string;
  capability?: "strict-json-schema" | "json-object" | "prompt-json";
  credential?: Readonly<Record<string, string>>;
}

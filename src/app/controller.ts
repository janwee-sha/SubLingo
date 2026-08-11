import type { SessionStatus } from "../domain/status.js";
import { normalizeLanguageTag, shouldTranslate } from "../domain/language.js";
import type { TranslationProvider } from "../providers/provider.js";
import type {
  ProviderAttemptError,
  TranslationBatchRequest,
  TranslationBatchResult,
} from "../providers/types.js";
import { renderSrt } from "../subtitles/srt.js";
import type { SubtitleCue } from "../subtitles/types.js";
import { batchCues, selectNearbyCues } from "./scheduler.js";
import { PlaybackSession } from "./playback-session.js";
import { buildProviderRequest } from "./request-builder.js";
import { classifyAttemptFailure, retryDelayMs } from "./retry-policy.js";
import { SessionTranslationCache, type CacheIdentity } from "./session-cache.js";
import { TranslationPipeline } from "./translation-pipeline.js";

export interface ControllerSource {
  cues: SubtitleCue[];
  contentHash: string;
  language: string | null;
  format: "srt" | "ass";
}

export interface GeneratedTrackSink {
  swap(content: string): Promise<unknown> | unknown;
  cleanup(): void;
}

export interface PlaybackControllerOptions {
  playerId: string;
  provider: TranslationProvider;
  track: GeneratedTrackSink;
  targetLanguage?: string;
  explicitRegionalOverride?: boolean;
  providerSemanticFingerprint?: string;
  profileId?: string;
  profileRevision?: number;
  endpointFingerprint?: string;
  random?: () => number;
  requiresProviderSelection?: boolean;
}

export class PlaybackController {
  readonly session: PlaybackSession;
  status: SessionStatus = "waitingForSubtitle";
  private source: ControllerSource | null = null;
  private readonly translations = new Map<string, string>();
  private readonly terminallyFailedCueIds = new Set<string>();
  private lastAttemptError: ProviderAttemptError | null = null;
  private readonly pipeline = new TranslationPipeline();
  private readonly cache: SessionTranslationCache;
  private requestSequence = 0;

  constructor(private readonly options: PlaybackControllerOptions) {
    this.session = new PlaybackSession(
      options.playerId,
      `session-${Date.now()}-${options.playerId}`,
    );
    this.cache = new SessionTranslationCache(this.session.sessionId);
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  get providerError(): ProviderAttemptError | null {
    return this.lastAttemptError ? { ...this.lastAttemptError } : null;
  }

  setSource(source: ControllerSource | null): void {
    this.session.onTrackChanged();
    this.source = source;
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    // IINA emits transient source-track changes while it attaches and selects
    // an external secondary subtitle. Keep the currently published track
    // visible through those events; the next successful swap replaces it.
    this.status = this.nextIdleStatus();
  }

  setEnabled(enabled: boolean): void {
    this.session.setEnabled(enabled);
    if (!enabled) {
      this.options.track.cleanup();
      this.status = "disabled";
    } else {
      this.terminallyFailedCueIds.clear();
      this.lastAttemptError = null;
      this.status = this.nextIdleStatus();
    }
  }

  setLanguages(
    targetLanguage: string,
    sourceLanguage: string | null,
    explicitRegionalOverride = false,
  ): void {
    this.options.targetLanguage = targetLanguage;
    this.options.explicitRegionalOverride = explicitRegionalOverride;
    if (this.source && sourceLanguage) this.source = { ...this.source, language: sourceLanguage };
    this.session.onTrackChanged();
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    this.options.track.cleanup();
    this.status = this.nextIdleStatus();
  }

  setProviderSelection(input: {
    profileId: string;
    revision: number;
    endpointFingerprint: string;
    providerSemanticFingerprint?: string;
  }): void {
    this.options.profileId = input.profileId;
    this.options.profileRevision = input.revision;
    this.options.endpointFingerprint = input.endpointFingerprint;
    this.options.providerSemanticFingerprint =
      input.providerSemanticFingerprint ?? input.endpointFingerprint;
    this.session.onTrackChanged();
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    this.options.track.cleanup();
    this.status = this.nextIdleStatus();
  }

  clearProviderSelection(): void {
    delete this.options.profileId;
    delete this.options.profileRevision;
    delete this.options.endpointFingerprint;
    delete this.options.providerSemanticFingerprint;
    this.session.onTrackChanged();
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    this.options.track.cleanup();
    this.status = this.session.enabled ? "waitingForConfiguration" : "disabled";
  }

  private nextIdleStatus(): SessionStatus {
    if (!this.session.enabled) return "disabled";
    return this.source ? "preparing" : "waitingForSubtitle";
  }

  tick(positionMs: number | null): void {
    this.session.updatePosition(positionMs);
    if (!this.session.enabled || !this.source || positionMs === null || this.pipeline.inFlight)
      return;
    if (this.options.requiresProviderSelection && !this.options.profileId) {
      this.status = "waitingForConfiguration";
      return;
    }
    const sourceLanguage = normalizeLanguageTag(this.source.language);
    const targetLanguage = this.options.targetLanguage
      ? normalizeLanguageTag(this.options.targetLanguage)
      : "target";
    if (this.options.targetLanguage && !sourceLanguage) {
      this.status = "waitingForLanguage";
      return;
    }
    if (!targetLanguage) {
      this.status = "waitingForConfiguration";
      return;
    }
    if (
      this.options.targetLanguage &&
      sourceLanguage &&
      !shouldTranslate(
        sourceLanguage,
        targetLanguage,
        this.options.explicitRegionalOverride ?? false,
      )
    ) {
      this.status = "nativeNoTranslation";
      return;
    }
    const identity = this.cacheIdentity(
      sourceLanguage ?? this.source.language ?? "und",
      targetLanguage,
    );
    const window = selectNearbyCues(this.source.cues, positionMs);
    for (const cue of window) {
      const cached = this.cache.get(identity, cue.id);
      if (cached) this.translations.set(cue.id, cached);
    }
    const pending = window.filter(
      (cue) => !this.translations.has(cue.id) && !this.terminallyFailedCueIds.has(cue.id),
    );
    if (pending.length === 0) {
      if (this.translations.size > 0) this.status = "running";
      return;
    }
    const batch = batchCues(pending).batches[0] ?? [];
    if (batch.length === 0) {
      this.status = "partialFailure";
      return;
    }
    const fingerprint = this.session.fingerprint();
    const requestNumber = ++this.requestSequence;
    this.status = "preparing";
    this.lastAttemptError = null;
    this.pipeline.run(async () => {
      let remaining = [...batch];
      let terminalError: ProviderAttemptError | null = null;
      for (let attempt = 0; attempt <= 3 && remaining.length > 0; attempt += 1) {
        if (!this.session.accepts(fingerprint) || this.source === null) return;
        const request = buildProviderRequest({
          fingerprint,
          requestId: `request-${requestNumber}-attempt-${attempt}`,
          batchId: `batch-${requestNumber}`,
          profileId: this.options.profileId ?? "injected-provider",
          profileRevision: this.options.profileRevision ?? 1,
          endpointFingerprint: this.options.endpointFingerprint ?? "injected",
          sourceLanguage: sourceLanguage ?? this.source.language ?? "und",
          targetLanguage,
          cues: remaining,
        });
        try {
          const result = await this.attemptWithCancellation(request);
          if (!this.session.accepts(fingerprint) || this.source === null) return;
          const accepted = this.acceptResults(remaining, result, identity);
          remaining = remaining.filter((cue) => !accepted.has(cue.id));
          terminalError = remaining.length
            ? {
                category: "protocol",
                retryable: true,
                providerCode: "PARTIAL_RESULT",
                userAction: "CHECK_ENDPOINT",
              }
            : null;
        } catch (error) {
          if (!this.session.accepts(fingerprint)) return;
          const detail =
            error && typeof error === "object" ? (error as Record<string, unknown>) : {};
          terminalError = classifyAttemptFailure({
            ...(typeof detail.category === "string"
              ? { category: detail.category as ProviderAttemptError["category"] }
              : {}),
            ...(typeof detail.statusCode === "number" ? { statusCode: detail.statusCode } : {}),
            ...(typeof detail.providerCode === "string"
              ? { providerCode: detail.providerCode }
              : {}),
            ...(typeof detail.retryAfterMs === "number"
              ? { retryAfterMs: detail.retryAfterMs }
              : {}),
          });
        }
        if (remaining.length === 0 || !terminalError?.retryable || attempt === 3) break;
        const retryNumber = (attempt + 1) as 1 | 2 | 3;
        const current = await this.waitForRetry(
          retryDelayMs(retryNumber, this.options.random ?? Math.random, terminalError.retryAfterMs),
          fingerprint,
        );
        if (!current) return;
      }
      if (!this.session.accepts(fingerprint) || this.source === null) return;
      for (const cue of remaining) this.terminallyFailedCueIds.add(cue.id);
      this.lastAttemptError = remaining.length > 0 ? terminalError : null;
      const rendered = renderSrt(this.source.cues, this.translations);
      if (rendered) {
        try {
          await this.options.track.swap(rendered);
        } catch {
          if (this.session.accepts(fingerprint)) this.status = "partialFailure";
          return;
        }
      }
      if (this.session.accepts(fingerprint)) {
        if (remaining.length > 0)
          this.status = terminalError?.retryable ? "serviceUnavailable" : "partialFailure";
        else this.status = "running";
      }
    });
  }

  private acceptResults(
    requested: readonly SubtitleCue[],
    result: TranslationBatchResult,
    identity: CacheIdentity,
  ): Set<string> {
    const requestedIds = new Set(requested.map((cue) => cue.id));
    const seen = new Set<string>();
    const valid: Array<{ cueId: string; translation: string }> = [];
    for (const item of result.translations) {
      const text = item.text.trim();
      if (!requestedIds.has(item.id) || seen.has(item.id) || !text) continue;
      seen.add(item.id);
      valid.push({ cueId: item.id, translation: text });
      this.translations.set(item.id, text);
    }
    this.cache.insert(identity, valid);
    return seen;
  }

  private attemptWithCancellation(
    request: TranslationBatchRequest,
  ): Promise<TranslationBatchResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const unregister = this.session.registerCancellation(() => {
        if (settled) return;
        settled = true;
        void this.options.provider.cancel?.(request.requestId);
        reject({ category: "cancelled", retryable: false });
      });
      this.options.provider.attempt(request).then(
        (result) => {
          if (settled) return;
          settled = true;
          unregister();
          resolve(result);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          unregister();
          reject(error);
        },
      );
    });
  }

  private waitForRetry(
    milliseconds: number,
    fingerprint: ReturnType<PlaybackSession["fingerprint"]>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unregister();
        resolve(this.session.accepts(fingerprint));
      }, milliseconds);
      const unregister = this.session.registerCancellation(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  private cacheIdentity(sourceLanguage: string, targetLanguage: string): CacheIdentity {
    return {
      sessionId: this.session.sessionId,
      sourceContentHash: this.source?.contentHash ?? "",
      sourceLanguage,
      targetLanguage,
      providerSemanticFingerprint: this.options.providerSemanticFingerprint ?? "injected",
    };
  }

  whenIdle(): Promise<void> {
    return this.pipeline.whenIdle();
  }

  endFile(): void {
    this.session.onFileChanged();
    this.source = null;
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    this.options.track.cleanup();
    this.status = this.nextIdleStatus();
  }

  close(): void {
    this.session.close();
    this.translations.clear();
    this.terminallyFailedCueIds.clear();
    this.lastAttemptError = null;
    this.cache.clear();
    this.options.track.cleanup();
    this.status = "disabled";
  }
}

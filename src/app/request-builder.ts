import type { PlaybackFingerprint } from "./playback-session.js";
import type { TranslationBatchRequest } from "../providers/types.js";
import type { SubtitleCue } from "../subtitles/types.js";

export function buildProviderRequest(input: {
  fingerprint: PlaybackFingerprint;
  requestId: string;
  batchId: string;
  profileId: string;
  profileRevision: number;
  endpointFingerprint: string;
  sourceLanguage: string;
  targetLanguage: string;
  cues: readonly SubtitleCue[];
}): TranslationBatchRequest {
  return {
    playerId: input.fingerprint.playerId,
    requestId: input.requestId,
    batchId: input.batchId,
    sessionId: input.fingerprint.sessionId,
    sessionEpoch: input.fingerprint.sessionEpoch,
    windowEpoch: input.fingerprint.windowEpoch,
    profileId: input.profileId,
    profileRevision: input.profileRevision,
    endpointFingerprint: input.endpointFingerprint,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    items: input.cues.map((cue, index) => {
      const adjacent = [
        input.cues[index - 1]?.normalizedText,
        input.cues[index + 1]?.normalizedText,
      ]
        .filter((text): text is string => Boolean(text))
        .join("\n");
      return {
        id: cue.id,
        text: cue.normalizedText,
        ...(adjacent ? { context: adjacent.slice(0, 500) } : {}),
      };
    }),
  } as TranslationBatchRequest;
}

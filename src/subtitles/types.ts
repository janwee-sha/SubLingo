import type { Sha256Hex } from "../domain/types.js";

export interface SubtitleCue {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  normalizedText: string;
  contextText?: string;
}

export interface SubtitleParseResult {
  cues: SubtitleCue[];
  warnings: string[];
}

export interface SubtitleSource {
  trackId: number;
  isExternal: true;
  format: "srt" | "ass";
  contentHash: Sha256Hex;
  language: string | null;
  languageOrigin: "track" | "manual" | "unknown";
  decode: { encoding: string; bom: boolean; warnings: string[] };
  cues: SubtitleCue[];
}

import type { SubtitleCue, SubtitleParseResult } from "./types.js";

const TIMING =
  /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;

function milliseconds(parts: readonly string[]): number | null {
  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isInteger(value))) return null;
  const [hours = 0, minutes = 0, seconds = 0, millis = 0] = numbers;
  if (minutes > 59 || seconds > 59 || millis > 999) return null;
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1_000 + millis;
}

function formatTimestamp(value: number): string {
  const safe = Math.max(0, Math.round(value));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function parseSrt(input: string): SubtitleParseResult {
  const normalized = input
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return { cues: [], warnings: ["srt:empty"] };
  const cues: SubtitleCue[] = [];
  const warnings: string[] = [];
  const blocks = normalized.split(/\n{2,}/);
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const lines = (blocks[blockIndex] ?? "").split("\n");
    if (/^\d+$/.test(lines[0]?.trim() ?? "")) lines.shift();
    const timingLine = lines.shift()?.trim() ?? "";
    const match = timingLine.match(TIMING);
    if (!match) {
      warnings.push(`srt:malformed-timing:${blockIndex + 1}`);
      continue;
    }
    const startMs = milliseconds(match.slice(1, 5));
    const endMs = milliseconds(match.slice(5, 9));
    const sourceText = lines.join("\n").trim();
    if (startMs === null || endMs === null || endMs < startMs || !sourceText) {
      warnings.push(`srt:malformed-cue:${blockIndex + 1}`);
      continue;
    }
    cues.push({
      id: `srt:${blockIndex}:${startMs}:${endMs}`,
      index: blockIndex,
      startMs,
      endMs,
      sourceText,
      normalizedText: sourceText,
    });
  }
  cues.sort((left, right) => left.startMs - right.startMs || left.index - right.index);
  return { cues, warnings };
}

function escapeSrtText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSrt(
  cues: readonly SubtitleCue[],
  translations: ReadonlyMap<string, string>,
): string {
  const blocks: string[] = [];
  for (const cue of [...cues].sort(
    (left, right) => left.startMs - right.startMs || left.index - right.index,
  )) {
    const translation = translations.get(cue.id)?.trim();
    if (!translation) continue;
    blocks.push(
      `${blocks.length + 1}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${escapeSrtText(translation)}`,
    );
  }
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

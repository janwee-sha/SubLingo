export interface TranslationOverlayMpvPort {
  command(name: string, args: string[]): void;
}

export const TRANSLATION_OVERLAY_ID = 1_935_126_014;

export const TRANSLATION_OVERLAY_ASS_PREFIX = String.raw`{\rDefault\an8\q0\fs40\fscx100\fscy100\b0\i0\u0\s0\1c&HFFFFFF&\1a&H00&\3c&H000000&\3a&H00&\bord2\shad0\4a&HFF&\blur0}`;

function encodeTranslationText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  let encoded = "";
  let lineStart = true;
  for (const character of normalized) {
    if (character === "\n") {
      encoded += String.raw`\N`;
      lineStart = true;
      continue;
    }
    if (character === "\0") {
      encoded += "\ufffd";
      lineStart = false;
      continue;
    }
    if (character === "{") {
      encoded += String.raw`\{`;
      lineStart = false;
      continue;
    }
    if (character === "\\") {
      encoded += `\\\u2060`;
      lineStart = false;
      continue;
    }
    if (lineStart && character === " ") {
      encoded += String.raw`\h`;
      lineStart = false;
      continue;
    }
    encoded += character;
    lineStart = false;
  }
  return encoded;
}

export function encodeTranslationOverlayData(lines: readonly string[]): string {
  return `${TRANSLATION_OVERLAY_ASS_PREFIX}${lines.map(encodeTranslationText).join(String.raw`\N`)}`;
}

export class IinaTranslationOverlay {
  private lastData: string | null = null;

  constructor(
    private readonly mpv: TranslationOverlayMpvPort,
    private readonly overlayId = TRANSLATION_OVERLAY_ID,
  ) {}

  show(lines: readonly string[]): void {
    if (lines.length === 0 || lines.every((line) => !line.trim())) {
      this.clear();
      return;
    }
    const data = encodeTranslationOverlayData(lines);
    if (data === this.lastData) return;
    this.mpv.command("osd-overlay", [
      String(this.overlayId),
      "ass-events",
      data,
      "0",
      "720",
      "0",
      "no",
      "no",
    ]);
    this.lastData = data;
  }

  clear(): void {
    if (this.lastData === null) return;
    this.mpv.command("osd-overlay", [
      String(this.overlayId),
      "none",
      "",
      "0",
      "720",
      "0",
      "no",
      "no",
    ]);
    this.lastData = null;
  }
}

import {
  loadSubtitleSource,
  type SubtitleSourceResult,
  type SubtitleTrackDescriptor,
} from "../../subtitles/source.js";
import { utf8Encode } from "../../domain/codec.js";

export interface SubtitleSourcePort {
  selectedTrack(): SubtitleTrackDescriptor | null;
  readBinary(path: string): Uint8Array | null;
}

export function readSelectedSubtitle(port: SubtitleSourcePort): SubtitleSourceResult {
  const track = port.selectedTrack();
  if (!track) return { ok: false, reason: "unreadable" };
  return loadSubtitleSource(track, port.readBinary(`@sub/${track.id}`));
}

export class IinaSubtitleSourcePort implements SubtitleSourcePort {
  constructor(
    private readonly subtitle: IINA.API.SubtitleAPI,
    private readonly file: IINA.API.File,
  ) {}

  selectedTrack(): SubtitleTrackDescriptor | null {
    const id = this.subtitle.id;
    if (id === null) return null;
    let track = this.subtitle.tracks.find((candidate) => candidate.id === id);
    if (!track) {
      try {
        if (this.subtitle.currentTrack?.id === id) track = this.subtitle.currentTrack;
      } catch {
        /* IINA can expose the selected ID before currentTrack is ready. */
      }
    }
    if (!track) return null;
    return {
      id: track.id,
      isExternal: track.isExternal,
      ...(track.title === null ? {} : { title: track.title }),
      ...(track.lang === null ? {} : { lang: track.lang }),
    };
  }

  readBinary(path: string): Uint8Array | null {
    let handle: IINA.API.FileHandle | null = null;
    try {
      handle = this.file.handle(path, "read");
      const bytes = handle.readToEnd();
      if (bytes) return bytes;
    } catch {
      /* Fall through to IINA's text reader for UTF-8 subtitles. */
    } finally {
      handle?.close();
    }
    try {
      const text = this.file.read(path);
      return typeof text === "string" ? utf8Encode(text) : null;
    } catch {
      return null;
    }
  }
}

import {
  loadSubtitleSource,
  type SubtitleSourceResult,
  type SubtitleTrackDescriptor,
} from "../../subtitles/source.js";

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
    const track = this.subtitle.tracks.find((candidate) => candidate.id === id);
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
      return handle.readToEnd() ?? null;
    } catch {
      return null;
    } finally {
      handle?.close();
    }
  }
}

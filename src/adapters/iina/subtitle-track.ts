export interface SubtitleTrackPort {
  getTrackIds(): number[];
  getPrimaryId(): number | null;
  getSecondId(): number | null;
  setPrimaryId(id: number | null): void;
  setSecondId(id: number | null): void;
  writeFile(path: string, content: string): void;
  removeFile(path: string): void;
  addSubtitle(path: string): Promise<void> | void;
  removeSubtitle(id: number): void;
}

export class GeneratedSubtitleTrackManager {
  private revision = 0;
  private ownedTrackId: number | null = null;
  private ownedPath: string | null = null;
  private readonly originalSecondId: number | null;

  constructor(
    private readonly port: SubtitleTrackPort,
    private readonly playerId: string,
    private readonly sessionId: string,
  ) {
    this.originalSecondId = port.getSecondId();
  }

  async swap(content: string): Promise<number> {
    const oldTrackId = this.ownedTrackId;
    const oldPath = this.ownedPath;
    const primaryId = this.port.getPrimaryId();
    const before = new Set(this.port.getTrackIds());
    const revision = ++this.revision;
    const path = `@tmp/sublingo/${encodeURIComponent(this.playerId)}/${encodeURIComponent(this.sessionId)}/translated-${revision}.srt`;
    this.port.writeFile(path, content);
    await this.port.addSubtitle(path);
    const newTrackId = this.port.getTrackIds().find((id) => !before.has(id));
    if (newTrackId === undefined) {
      this.port.removeFile(path);
      throw new Error("GENERATED_TRACK_NOT_FOUND");
    }
    this.port.setPrimaryId(primaryId);
    this.port.setSecondId(newTrackId);
    this.ownedTrackId = newTrackId;
    this.ownedPath = path;
    if (oldTrackId !== null) this.port.removeSubtitle(oldTrackId);
    if (oldPath !== null) this.port.removeFile(oldPath);
    return newTrackId;
  }

  cleanup(): void {
    if (this.ownedTrackId !== null) {
      if (this.port.getSecondId() === this.ownedTrackId)
        this.port.setSecondId(this.originalSecondId);
      this.port.removeSubtitle(this.ownedTrackId);
    }
    if (this.ownedPath !== null) this.port.removeFile(this.ownedPath);
    this.ownedTrackId = null;
    this.ownedPath = null;
  }
}

export class IinaSubtitleTrackPort implements SubtitleTrackPort {
  constructor(
    private readonly subtitle: IINA.API.SubtitleAPI,
    private readonly file: IINA.API.File,
    private readonly mpv: IINA.API.MPV,
  ) {}

  getTrackIds(): number[] {
    return this.subtitle.tracks.map((track) => track.id);
  }
  getPrimaryId(): number | null {
    return this.subtitle.id;
  }
  getSecondId(): number | null {
    return this.subtitle.secondID;
  }
  setPrimaryId(id: number | null): void {
    this.subtitle.id = id;
  }
  setSecondId(id: number | null): void {
    this.subtitle.secondID = id;
  }
  writeFile(path: string, content: string): void {
    this.file.write(path, content);
  }
  removeFile(path: string): void {
    try {
      if (this.file.exists(path)) this.file.delete(path);
    } catch {
      // Cleanup is best effort; logical ownership was already invalidated.
    }
  }
  addSubtitle(path: string): void {
    this.subtitle.loadTrack(path);
  }
  removeSubtitle(id: number): void {
    this.mpv.command("sub-remove", [String(id)]);
  }
}

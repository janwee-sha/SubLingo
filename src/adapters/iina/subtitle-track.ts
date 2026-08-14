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
  private ownedTrackId: number | null = null;
  private ownedPath: string | null = null;
  private publishing = false;
  private revision = 0;
  private readonly originalSecondId: number | null;

  constructor(
    private readonly port: SubtitleTrackPort,
    private readonly playerId: string,
    private readonly sessionId: string,
    private readonly selectionSettleMs = 250,
  ) {
    this.originalSecondId = port.getSecondId();
  }

  get isPublishing(): boolean {
    return this.publishing;
  }

  get hasOwnedTrack(): boolean {
    return this.ownedTrackId !== null && this.port.getTrackIds().includes(this.ownedTrackId);
  }

  ownsTrack(id: number | null): boolean {
    return id !== null && id === this.ownedTrackId;
  }

  async swap(content: string): Promise<number> {
    this.publishing = true;
    try {
      const primaryId = this.port.getPrimaryId();
      const previousTrackId = this.ownedTrackId;
      const previousPath = this.ownedPath;
      const path = `@tmp/sublingo-${encodeURIComponent(this.playerId)}-${encodeURIComponent(this.sessionId)}-${++this.revision}.srt`;
      const before = new Set(this.port.getTrackIds());
      this.port.writeFile(path, content);
      await this.port.addSubtitle(path);
      const newTrackId = await this.waitForNewTrack(before);
      if (newTrackId === undefined) {
        this.port.removeFile(path);
        throw new Error("GENERATED_TRACK_NOT_FOUND");
      }
      this.ownedTrackId = newTrackId;
      this.ownedPath = path;
      try {
        await this.selectAsSecond(primaryId, newTrackId);
      } catch (error) {
        this.port.removeSubtitle(newTrackId);
        this.port.removeFile(path);
        this.ownedTrackId = previousTrackId;
        this.ownedPath = previousPath;
        throw error;
      }
      if (previousTrackId !== null && previousTrackId !== newTrackId)
        this.port.removeSubtitle(previousTrackId);
      if (previousPath !== null && previousPath !== path) this.port.removeFile(previousPath);
      this.reconcileSelection(primaryId, newTrackId);
      return newTrackId;
    } finally {
      this.publishing = false;
    }
  }

  private async selectAsSecond(primaryId: number | null, generatedId: number): Promise<void> {
    this.reconcileSelection(primaryId, generatedId);
    if (this.selectionSettleMs > 0)
      await new Promise<void>((resolve) => setTimeout(resolve, this.selectionSettleMs));
    this.reconcileSelection(primaryId, generatedId);
  }

  private reconcileSelection(primaryId: number | null, generatedId: number): void {
    if (this.port.getPrimaryId() !== primaryId) this.port.setPrimaryId(primaryId);
    if (this.port.getSecondId() !== generatedId) this.port.setSecondId(generatedId);
  }

  private async waitForNewTrack(before: ReadonlySet<number>): Promise<number | undefined> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const added = this.port.getTrackIds().find((id) => !before.has(id));
      if (added !== undefined) return added;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return undefined;
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
    private readonly utils: Pick<IINA.API.Utils, "resolvePath">,
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
    // IINA 1.4.4's TrackAPI property setter can throw after it has already
    // changed mpv's selection. Use mpv's native properties so a successful
    // external track is not mistaken for a failed publication and removed.
    this.mpv.set("sid", id === null ? "no" : String(id));
  }
  setSecondId(id: number | null): void {
    this.mpv.set("secondary-sid", id === null ? "no" : String(id));
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
    this.mpv.command("sub-add", [this.utils.resolvePath(path), "auto", "SubLingo"]);
  }
  removeSubtitle(id: number): void {
    this.mpv.command("sub-remove", [String(id)]);
  }
}

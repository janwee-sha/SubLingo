import { describe, expect, it } from "vitest";
import {
  GeneratedSubtitleTrackManager,
  type SubtitleTrackPort,
} from "../../src/adapters/iina/subtitle-track.js";

class FakeTrackPort implements SubtitleTrackPort {
  tracks = [1, 2];
  primaryId: number | null = 1;
  secondId: number | null = 2;
  nextId = 100;
  readonly files = new Map<string, string>();
  readonly removedTracks: number[] = [];

  getTrackIds = () => [...this.tracks];
  getPrimaryId = () => this.primaryId;
  getSecondId = () => this.secondId;
  setPrimaryId = (id: number | null) => void (this.primaryId = id);
  setSecondId = (id: number | null) => void (this.secondId = id);
  writeFile = (path: string, content: string) => void this.files.set(path, content);
  removeFile = (path: string) => void this.files.delete(path);
  addSubtitle = async () => void this.tracks.push(this.nextId++);
  removeSubtitle = (id: number) => {
    this.removedTracks.push(id);
    this.tracks = this.tracks.filter((track) => track !== id);
  };
}

describe("plugin-owned second subtitle", () => {
  it("swaps full-file revisions while preserving primary and removing exact old ownership", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A");
    await manager.swap("first");
    expect(port.primaryId).toBe(1);
    expect(port.secondId).toBe(100);
    await manager.swap("second");
    expect(port.secondId).toBe(101);
    expect(port.removedTracks).toEqual([100]);
    expect([...port.files.values()]).toEqual(["second"]);
  });

  it("does not overwrite a later user second-track choice during cleanup", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A");
    await manager.swap("generated");
    port.secondId = 9;
    manager.cleanup();
    expect(port.secondId).toBe(9);
    expect(port.removedTracks).toEqual([100]);
    expect(port.files.size).toBe(0);
  });

  it.each(["disable", "end-file", "window-close"])("cleans ownership on %s", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A");
    await manager.swap("generated");
    manager.cleanup();
    expect(port.secondId).toBe(2);
    expect(port.removedTracks).toEqual([100]);
  });
});

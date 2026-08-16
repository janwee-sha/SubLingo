import { describe, expect, it } from "vitest";
import {
  GeneratedSubtitleTrackManager,
  IinaSubtitleTrackPort,
  type SubtitleTrackPort,
} from "../../src/adapters/iina/subtitle-track.js";

class FakeTrackPort implements SubtitleTrackPort {
  tracks = [1, 2];
  primaryId: number | null = 1;
  secondId: number | null = 2;
  nextId = 100;
  addDelayMs = 0;
  autoSelectDelayMs: number | null = null;
  readonly files = new Map<string, string>();
  readonly removedTracks: number[] = [];
  readonly primarySelections: Array<number | null> = [];
  readonly secondSelections: Array<number | null> = [];

  getTrackIds = () => [...this.tracks];
  getPrimaryId = () => this.primaryId;
  getSecondId = () => this.secondId;
  setPrimaryId = (id: number | null) => {
    this.primarySelections.push(id);
    this.primaryId = id;
  };
  setSecondId = (id: number | null) => {
    this.secondSelections.push(id);
    this.secondId = id;
  };
  writeFile = (path: string, content: string) => void this.files.set(path, content);
  removeFile = (path: string) => void this.files.delete(path);
  addSubtitle = () => {
    const addedId = this.nextId++;
    const exposeTrack = () => {
      this.tracks.push(addedId);
      if (this.autoSelectDelayMs !== null) {
        setTimeout(() => {
          this.primaryId = addedId;
          this.secondId = null;
        }, this.autoSelectDelayMs);
      }
    };
    if (this.addDelayMs > 0) {
      setTimeout(exposeTrack, this.addDelayMs);
      return;
    }
    exposeTrack();
  };
  removeSubtitle = (id: number) => {
    this.removedTracks.push(id);
    this.tracks = this.tracks.filter((track) => track !== id);
  };
}

describe("plugin-owned second subtitle", () => {
  it("adds a non-selected generated subtitle with a short track title", () => {
    const commands: Array<[string, string[]]> = [];
    const port = new IinaSubtitleTrackPort(
      {} as IINA.API.SubtitleAPI,
      {} as IINA.API.File,
      {
        command: (name: string, args: string[]) => void commands.push([name, args]),
      } as IINA.API.MPV,
      { resolvePath: (path: string) => `/private/tmp/plugin/${path.slice("@tmp/".length)}` },
    );

    port.addSubtitle("@tmp/generated.srt");

    expect(commands).toEqual([
      ["sub-add", ["/private/tmp/plugin/generated.srt", "auto", "SubLingo"]],
    ]);
  });

  it("sets primary and secondary tracks through stable mpv properties", () => {
    const writes: Array<[string, unknown]> = [];
    const port = new IinaSubtitleTrackPort(
      {} as IINA.API.SubtitleAPI,
      {} as IINA.API.File,
      {
        set: (name: string, value: unknown) => void writes.push([name, value]),
      } as IINA.API.MPV,
      {} as IINA.API.Utils,
    );

    port.setPrimaryId(4);
    port.setSecondId(5);
    port.setSecondId(null);

    expect(writes).toEqual([
      ["sid", "4"],
      ["secondary-sid", "5"],
      ["secondary-sid", "no"],
    ]);
  });

  it("replaces the generated track while preserving the primary subtitle", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A", 0);
    await manager.swap("first");
    expect(manager.hasOwnedTrack).toBe(true);
    expect(port.primaryId).toBe(1);
    expect(port.secondId).toBe(100);
    expect(port.primarySelections).toEqual([]);
    expect(port.secondSelections).toEqual([100]);
    await manager.swap("second");
    expect(port.primaryId).toBe(1);
    expect(port.secondId).toBe(101);
    expect(port.primarySelections).toEqual([]);
    expect(port.secondSelections).toEqual([100, 101]);
    expect(port.removedTracks).toEqual([100]);
    expect(port.tracks).toEqual([1, 2, 101]);
    expect([...port.files.values()]).toEqual(["second"]);
    expect([...port.files.keys()][0]).toMatch(/^@tmp\/sublingo-[^/]+\.srt$/);
  });

  it("waits for IINA to expose a newly loaded external subtitle track", async () => {
    const port = new FakeTrackPort();
    port.addDelayMs = 40;
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A", 0);
    await expect(manager.swap("generated")).resolves.toBe(100);
    expect(port.secondId).toBe(100);
    expect(manager.isPublishing).toBe(false);
  });

  it("reasserts the second track after IINA asynchronously selects it as primary", async () => {
    const port = new FakeTrackPort();
    port.autoSelectDelayMs = 50;
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A", 100);

    await expect(manager.swap("generated")).resolves.toBe(100);

    expect(port.primaryId).toBe(1);
    expect(port.secondId).toBe(100);
    expect(port.primarySelections).toEqual([1]);
    expect(port.secondSelections).toEqual([100, 100]);
    expect(manager.isPublishing).toBe(false);
  });

  it("does not overwrite a later user second-track choice during cleanup", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A", 0);
    await manager.swap("generated");
    port.secondId = 9;
    manager.cleanup();
    expect(manager.hasOwnedTrack).toBe(false);
    expect(port.secondId).toBe(9);
    expect(port.removedTracks).toEqual([100]);
    expect(port.files.size).toBe(0);
  });

  it.each(["disable", "end-file", "window-close"])("cleans ownership on %s", async () => {
    const port = new FakeTrackPort();
    const manager = new GeneratedSubtitleTrackManager(port, "player-A", "session-A", 0);
    await manager.swap("generated");
    manager.cleanup();
    expect(port.secondId).toBe(2);
    expect(port.removedTracks).toEqual([100]);
  });

  it("isolates generated files and cleanup between player sessions", async () => {
    const firstPort = new FakeTrackPort();
    const secondPort = new FakeTrackPort();
    const first = new GeneratedSubtitleTrackManager(firstPort, "player-A", "session-A", 0);
    const second = new GeneratedSubtitleTrackManager(secondPort, "player-B", "session-B", 0);
    await first.swap("first");
    await second.swap("second");
    expect([...firstPort.files.keys()][0]).toContain("player-A-session-A");
    expect([...secondPort.files.keys()][0]).toContain("player-B-session-B");
    first.cleanup();
    expect(firstPort.secondId).toBe(2);
    expect(secondPort.secondId).toBe(100);
    expect(secondPort.files.size).toBe(1);
    expect(secondPort.primaryId).toBe(1);
  });
});

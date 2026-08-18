import { describe, expect, it } from "vitest";
import {
  IinaTranslationOverlay,
  TRANSLATION_OVERLAY_ID,
} from "../../src/adapters/iina/subtitle-overlay.js";
import { FakeIinaPlayer } from "../helpers/fake-iina.js";

const overlayCommand = (format: string, data: string): string[] => [
  "osd-overlay",
  String(TRANSLATION_OVERLAY_ID),
  format,
  data,
  "0",
  "720",
  "0",
  "no",
  "no",
];

describe("IINA translation overlay", () => {
  it("shows, replaces and removes content on one fixed overlay ID", () => {
    const player = new FakeIinaPlayer();
    const overlay = new IinaTranslationOverlay(player);

    overlay.show(["first"]);
    const firstData = player.mpvCommands[0]?.[3] ?? "";
    overlay.show(["second"]);
    const secondData = player.mpvCommands[1]?.[3] ?? "";
    overlay.clear();

    expect(firstData).toContain("first");
    expect(secondData).toContain("second");
    expect(player.mpvCommands).toEqual([
      overlayCommand("ass-events", firstData),
      overlayCommand("ass-events", secondData),
      overlayCommand("none", ""),
    ]);
  });

  it("deduplicates repeated show and clear calls after successful commands", () => {
    const player = new FakeIinaPlayer();
    const overlay = new IinaTranslationOverlay(player);

    overlay.clear();
    overlay.show(["same"]);
    overlay.show(["same"]);
    overlay.clear();
    overlay.clear();

    expect(player.mpvCommands).toHaveLength(2);
  });

  it("does not commit failed state and retries the same command", () => {
    const player = new FakeIinaPlayer();
    const overlay = new IinaTranslationOverlay(player);
    player.failNextCommand();

    expect(() => overlay.show(["retry"])).toThrow("FAKE_MPV_COMMAND_FAILED");
    expect(() => overlay.show(["retry"])).not.toThrow();

    expect(player.mpvCommands).toHaveLength(2);
    expect(player.mpvCommands[0]).toEqual(player.mpvCommands[1]);
  });

  it("isolates overlay state and commands between player instances", () => {
    const firstPlayer = new FakeIinaPlayer();
    const secondPlayer = new FakeIinaPlayer();
    const first = new IinaTranslationOverlay(firstPlayer);
    const second = new IinaTranslationOverlay(secondPlayer);

    first.show(["first"]);
    second.show(["second"]);
    first.clear();

    expect(firstPlayer.mpvCommands).toHaveLength(2);
    expect(secondPlayer.mpvCommands).toHaveLength(1);
    expect(secondPlayer.mpvCommands[0]?.[3]).toContain("second");
  });

  it("never writes subtitle tracks, subtitle selections or translated files", () => {
    const player = new FakeIinaPlayer();
    player.primaryId = 5;
    player.secondId = 9;
    const overlay = new IinaTranslationOverlay(player);

    overlay.show(["translated"]);
    overlay.clear();

    expect(player.mpvCommands.every(([name]) => name === "osd-overlay")).toBe(true);
    expect(player.mpvProperties.size).toBe(0);
    expect(player.primaryId).toBe(5);
    expect(player.secondId).toBe(9);
    expect(player.files.files.size).toBe(0);
  });
});

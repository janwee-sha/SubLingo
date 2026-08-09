import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("IINA sidebar lifecycle contract", () => {
  const mainSource = readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../../ui/sidebar.ts", import.meta.url), "utf8");

  it("lets the live webview request state instead of posting from the player timer", () => {
    expect(mainSource).toContain('runtime.sidebar.onMessage("ui:poll"');
    expect(sidebarSource).toContain('postMessage("ui:poll"');

    const timerStart = mainSource.indexOf("const tickInterval = setInterval");
    const timerEnd = mainSource.indexOf('runtime.event.on("iina.window-will-close"', timerStart);
    const timerSource = mainSource.slice(timerStart, timerEnd);

    expect(timerStart).toBeGreaterThan(-1);
    expect(timerEnd).toBeGreaterThan(timerStart);
    expect(timerSource).not.toContain("sidebar.postMessage");
  });

  it("stops the player timer before the IINA window is destroyed", () => {
    expect(mainSource).toContain("clearInterval(tickInterval)");
    expect(mainSource).toContain("clearTimeout(sourceSelectionTimer)");
  });

  it("debounces IINA's transient primary-subtitle changes during generated-track publication", () => {
    expect(mainSource).toContain('runtime.event.on("mpv.sid.changed"');
    expect(mainSource).toContain("generatedTrack.hasOwnedTrack");
    expect(mainSource).toContain("generatedTrack.ownsTrack(settledId)");
    expect(mainSource).toContain("}, 250)");
  });

  it("waits for IINA's player window before loading the sidebar webview", () => {
    expect(mainSource).toContain("iina.core.window.loaded");
    expect(mainSource).toContain('iina.event.on("iina.window-loaded", scheduleInitializePlayer)');
    expect(
      mainSource.indexOf('iina.event.on("iina.window-loaded", scheduleInitializePlayer)'),
    ).toBeLessThan(mainSource.lastIndexOf("scheduleInitializePlayer();"));
    expect(mainSource).toContain("setTimeout(initializePlayer, 100)");
  });

  it("initializes a normal player without waiting for a global registration reply", () => {
    expect(mainSource).toContain("wirePlayer(iina, `player-${Date.now()}`)");
    expect(mainSource).not.toContain('onMessage("main:registered"');
  });

  it("loads the sidebar before registering handlers that loadFile would clear", () => {
    expect(mainSource.indexOf('runtime.sidebar.loadFile("dist/ui/sidebar.html")')).toBeLessThan(
      mainSource.indexOf('runtime.sidebar.onMessage("ui:ready"'),
    );
  });
});

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
  });

  it("initializes a normal player without waiting for a global registration reply", () => {
    expect(mainSource).toContain("wirePlayer(iina, `player-${Date.now()}`)");
    expect(mainSource).not.toContain('onMessage("main:registered"');
  });
});

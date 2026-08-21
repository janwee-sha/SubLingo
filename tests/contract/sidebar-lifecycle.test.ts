import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parseRetrySubtitlePreparation } from "../../src/domain/messages.js";

describe("IINA sidebar lifecycle contract", () => {
  const mainSource = readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../../ui/sidebar.ts", import.meta.url), "utf8");
  const sidebarStateSource = readFileSync(
    new URL("../../ui/sidebar-state.ts", import.meta.url),
    "utf8",
  );
  const sidebarHtml = readFileSync(new URL("../../ui/sidebar.html", import.meta.url), "utf8");
  const globalSource = readFileSync(new URL("../../src/global.ts", import.meta.url), "utf8");

  it("covers startup, open, stable endpoint and manual model refresh triggers", () => {
    expect(globalSource).toContain("prefetchProfileModels");
    expect(globalSource).toContain("models-startup-");
    expect(sidebarSource).toContain('requestModels("open")');
    expect(sidebarSource).toContain('requestModels("endpoint")');
    expect(sidebarSource).toContain('requestModels("manual")');
    expect(sidebarSource).toContain("}, 400)");
    expect(sidebarSource).toContain("pendingModelRefresh");
  });

  it("does not reinterpret repeated ui:ready as a model refresh", () => {
    const readyStart = mainSource.indexOf('runtime.sidebar.onMessage("ui:ready"');
    const readyEnd = mainSource.indexOf('runtime.sidebar.onMessage("ui:poll"', readyStart);
    const readySource = mainSource.slice(readyStart, readyEnd);
    expect(readySource).not.toContain("provider:models");
    expect(sidebarSource).toContain('onMessage("provider:models-result"');
  });

  it("lets the live webview request state instead of posting from the player timer", () => {
    expect(mainSource).toContain('runtime.sidebar.onMessage("ui:poll"');
    expect(sidebarSource).toContain('postMessage("ui:poll"');

    const timerStart = mainSource.indexOf("setInterval(() =>");
    const timerEnd = mainSource.indexOf('runtime.event.on("iina.window-will-close"', timerStart);
    const timerSource = mainSource.slice(timerStart, timerEnd);

    expect(timerStart).toBeGreaterThan(-1);
    expect(timerEnd).toBeGreaterThan(timerStart);
    expect(timerSource).not.toContain("sidebar.postMessage");
  });

  it("keeps the in-memory tick alive when IINA reuses a closed player context", () => {
    expect(mainSource).not.toContain("clearInterval(");
    expect(mainSource).toContain("clearTimeout(sourceSelectionTimer)");
    const closeStart = mainSource.indexOf('runtime.event.on("iina.window-will-close"');
    const closeSource = mainSource.slice(closeStart);
    expect(closeSource).toContain("controller.endFile()");
    expect(closeSource).toContain("controller.clearProviderSelection()");
    expect(closeSource).not.toContain("controller.close()");
  });

  it("tears down an ended file without permanently closing the player controller", () => {
    expect(mainSource).toContain('runtime.event.on("mpv.end-file", () => controller.endFile())');
    expect(mainSource).toContain('runtime.event.on("iina.window-will-close"');
    expect(mainSource).toContain("controller.endFile()");
  });

  it("settles real primary-subtitle changes without generated-track suppression", () => {
    expect(mainSource).toContain('runtime.event.on("mpv.sid.changed"');
    expect(mainSource).toContain('runtime.event.on("mpv.track-list.changed"');
    expect(mainSource).not.toContain("generatedTrack");
    expect(mainSource).toContain("setTimeout(attemptSourceReload, 250)");
    expect(mainSource).toContain("sourceReloadAttempt >= 4");
  });

  it("reloads real subtitle changes without translation-track commands or selection writes", () => {
    const eventStart = mainSource.indexOf('runtime.event.on("mpv.sid.changed"');
    const eventEnd = mainSource.indexOf('runtime.event.on("mpv.seek"', eventStart);
    const eventSource = mainSource.slice(eventStart, eventEnd);
    expect(eventSource).toContain("scheduleSourceReload");
    expect(mainSource).not.toContain('"sub-add"');
    expect(mainSource).not.toContain('"sub-remove"');
    expect(mainSource).not.toContain('"secondary-sid"');
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

  it("requests profile deletion from Main and uses IINA's native confirmation UI", () => {
    expect(sidebarSource).toContain('"profile:delete-request"');
    expect(sidebarSource).not.toContain("window.confirm");
    expect(mainSource).toContain('runtime.sidebar.onMessage("profile:delete-request"');
    expect(mainSource).toContain("runtime.utils.ask");
  });

  it("converges profile deletion only from the authoritative cross-runtime success", () => {
    const handlerStart = mainSource.indexOf('runtime.global.onMessage("profile:deleted"');
    const handlerSource = mainSource.slice(handlerStart, handlerStart + 1_500);
    expect(mainSource).toContain("removeDeletedProfile");
    expect(mainSource).toContain("beginProfileListRequest");
    expect(handlerSource.indexOf("removeDeletedProfile")).toBeLessThan(
      handlerSource.indexOf("requestProfiles"),
    );
    expect(sidebarSource).toContain("deleteSucceeded");
    expect(sidebarSource).toContain('onMessage("profile:deleted"');
  });

  it("keeps request-correlated operation feedback separate from session polling", () => {
    expect(sidebarSource).toContain("pendingOperations");
    expect(sidebarSource).toContain('onMessage("operation:result"');
    expect(sidebarSource).toContain("requestId");
    expect(sidebarSource).toContain("aria-busy");
  });

  it("binds every operation to its local region and ignores unowned late feedback", () => {
    for (const region of [
      "translation-toggle",
      "language-settings",
      "profile-editor",
      "profile-row:",
      "subtitle-retry",
    ])
      expect(sidebarSource).toContain(region);
    expect(sidebarSource).toContain("sidebarState.finishOperation");
    expect(sidebarSource).toContain("if (!finished.accepted) return");
  });

  it("coordinates one persistent global message without coupling it to request busy state", () => {
    expect(sidebarStateSource).toContain("latestRequestByRegion");
    expect(sidebarStateSource).toContain("activeFeedback");
    expect(sidebarSource).toContain("renderActiveFeedback");
    expect(sidebarStateSource).not.toContain("expiresAt");
    expect(sidebarStateSource).not.toContain("expireFeedback");
    expect(sidebarSource).not.toContain("scheduleFeedbackExpiry");
    expect(sidebarSource).not.toContain("snapshot.feedback");
  });

  it("redraws Profile rows from request ownership and only restores the active message", () => {
    const renderStart = sidebarSource.indexOf("function renderProfiles");
    const renderEnd = sidebarSource.indexOf('window.iina?.onMessage("state:update"', renderStart);
    const renderSource = sidebarSource.slice(renderStart, renderEnd);

    expect(renderSource).toContain("latestRequestByRegion");
    expect(renderSource).toContain("activeFeedback");
    expect(renderSource).toContain("renderActiveFeedback");
    expect(renderSource).not.toContain("snapshot.feedback");
  });

  it("keeps Update selection invalidation through optional credential completion", () => {
    expect(sidebarSource).toContain("beginProfileSave");
    expect(sidebarSource).toContain("profileRevisionCreated");
    expect(sidebarSource).toContain("completeProfileSave");
    expect(sidebarSource).toContain("Profile updated. Select it again for translation.");
    expect(sidebarSource).not.toContain("to authorize translation");
  });

  it("prioritizes every safe embedded preparation state and exposes Retry only when allowed", () => {
    for (const text of [
      "Preparing the selected embedded subtitle…",
      "This subtitle type is not supported. Select a text subtitle in IINA.",
      "Embedded subtitles in remote media are not supported.",
      "The selected subtitle is empty or unreadable.",
      "Subtitle preparation timed out. Playback continues.",
      "Subtitle preparation failed. Playback continues.",
    ])
      expect(sidebarSource).toContain(text);
    expect(sidebarSource).toContain('postMessage("subtitle:retry-preparation"');
    expect(sidebarSource).toContain("canRetry");
    expect(mainSource).toContain('runtime.sidebar.onMessage("subtitle:retry-preparation"');
  });

  it("announces subtitle preparation state once in the Session card", () => {
    expect(sidebarHtml).not.toContain('id="source-preparation"');
    expect(sidebarSource).not.toContain("sourcePreparation.textContent");
  });

  it("accepts only a strict revisioned empty Retry envelope", () => {
    expect(
      parseRetrySubtitlePreparation({ requestId: "retry-1", revision: 1, payload: {} }),
    ).toEqual({ requestId: "retry-1", revision: 1, payload: {} });
    expect(() =>
      parseRetrySubtitlePreparation({ requestId: "retry-1", revision: 0, payload: {} }),
    ).toThrow("INVALID_MESSAGE");
    expect(() =>
      parseRetrySubtitlePreparation({
        requestId: "retry-1",
        revision: 1,
        payload: { path: "/private/media" },
      }),
    ).toThrow("INVALID_MESSAGE");
  });
});

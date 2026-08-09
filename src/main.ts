import { PlaybackController } from "./app/controller.js";
import { finitePosition } from "./adapters/iina/runtime.js";
import { IinaSubtitleSourcePort, readSelectedSubtitle } from "./adapters/iina/subtitle-source.js";
import {
  GeneratedSubtitleTrackManager,
  IinaSubtitleTrackPort,
} from "./adapters/iina/subtitle-track.js";
import type { TranslationProvider } from "./providers/provider.js";
import type { TranslationBatchRequest, TranslationBatchResult } from "./providers/types.js";

class GlobalProviderClient implements TranslationProvider {
  private readonly pending = new Map<
    string,
    { resolve: (result: TranslationBatchResult) => void; reject: (error: unknown) => void }
  >();

  constructor(private readonly globalPort: IINA.API.Global) {
    globalPort.onMessage("provider:attempt-result", (raw: unknown) => {
      const result = raw as { requestId?: string; result?: TranslationBatchResult };
      if (!result.requestId || !result.result) return;
      this.pending.get(result.requestId)?.resolve(result.result);
      this.pending.delete(result.requestId);
    });
    globalPort.onMessage("provider:attempt-error", (raw: unknown) => {
      const result = raw as { requestId?: string; error?: unknown };
      if (!result.requestId) return;
      this.pending
        .get(result.requestId)
        ?.reject(result.error ?? new Error("PROVIDER_ATTEMPT_FAILED"));
      this.pending.delete(result.requestId);
    });
  }

  attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, { resolve, reject });
      this.globalPort.postMessage("provider:attempt", {
        requestId: request.requestId,
        revision: request.profileRevision,
        payload: request,
      });
    });
  }

  cancel(requestId: string): void {
    this.globalPort.postMessage("provider:cancel", {
      requestId,
      revision: 1,
      payload: { requestId },
    });
    this.pending.get(requestId)?.reject({ category: "cancelled", retryable: false });
    this.pending.delete(requestId);
  }
}

interface MainRuntime {
  core: IINA.API.Core;
  event: IINA.API.Event;
  file: IINA.API.File;
  global: IINA.API.Global;
  mpv: IINA.API.MPV;
  preferences: IINA.API.Preferences;
  sidebar: IINA.API.SidebarView;
  utils: IINA.API.Utils;
}

function wirePlayer(runtime: MainRuntime, playerId: string): PlaybackController {
  const provider = new GlobalProviderClient(runtime.global);
  const sourcePort = new IinaSubtitleSourcePort(runtime.core.subtitle, runtime.file);
  const generatedTrack = new GeneratedSubtitleTrackManager(
    new IinaSubtitleTrackPort(runtime.core.subtitle, runtime.file, runtime.mpv, runtime.utils),
    playerId,
    `session-${Date.now()}`,
  );
  const savedTarget = runtime.preferences.get("targetLanguage");
  const savedSource = runtime.preferences.get("sourceLanguage");
  const savedSourceMode = runtime.preferences.get("sourceLanguageMode");
  let manualSourceLanguage =
    savedSourceMode !== "track" && typeof savedSource === "string" && savedSource.trim()
      ? savedSource.trim()
      : null;
  let selectedSourceTrackId: number | null = null;
  let sourceSelectionTimer: ReturnType<typeof setTimeout> | null = null;
  const controller = new PlaybackController({
    playerId,
    provider,
    track: generatedTrack,
    targetLanguage: typeof savedTarget === "string" ? savedTarget : "zh-Hans",
    requiresProviderSelection: true,
  });
  controller.setEnabled(runtime.preferences.get("enabledByDefault") === true);
  let currentSelection: {
    profileId: string;
    revision: number;
    endpointFingerprint: string;
  } | null = null;
  const boundedWork = "120 s / 40 cues; 25 cues / 5,000 code points per request";
  let sidebarState: Record<string, unknown> = {
    status: controller.status,
    cacheSize: controller.cacheSize,
    boundedWork,
    source: null,
  };
  const sidebarMessages: Array<{ name: string; data: unknown }> = [];

  const updateSidebarState = (patch: Record<string, unknown> = {}): void => {
    sidebarState = {
      ...sidebarState,
      status: controller.status,
      cacheSize: controller.cacheSize,
      boundedWork,
      ...patch,
    };
  };

  const queueSidebarMessage = (name: string, data: unknown): void => {
    sidebarMessages.push({ name, data });
    if (sidebarMessages.length > 32) sidebarMessages.shift();
  };

  // Only post while handling a message sent by the live webview. IINA 1.4.4
  // traps in native code if a background callback posts after the sidebar has
  // been torn down during a plugin reload.
  const flushSidebar = (): void => {
    runtime.sidebar.postMessage("state:update", sidebarState);
    for (const message of sidebarMessages.splice(0)) {
      runtime.sidebar.postMessage(message.name, message.data);
    }
  };

  const loadSource = (): void => {
    selectedSourceTrackId = runtime.core.subtitle.id;
    const loaded = readSelectedSubtitle(sourcePort);
    const effectiveLanguage = loaded.ok ? (manualSourceLanguage ?? loaded.source.language) : null;
    controller.setSource(
      loaded.ok
        ? {
            cues: loaded.source.cues,
            contentHash: loaded.source.contentHash,
            language: effectiveLanguage,
            format: loaded.source.format,
          }
        : null,
    );
    updateSidebarState({
      source: loaded.ok
        ? {
            format: loaded.source.format,
            cueCount: loaded.source.cues.length,
            language: effectiveLanguage,
            detectedLanguage: loaded.source.language,
            warnings: loaded.source.decode.warnings,
          }
        : null,
    });
  };

  // IINA clears the sidebar message hub when loadFile() is called, so load the
  // webview before registering any of its message handlers.
  runtime.sidebar.loadFile("dist/ui/sidebar.html");
  runtime.sidebar.onMessage("ui:ready", () => {
    loadSource();
    runtime.global.postMessage("profiles:list", {
      requestId: `profiles-${Date.now()}`,
      revision: 1,
      payload: {},
    });
    flushSidebar();
  });
  runtime.sidebar.onMessage("ui:poll", () => {
    updateSidebarState();
    flushSidebar();
  });
  runtime.sidebar.onMessage("translation:set-enabled", (raw: unknown) => {
    const enabled = Boolean((raw as { payload?: { enabled?: unknown } }).payload?.enabled);
    controller.setEnabled(enabled);
    runtime.preferences.set("enabledByDefault", enabled);
    runtime.preferences.sync();
    updateSidebarState();
    flushSidebar();
  });
  runtime.sidebar.onMessage("defaults:save", (raw: unknown) => {
    const payload = (raw as { payload?: Record<string, unknown> }).payload;
    if (payload && typeof payload.targetLanguage === "string") {
      manualSourceLanguage =
        typeof payload.sourceLanguage === "string" && payload.sourceLanguage.trim()
          ? payload.sourceLanguage.trim()
          : null;
      runtime.preferences.set("targetLanguage", payload.targetLanguage);
      runtime.preferences.set("sourceLanguage", manualSourceLanguage);
      runtime.preferences.set("sourceLanguageMode", manualSourceLanguage ? "manual" : "track");
      runtime.preferences.sync();
      controller.setLanguages(payload.targetLanguage, manualSourceLanguage);
      loadSource();
    }
    runtime.global.postMessage("defaults:save", raw);
  });

  const forward: Array<[string, string]> = [
    ["profile:save", "profile:create-revision"],
    ["secret:set", "vault:set-secret"],
    ["profile:select", "profile:select"],
    ["provider:test", "provider:test"],
    ["vault:reset", "vault:reset"],
  ];
  for (const [sidebarName, globalName] of forward) {
    runtime.sidebar.onMessage(sidebarName, (raw: unknown) =>
      runtime.global.postMessage(globalName, raw),
    );
  }
  runtime.global.onMessage("profiles:result", (raw: unknown) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      updateSidebarState(raw as Record<string, unknown>);
    }
  });
  runtime.global.onMessage("profile:revision-created", (raw: unknown) =>
    queueSidebarMessage("profile:revision-created", raw),
  );
  runtime.global.onMessage("vault:result", (raw: unknown) =>
    queueSidebarMessage("vault:state", raw),
  );
  runtime.global.onMessage("vault:state", (raw: unknown) =>
    queueSidebarMessage("vault:state", raw),
  );
  runtime.global.onMessage("provider:test-result", (raw: unknown) =>
    queueSidebarMessage("provider:test-result", raw),
  );
  runtime.global.onMessage("operation:error", (raw: unknown) =>
    queueSidebarMessage("operation:error", raw),
  );
  runtime.global.onMessage("profile:selected", (raw: unknown) => {
    const selection = (
      raw as {
        selection?: { profileId?: unknown; revision?: unknown; endpointFingerprint?: unknown };
      }
    ).selection;
    if (
      !selection ||
      typeof selection.profileId !== "string" ||
      typeof selection.revision !== "number" ||
      typeof selection.endpointFingerprint !== "string"
    )
      return;
    if (currentSelection) {
      runtime.global.postMessage("profile:release", {
        requestId: `release-${Date.now()}`,
        revision: 1,
        payload: currentSelection,
      });
    }
    currentSelection = {
      profileId: selection.profileId,
      revision: selection.revision,
      endpointFingerprint: selection.endpointFingerprint,
    };
    controller.setProviderSelection(currentSelection);
    updateSidebarState({
      selection: currentSelection,
    });
  });
  runtime.global.postMessage("profiles:list", {
    requestId: `profiles-${Date.now()}`,
    revision: 1,
    payload: {},
  });

  runtime.event.on("iina.file-loaded", loadSource);
  runtime.event.on("mpv.sid.changed", () => {
    const selectedId = runtime.core.subtitle.id;
    if (
      generatedTrack.isPublishing ||
      generatedTrack.hasOwnedTrack ||
      generatedTrack.ownsTrack(selectedId) ||
      selectedId === selectedSourceTrackId
    )
      return;
    if (sourceSelectionTimer !== null) clearTimeout(sourceSelectionTimer);
    sourceSelectionTimer = setTimeout(() => {
      sourceSelectionTimer = null;
      const settledId = runtime.core.subtitle.id;
      if (
        generatedTrack.isPublishing ||
        generatedTrack.hasOwnedTrack ||
        generatedTrack.ownsTrack(settledId) ||
        settledId === selectedSourceTrackId
      )
        return;
      loadSource();
    }, 250);
  });
  runtime.event.on("mpv.seek", () =>
    controller.session.onSeek(
      finitePosition(
        runtime.core.status.position === null ? null : runtime.core.status.position * 1_000,
      ),
    ),
  );
  runtime.event.on("mpv.end-file", () => controller.close());
  const tickInterval = setInterval(() => {
    controller.session.setPaused(runtime.core.status.paused);
    controller.tick(
      finitePosition(
        runtime.core.status.position === null ? null : runtime.core.status.position * 1_000,
      ),
    );
    updateSidebarState();
  }, 350);
  runtime.event.on("iina.window-will-close", () => {
    clearInterval(tickInterval);
    if (sourceSelectionTimer !== null) clearTimeout(sourceSelectionTimer);
    if (currentSelection)
      runtime.global.postMessage("profile:release", {
        requestId: `release-${Date.now()}`,
        revision: 1,
        payload: currentSelection,
      });
    controller.close();
  });
  loadSource();
  return controller;
}

// A normal IINA player is not created by global.createPlayerInstance(), so it
// does not need a global round-trip before its main entry can initialize. The
// global entry receives IINA's real player identifier with every later
// message; this local session ID is used only for generated subtitle assets.
//
// sidebar.loadFile() is unavailable until the player window exists. Register
// first and then re-check the state to avoid missing a window-loaded event that
// fires between those two operations.
let playerWired = false;
const initializePlayer = (): void => {
  if (playerWired || !iina.core.window.loaded) return;
  playerWired = true;
  wirePlayer(iina, `player-${Date.now()}`);
};
const scheduleInitializePlayer = (): void => {
  setTimeout(initializePlayer, 100);
};
iina.event.on("iina.window-loaded", scheduleInitializePlayer);
scheduleInitializePlayer();

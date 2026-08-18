import { PlaybackController } from "./app/controller.js";
import { GlobalProviderClient } from "./adapters/iina/global-provider-client.js";
import { finitePosition } from "./adapters/iina/runtime.js";
import {
  SubtitleExtractorClient,
  SubtitleExtractorProcess,
  discoverSubtitleExtractorExecutable,
} from "./adapters/iina/subtitle-extractor.js";
import {
  classifySubtitleSelection,
  IinaSubtitleSourcePort,
  readSelectedSubtitle,
} from "./adapters/iina/subtitle-source.js";
import { IinaLocalHttpBridge, IinaProcessLauncher } from "./adapters/iina/provider-transport.js";
import { IinaTranslationOverlay } from "./adapters/iina/subtitle-overlay.js";
import { SubtitlePreparationCoordinator } from "./app/subtitle-preparation.js";
import { parseRetrySubtitlePreparation } from "./domain/messages.js";
import type {
  PreparedSubtitleSource,
  SourcePreparationView,
  SubtitleTrackIdentity,
} from "./subtitles/types.js";

interface MainRuntime {
  core: IINA.API.Core;
  event: IINA.API.Event;
  file: IINA.API.File;
  global: IINA.API.Global;
  http: IINA.API.HTTP;
  mpv: IINA.API.MPV;
  preferences: IINA.API.Preferences;
  sidebar: IINA.API.SidebarView;
  utils: IINA.API.Utils;
}

function wirePlayer(runtime: MainRuntime, playerId: string): PlaybackController {
  const provider = new GlobalProviderClient(runtime.global);
  let mediaEpoch = 0;
  const sourcePort = new IinaSubtitleSourcePort(
    runtime.core.subtitle,
    runtime.file,
    runtime.core,
    runtime.mpv,
    playerId,
    () => mediaEpoch,
  );
  const translationOverlay = new IinaTranslationOverlay(runtime.mpv);
  const savedTarget = runtime.preferences.get("targetLanguage");
  const savedSource = runtime.preferences.get("sourceLanguage");
  const savedSourceMode = runtime.preferences.get("sourceLanguageMode");
  let manualSourceLanguage =
    savedSourceMode !== "track" && typeof savedSource === "string" && savedSource.trim()
      ? savedSource.trim()
      : null;
  let selectedSourceTrackId: number | null = null;
  let selectedSourceContentHash: string | null = null;
  let selectedSourceLanguage: string | null = null;
  let sourceSelectionTimer: ReturnType<typeof setTimeout> | null = null;
  let sourceReloadAttempt = 0;
  let preparation: SubtitlePreparationCoordinator | null = null;
  let preparationPromise: Promise<SubtitlePreparationCoordinator> | null = null;
  let preparationView: SourcePreparationView | null = null;
  let embeddedPreparationKey: string | null = null;
  const controller = new PlaybackController({
    playerId,
    provider,
    overlay: translationOverlay,
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
    providerError: controller.providerError,
    boundedWork,
    source: null,
    sourceIssue: "unreadable",
    sourcePreparation: null,
  };
  const sidebarMessages: Array<{ name: string; data: unknown }> = [];

  const updateSidebarState = (patch: Record<string, unknown> = {}): void => {
    sidebarState = {
      ...sidebarState,
      status: controller.status,
      cacheSize: controller.cacheSize,
      providerError: controller.providerError,
      boundedWork,
      sourcePreparation: preparation?.view ?? preparationView,
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

  const invalidatePreparation = (): void => {
    preparation?.invalidate("invalidated");
    preparationView = null;
    embeddedPreparationKey = null;
  };

  const clearSource = (reason: string, invalidateEmbedded = true): void => {
    if (invalidateEmbedded) invalidatePreparation();
    selectedSourceTrackId = runtime.core.subtitle.id;
    selectedSourceContentHash = null;
    selectedSourceLanguage = null;
    controller.setSource(null);
    updateSidebarState({ source: null, sourceIssue: reason, sourcePreparation: preparationView });
  };

  const preparationKey = (track: SubtitleTrackIdentity, epoch: number): string =>
    [epoch, track.trackId, track.codec, track.ffIndex ?? "", track.sourceId ?? ""].join(":");

  const coordinator = (): Promise<SubtitlePreparationCoordinator> => {
    if (preparation) return Promise.resolve(preparation);
    if (preparationPromise) return preparationPromise;
    preparationPromise = (async () => {
      const executable = discoverSubtitleExtractorExecutable({
        exists: (path) => runtime.file.exists(path),
        resolvePath: (path) => runtime.utils.resolvePath(path),
        list: (path) => runtime.file.list(path, { includeSubDir: false }),
        read: (path) => runtime.file.read(path) ?? null,
      });
      const session = await SubtitleExtractorProcess.bootstrap(
        new IinaProcessLauncher(runtime.utils),
        { tempDirectory: runtime.utils.resolvePath("@tmp/sublingo-extraction") },
        executable,
      );
      preparation = new SubtitlePreparationCoordinator({
        playerId,
        extractor: new SubtitleExtractorClient(session, new IinaLocalHttpBridge(runtime.http)),
        readResult: (resultId) =>
          sourcePort.readBinary(`@tmp/sublingo-extraction/${resultId}/output.srt`),
      });
      return preparation;
    })();
    void preparationPromise.catch(() => {
      preparationPromise = null;
    });
    return preparationPromise;
  };

  const acceptPrepared = (key: string, prepared: PreparedSubtitleSource | null): void => {
    preparationView = preparation?.view ?? null;
    if (!prepared || embeddedPreparationKey !== key) {
      updateSidebarState({ sourcePreparation: preparationView });
      return;
    }
    const currentSnapshot = sourcePort.selectionSnapshot();
    const current = currentSnapshot ? classifySubtitleSelection(currentSnapshot) : null;
    if (
      current?.kind !== "embedded" ||
      preparationKey(current.track, current.media.mediaEpoch) !== key
    ) {
      preparation?.invalidate("invalidated");
      return;
    }
    const effectiveLanguage = manualSourceLanguage ?? prepared.language;
    selectedSourceContentHash = prepared.contentHash;
    selectedSourceLanguage = effectiveLanguage;
    controller.setSource({
      cues: prepared.cues,
      contentHash: prepared.contentHash,
      language: effectiveLanguage,
      format: "srt",
    });
    updateSidebarState({
      source: {
        format: prepared.codec,
        cueCount: prepared.cues.length,
        language: effectiveLanguage,
        detectedLanguage: prepared.language,
        warnings: [],
      },
      sourceIssue: null,
      sourcePreparation: preparation?.view ?? preparationView,
    });
  };

  const loadEmbedded = (
    media: Parameters<SubtitlePreparationCoordinator["prepare"]>[0],
    track: Parameters<SubtitlePreparationCoordinator["prepare"]>[1],
  ): void => {
    const key = preparationKey(track, media.mediaEpoch);
    if (
      embeddedPreparationKey === key &&
      (preparation?.view?.state === "preparing" || preparation?.view?.state === "ready")
    )
      return;
    invalidatePreparation();
    embeddedPreparationKey = key;
    selectedSourceTrackId = track.trackId;
    selectedSourceContentHash = null;
    selectedSourceLanguage = null;
    controller.setSource(null);
    preparationView = {
      state: "preparing",
      origin: "embedded",
      ...(track.codec === "external" ? {} : { codec: track.codec }),
      canRetry: false,
      canReselect: true,
    };
    updateSidebarState({ source: null, sourceIssue: null, sourcePreparation: preparationView });
    void coordinator()
      .then((value) => value.prepare(media, track))
      .then((prepared) => acceptPrepared(key, prepared))
      .catch(() => {
        if (embeddedPreparationKey !== key) return;
        preparationView = {
          state: "failed",
          origin: "embedded",
          ...(track.codec === "external" ? {} : { codec: track.codec }),
          canRetry: true,
          canReselect: true,
        };
        updateSidebarState({ source: null, sourceIssue: null, sourcePreparation: preparationView });
      });
  };

  const loadSource = (commitFailure = true): boolean => {
    const snapshot = sourcePort.selectionSnapshot();
    const selection = snapshot ? classifySubtitleSelection(snapshot) : null;
    if (selection?.kind === "embedded") {
      loadEmbedded(selection.media, selection.track);
      return true;
    }
    if (selection?.kind === "unsupported") {
      invalidatePreparation();
      preparationView = {
        state: selection.state,
        origin: "embedded",
        ...(selection.track?.codec && selection.track.codec !== "external"
          ? { codec: selection.track.codec }
          : {}),
        canRetry: selection.state === "emptyOrUnreadable",
        canReselect: true,
      };
      controller.setSource(null);
      updateSidebarState({ source: null, sourceIssue: null, sourcePreparation: preparationView });
      return true;
    }
    invalidatePreparation();
    const loaded = readSelectedSubtitle(sourcePort);
    if (!loaded.ok) {
      if (commitFailure) clearSource(loaded.reason);
      return false;
    }
    const effectiveLanguage = manualSourceLanguage ?? loaded.source.language;
    const unchanged =
      selectedSourceTrackId === loaded.source.trackId &&
      selectedSourceContentHash === loaded.source.contentHash &&
      selectedSourceLanguage === effectiveLanguage;
    selectedSourceTrackId = loaded.source.trackId;
    selectedSourceContentHash = loaded.source.contentHash;
    selectedSourceLanguage = effectiveLanguage;
    if (!unchanged)
      controller.setSource({
        cues: loaded.source.cues,
        contentHash: loaded.source.contentHash,
        language: effectiveLanguage,
        format: loaded.source.format,
      });
    updateSidebarState({
      source: {
        format: loaded.source.format,
        cueCount: loaded.source.cues.length,
        language: effectiveLanguage,
        detectedLanguage: loaded.source.language,
        warnings: loaded.source.decode.warnings,
      },
      sourceIssue: null,
      sourcePreparation: null,
    });
    return true;
  };

  const attemptSourceReload = (): void => {
    sourceSelectionTimer = null;
    const finalAttempt = sourceReloadAttempt >= 4;
    if (loadSource(finalAttempt) || finalAttempt) return;
    sourceReloadAttempt += 1;
    sourceSelectionTimer = setTimeout(attemptSourceReload, 250);
  };

  const scheduleSourceReload = (invalidateChangedSelection = false): void => {
    const selectedId = runtime.core.subtitle.id;
    if (invalidateChangedSelection && selectedId !== selectedSourceTrackId)
      clearSource("unreadable");
    if (sourceSelectionTimer !== null) clearTimeout(sourceSelectionTimer);
    sourceReloadAttempt = 0;
    sourceSelectionTimer = setTimeout(attemptSourceReload, 250);
  };

  // IINA clears the sidebar message hub when loadFile() is called, so load the
  // webview before registering any of its message handlers.
  runtime.sidebar.loadFile("dist/ui/sidebar.html");
  runtime.sidebar.onMessage("ui:ready", () => {
    if (!loadSource(false)) scheduleSourceReload();
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
    if (!enabled) invalidatePreparation();
    else if (!loadSource(false)) scheduleSourceReload();
    runtime.preferences.set("enabledByDefault", enabled);
    runtime.preferences.sync();
    updateSidebarState();
    queueSidebarMessage("operation:result", {
      requestId: (raw as { requestId?: unknown }).requestId,
      ok: true,
      action: "translation",
    });
    flushSidebar();
  });
  runtime.sidebar.onMessage("subtitle:retry-preparation", (raw: unknown) => {
    let requestId: string | undefined;
    try {
      const message = parseRetrySubtitlePreparation(raw);
      requestId = message.requestId;
      const snapshot = sourcePort.selectionSnapshot();
      const selection = snapshot ? classifySubtitleSelection(snapshot) : null;
      if (selection?.kind !== "embedded") throw new Error("INVALID_RETRY");
      const key = preparationKey(selection.track, selection.media.mediaEpoch);
      if (!preparation || preparation.view?.canRetry !== true || key !== embeddedPreparationKey)
        throw new Error("INVALID_RETRY");
      preparationView = {
        state: "preparing",
        origin: "embedded",
        ...(selection.track.codec === "external" ? {} : { codec: selection.track.codec }),
        canRetry: false,
        canReselect: true,
      };
      updateSidebarState({ source: null, sourceIssue: null, sourcePreparation: preparationView });
      void preparation.retry().then((prepared) => acceptPrepared(key, prepared));
      queueSidebarMessage("operation:result", {
        requestId,
        ok: true,
        action: "retry-preparation",
      });
    } catch {
      queueSidebarMessage("operation:result", {
        requestId,
        ok: false,
        action: "retry-preparation",
      });
    }
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
      if (!loadSource(false)) scheduleSourceReload();
    }
    queueSidebarMessage("operation:result", {
      requestId: (raw as { requestId?: unknown }).requestId,
      ok: true,
      action: "languages",
    });
    runtime.global.postMessage("defaults:save", raw);
    flushSidebar();
  });

  const forward: Array<[string, string]> = [
    ["profile:save", "profile:create-revision"],
    ["secret:set", "credential:set"],
    ["profile:select", "profile:select"],
    ["provider:test", "provider:test"],
  ];
  for (const [sidebarName, globalName] of forward) {
    runtime.sidebar.onMessage(sidebarName, (raw: unknown) =>
      runtime.global.postMessage(globalName, raw),
    );
  }
  runtime.sidebar.onMessage("profile:delete-request", (raw: unknown) => {
    const source = raw as {
      requestId?: unknown;
      revision?: unknown;
      payload?: { displayName?: unknown };
    };
    let confirmed = false;
    try {
      const displayName =
        typeof source.payload?.displayName === "string"
          ? source.payload.displayName
          : "this profile";
      confirmed = runtime.utils.ask(
        `Delete ${displayName}? Its saved credential will be permanently removed.`,
      );
    } catch {
      confirmed = false;
    }
    if (!confirmed) {
      queueSidebarMessage("operation:result", {
        requestId: source.requestId,
        ok: false,
        cancelled: true,
        action: "delete-profile",
      });
      flushSidebar();
      return;
    }
    runtime.global.postMessage("profile:delete", raw);
  });
  runtime.global.onMessage("profiles:result", (raw: unknown) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      updateSidebarState(raw as Record<string, unknown>);
    }
  });
  runtime.global.onMessage("profile:revision-created", (raw: unknown) => {
    const result = raw as {
      selectionInvalidated?: unknown;
      profile?: { profileId?: unknown };
    };
    if (
      result.selectionInvalidated === true &&
      currentSelection &&
      result.profile?.profileId === currentSelection.profileId
    ) {
      runtime.global.postMessage("profile:release", {
        requestId: `release-${Date.now()}`,
        revision: 1,
        payload: currentSelection,
      });
      currentSelection = null;
      controller.clearProviderSelection();
      updateSidebarState({ selection: null });
    }
    queueSidebarMessage("profile:revision-created", raw);
  });
  runtime.global.onMessage("credential:result", (raw: unknown) =>
    queueSidebarMessage("credential:state", raw),
  );
  runtime.global.onMessage("credential:state", (raw: unknown) =>
    queueSidebarMessage("credential:state", raw),
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
    queueSidebarMessage("profile:selected", raw);
  });
  runtime.global.onMessage("profile:deleted", (raw: unknown) => {
    const result = raw as { profileId?: unknown; selectionInvalidated?: unknown };
    if (
      result.selectionInvalidated === true ||
      (currentSelection && result.profileId === currentSelection.profileId)
    ) {
      currentSelection = null;
      controller.clearProviderSelection();
      updateSidebarState({ selection: null });
    }
    queueSidebarMessage("profile:deleted", raw);
    runtime.global.postMessage("profiles:list", {
      requestId: `profiles-${Date.now()}`,
      revision: 1,
      payload: {},
    });
  });
  runtime.global.postMessage("profiles:list", {
    requestId: `profiles-${Date.now()}`,
    revision: 1,
    payload: {},
  });

  runtime.event.on("iina.file-loaded", () => {
    mediaEpoch += 1;
    invalidatePreparation();
    controller.endFile();
    clearSource("unreadable");
    scheduleSourceReload();
  });
  runtime.event.on("mpv.sid.changed", () => {
    const selectedId = runtime.core.subtitle.id;
    if (selectedId === selectedSourceTrackId) return;
    scheduleSourceReload(true);
  });
  runtime.event.on("mpv.track-list.changed", () => scheduleSourceReload());
  runtime.event.on("mpv.seek", () => {
    preparation?.onSeek();
    controller.onSeek(
      finitePosition(
        runtime.core.status.position === null ? null : runtime.core.status.position * 1_000,
      ),
    );
  });
  runtime.event.on("mpv.end-file", () => {
    mediaEpoch += 1;
    invalidatePreparation();
  });
  runtime.event.on("mpv.end-file", () => controller.endFile());
  setInterval(() => {
    controller.session.setPaused(runtime.core.status.paused);
    controller.tick(
      finitePosition(
        runtime.core.status.position === null ? null : runtime.core.status.position * 1_000,
      ),
    );
    updateSidebarState();
  }, 350);
  runtime.event.on("iina.window-will-close", () => {
    if (sourceSelectionTimer !== null) clearTimeout(sourceSelectionTimer);
    if (currentSelection)
      runtime.global.postMessage("profile:release", {
        requestId: `release-${Date.now()}`,
        revision: 1,
        payload: currentSelection,
      });
    currentSelection = null;
    selectedSourceTrackId = null;
    selectedSourceContentHash = null;
    selectedSourceLanguage = null;
    void preparation?.shutdown();
    preparation = null;
    preparationPromise = null;
    preparationView = null;
    embeddedPreparationKey = null;
    controller.endFile();
    controller.clearProviderSelection();
    updateSidebarState({ source: null, sourceIssue: "unreadable", selection: null });
  });
  if (!loadSource(false)) scheduleSourceReload();
  return controller;
}

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

import type { PlayerId } from "../domain/types.js";
import type { TranslationProvider } from "./provider.js";
import type { ProviderProfiles } from "./profiles.js";
import type {
  ProviderProfileSnapshot,
  TranslationBatchRequest,
  TranslationBatchResult,
} from "./types.js";

export class ProviderBrokerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class ProviderBroker {
  private readonly active = new Map<
    string,
    { provider: TranslationProvider; requestId: string }
  >();
  private authorizationEpoch = 0;

  constructor(
    private readonly profiles: ProviderProfiles,
    private readonly createProvider: (
      profile: ProviderProfileSnapshot,
    ) => TranslationProvider | Promise<TranslationProvider>,
  ) {}

  select(windowId: string, profileId: string, revision: number, endpointFingerprint: string): void {
    this.profiles.select(windowId, profileId, revision, endpointFingerprint);
  }

  lease(windowId: string, profileId: string, revision: number): void {
    this.profiles.lease(windowId, profileId, revision);
  }

  release(windowId: string, profileId: string, revision: number): void {
    this.profiles.release(windowId, profileId, revision);
  }

  async attempt(
    authoritativePlayerId: string,
    request: TranslationBatchRequest,
  ): Promise<TranslationBatchResult> {
    const selection = this.profiles.selection(authoritativePlayerId);
    if (
      !selection ||
      selection.profileId !== request.profileId ||
      selection.revision !== request.profileRevision ||
      selection.endpointFingerprint !== request.endpointFingerprint
    ) {
      throw new ProviderBrokerError("PROFILE_NOT_SELECTED");
    }
    const profile = this.profiles.get(selection.profileId, selection.revision);
    if (!profile) throw new ProviderBrokerError("PROFILE_NOT_FOUND");
    const epoch = this.authorizationEpoch;
    const provider = await this.createProvider(profile);
    if (epoch !== this.authorizationEpoch)
      throw new ProviderBrokerError("REQUEST_CANCELLED");
    const key = `${authoritativePlayerId}\u0000${request.requestId}`;
    if (this.active.has(key)) throw new ProviderBrokerError("DUPLICATE_REQUEST");
    this.active.set(key, { provider, requestId: request.requestId });
    try {
      return await provider.attempt({ ...request, playerId: authoritativePlayerId as PlayerId });
    } finally {
      this.active.delete(key);
    }
  }

  async cancel(authoritativePlayerId: string, requestId: string): Promise<void> {
    const key = `${authoritativePlayerId}\u0000${requestId}`;
    const active = this.active.get(key);
    await active?.provider.cancel?.(requestId);
    this.active.delete(key);
  }

  async cancelAll(): Promise<void> {
    this.authorizationEpoch += 1;
    const active = [...this.active.entries()];
    this.active.clear();
    await Promise.allSettled(
      active.map(([, request]) => request.provider.cancel?.(request.requestId)),
    );
  }
}

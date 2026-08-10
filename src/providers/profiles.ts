import { identityHash } from "../domain/identity.js";
import type { EndpointFingerprint, ProfileId } from "../domain/types.js";
import type { ProviderProfileSnapshot } from "./types.js";

type Kind = "azure" | "openai" | "ollama";
export interface SaveProfileInput {
  profileId?: string;
  expectedRevision?: number;
  editingWindowId?: string;
  displayName: string;
  kind: Kind;
  endpoint: string;
  model?: string;
  region?: string;
  capability?: "strict-json-schema" | "json-object" | "prompt-json";
}

export interface WindowSelection {
  profileId: string;
  revision: number;
  endpointFingerprint: string;
  authorizedAt: number;
}

export function normalizeProviderEndpoint(kind: Kind, value: string): string {
  const trimmed = value.trim();
  const candidate =
    kind === "ollama" && /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/.*)?$/i.test(trimmed)
      ? `http://${trimmed}`
      : trimmed;
  const match = candidate.match(
    /^(https?):\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i,
  );
  if (!match || /#/.test(candidate)) throw new Error("INVALID_ENDPOINT");
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!;
  if (authority.includes("@") || /\s/.test(authority)) throw new Error("INVALID_ENDPOINT");
  const hostname = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]")).toLowerCase()
    : authority.split(":")[0]!.toLowerCase();
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(hostname);
  if (scheme !== "https" && !(kind === "ollama" && loopback)) throw new Error("INSECURE_ENDPOINT");
  let path = (match[3] ?? "").replace(/\/+$/, "");
  if (kind === "openai") path = path.replace(/\/chat\/completions$/i, "");
  return `${scheme}://${authority.toLowerCase()}${path}`;
}

export class ProviderProfiles {
  private readonly revisions = new Map<string, Map<number, ProviderProfileSnapshot>>();
  private readonly latest = new Map<string, number>();
  private readonly selections = new Map<string, WindowSelection>();
  private readonly leases = new Set<string>();
  private collisionSequence = 0;

  constructor(private readonly id: () => string) {}

  save(input: SaveProfileInput): ProviderProfileSnapshot {
    const generated = input.profileId ?? this.id();
    const profileId =
      input.profileId || !this.revisions.has(generated)
        ? generated
        : `${generated}-${++this.collisionSequence}`;
    const latestRevision = this.latest.get(profileId) ?? 0;
    if (input.profileId && input.expectedRevision !== latestRevision)
      throw new Error("STALE_PROFILE_REVISION");
    const endpoint = normalizeProviderEndpoint(input.kind, input.endpoint);
    if ((input.kind === "openai" || input.kind === "ollama") && !input.model?.trim())
      throw new Error("MODEL_REQUIRED");
    const revision = latestRevision + 1;
    const endpointFingerprint = identityHash({
      kind: input.kind,
      endpoint,
    }) as unknown as EndpointFingerprint;
    const snapshot: ProviderProfileSnapshot = {
      profileId: profileId as ProfileId,
      revision,
      displayName: input.displayName.trim() || `${input.kind} ${revision}`,
      kind: input.kind,
      endpoint,
      endpointFingerprint,
      ...(input.model?.trim() ? { model: input.model.trim() } : {}),
      ...(input.region?.trim() ? { region: input.region.trim() } : {}),
      ...(input.capability ? { capability: input.capability } : {}),
    };
    const profileRevisions = this.revisions.get(profileId) ?? new Map();
    profileRevisions.set(revision, snapshot);
    this.revisions.set(profileId, profileRevisions);
    this.latest.set(profileId, revision);
    if (input.editingWindowId) this.selections.delete(input.editingWindowId);
    return snapshot;
  }

  get(profileId: string, revision?: number): ProviderProfileSnapshot | null {
    const resolvedRevision = revision ?? this.latest.get(profileId);
    return resolvedRevision === undefined
      ? null
      : (this.revisions.get(profileId)?.get(resolvedRevision) ?? null);
  }

  listLatest(): ProviderProfileSnapshot[] {
    return [...this.latest].flatMap(([profileId, revision]) => {
      const profile = this.get(profileId, revision);
      return profile ? [profile] : [];
    });
  }

  select(
    windowId: string,
    profileId: string,
    revision: number,
    endpointFingerprint: string,
  ): WindowSelection {
    const profile = this.get(profileId, revision);
    if (!profile || profile.endpointFingerprint !== endpointFingerprint)
      throw new Error("SELECTION_MISMATCH");
    const selection = { profileId, revision, endpointFingerprint, authorizedAt: Date.now() };
    this.selections.set(windowId, selection);
    return selection;
  }

  selection(windowId: string): WindowSelection | null {
    return this.selections.get(windowId) ?? null;
  }

  lease(windowId: string, profileId: string, revision: number): void {
    if (!this.get(profileId, revision)) throw new Error("PROFILE_NOT_FOUND");
    this.leases.add(`${windowId}\u0000${profileId}\u0000${revision}`);
  }

  release(windowId: string, profileId: string, revision: number): void {
    this.leases.delete(`${windowId}\u0000${profileId}\u0000${revision}`);
  }

  clearAuthorizations(): string[] {
    const windowIds = new Set(this.selections.keys());
    for (const lease of this.leases) windowIds.add(lease.split("\u0000", 1)[0]!);
    this.selections.clear();
    this.leases.clear();
    return [...windowIds].sort();
  }
}

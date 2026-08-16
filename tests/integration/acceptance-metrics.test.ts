import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PlaybackSession } from "../../src/app/playback-session.js";
import { classifySubtitleSelection } from "../../src/adapters/iina/subtitle-source.js";
import { ProviderSimulator } from "../helpers/provider-server.js";

const simulators: ProviderSimulator[] = [];
afterEach(async () => Promise.all(simulators.splice(0).map((server) => server.close())));

describe("controlled provider acceptance runner", () => {
  it("keeps a legal opaque inventory of at least 30 acceptance samples", () => {
    const inventory = readFileSync(new URL("../fixtures/media/README.md", import.meta.url), "utf8");
    const identifiers = [...inventory.matchAll(/^\| ([A-Z]\d{3}) \|/gm)].map((match) => match[1]);
    expect(identifiers).toHaveLength(30);
    expect(new Set(identifiers).size).toBe(30);
    expect(inventory).toContain("不含受版权限制媒体");
    expect(inventory).toContain("大型与宿主样本不提交 Git");
  });

  it("classifies every synthetic selected track with 100% exact identity", () => {
    const cases = Array.from({ length: 30 }, (_, index) => {
      const external = index >= 26;
      const unsupported = index >= 20 && index < 23;
      const codec = unsupported
        ? ["hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle"][index - 20]
        : ["subrip", "ass", "ssa", "mov_text"][index % 4];
      return {
        expected: external ? "external" : unsupported ? "unsupported" : "embedded",
        snapshot: {
          playerId: `player-${index}`,
          mediaEpoch: 1,
          mediaUrl: `/private/synthetic-${index}.mkv`,
          isNetworkResource: false,
          selectedTrackId: index + 1,
          tracks: [
            {
              type: "sub",
              id: index + 1,
              selected: true,
              "main-selection": 0,
              external,
              codec,
              "ff-index": index,
              "src-id": index + 100,
            },
          ],
        },
      };
    });
    const matches = cases.filter(
      ({ expected, snapshot }) => classifySubtitleSelection(snapshot).kind === expected,
    );
    expect(matches).toHaveLength(cases.length);
  });

  it("rejects stale results across 20 iterations of every lifecycle boundary", () => {
    const boundaries: Array<(session: PlaybackSession) => void> = [
      (session) => session.onTrackChanged(),
      (session) => session.onFileChanged(),
      (session) => session.onFileChanged(),
      (session) => session.setEnabled(false),
      (session) => session.close(),
      (session) => session.onSeek(30_000),
    ];
    let staleAccepted = 0;
    for (const boundary of boundaries) {
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const session = new PlaybackSession(`player-${iteration}`, `session-${iteration}`);
        const fingerprint = session.fingerprint();
        boundary(session);
        if (session.accepts(fingerprint)) staleAccepted += 1;
      }
    }
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const left = new PlaybackSession(`left-${iteration}`, `session-${iteration}`);
      const right = new PlaybackSession(`right-${iteration}`, `session-${iteration}`);
      if (right.accepts(left.fingerprint())) staleAccepted += 1;
    }
    expect(staleAccepted).toBe(0);
  });

  it("emits temporary failure, Retry-After, malformed and successful responses deterministically", async () => {
    const simulator = new ProviderSimulator();
    simulators.push(simulator);
    simulator.enqueue({
      status: 503,
      headers: { "Retry-After": "3", "X-Request-ID": "req-1" },
      body: { error: "temporary" },
    });
    simulator.enqueue({ status: 200, body: "not-json" });
    simulator.enqueue({
      status: 200,
      delayMs: 10,
      body: { translations: [{ id: "c1", text: "ok" }] },
    });
    await simulator.start();

    const first = await fetch(`${simulator.url}/translate`, {
      method: "POST",
      body: '{"items":[]}',
    });
    expect(first.status).toBe(503);
    expect(first.headers.get("retry-after")).toBe("3");
    const malformed = await fetch(`${simulator.url}/translate`, { method: "POST", body: "{}" });
    await expect(malformed.json()).rejects.toThrow();
    const success = await fetch(`${simulator.url}/translate`, { method: "POST", body: "{}" });
    await expect(success.json()).resolves.toEqual({ translations: [{ id: "c1", text: "ok" }] });
    expect(simulator.calls).toHaveLength(3);
  });
});

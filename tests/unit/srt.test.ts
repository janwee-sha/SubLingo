import { describe, expect, it } from "vitest";
import { parseSrt, renderSrt } from "../../src/subtitles/srt.js";

describe("SRT", () => {
  it("parses BOM, CRLF, multiline cues, overlap and exact milliseconds", () => {
    const parsed = parseSrt(
      "\ufeff2\r\n00:00:03,000 --> 00:00:05,001\r\nSecond\r\n\r\n1\r\n00:00:01.250 --> 00:00:03.500\r\nHello\r\nworld\r\n",
    );
    expect(parsed.warnings).toEqual([]);
    expect(parsed.cues.map((cue) => [cue.startMs, cue.endMs, cue.sourceText])).toEqual([
      [1_250, 3_500, "Hello\nworld"],
      [3_000, 5_001, "Second"],
    ]);
  });

  it("skips malformed entries without losing valid cues", () => {
    const parsed = parseSrt(
      "1\ninvalid --> 00:00:01,000\nbad\n\n2\n00:00:02,000 --> 00:00:03,000\ngood\n",
    );
    expect(parsed.cues).toHaveLength(1);
    expect(parsed.cues[0]?.sourceText).toBe("good");
    expect(parsed.warnings).toContain("srt:malformed-timing:1");
  });

  it("renders deterministic UTF-8 SRT with escaped translated text and original ordering", () => {
    const cues = parseSrt(
      "1\n00:00:01,005 --> 00:00:02,090\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB\n",
    ).cues;
    const rendered = renderSrt(cues, new Map([[cues[1]!.id, "<译文> & ok"]]));
    expect(rendered).toBe("1\n00:00:02,000 --> 00:00:03,000\n&lt;译文&gt; &amp; ok\n");
    expect(new TextDecoder().decode(new TextEncoder().encode(rendered))).toBe(rendered);
  });
});

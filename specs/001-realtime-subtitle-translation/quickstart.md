# Quickstart Validation Guide

## Prerequisites

- macOS 11 or later
- IINA 1.4.0 or later; final integration also run on IINA 1.4.3
- Node.js 24 and npm
- `iina-plugin` CLI supplied by IINA
- At least one external SRT/ASS sample and credentials/model for the provider being exercised

## Automated validation

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Expected: parser, scheduler, cache-key, response mapping, provider contract and lifecycle tests pass; `dist/main.js` and sidebar assets are produced.

## Load into IINA

```sh
iina-plugin link .
```

Restart IINA, open a video with an external SRT/ASS, open the SubLingo sidebar, set source/target languages and configure one provider. Run the connection test before enabling translation.

## End-to-end scenarios

1. Play a non-native external SRT and verify the original primary subtitle remains while translated SRT appears as the second track.
2. Repeat with ASS containing commas, override tags and `\\N`; verify timing/order and readable text.
3. Play a native-language subtitle and confirm the provider sees zero calls.
4. Watch only the first 10 minutes of a long file; confirm no request exceeds the 120-second/40-cue window and each batch stays within 25 cues/5,000 characters.
5. Seek backward and verify cached cues cause no repeated successful translation calls; seek far forward and verify late old-window results do not update the second subtitle.
6. Disable while a delayed request is running; verify video and primary subtitle continue and the generated track is removed.
7. Verify Azure, OpenAI-compatible and Ollama connection probes, invalid credentials/model handling, timeout/429/5xx behavior and redacted logs.
8. Pack the verified plugin:

```sh
iina-plugin pack .
```

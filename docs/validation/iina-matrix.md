# IINA manual validation matrix — 2026-08-10

## Environment and safety state

- Installed IINA version: 1.4.4 at `/Applications/IINA.app`.
- IINA 1.4.0 was not installed, so that compatibility row could not be executed locally.
- The user supplied temporary OpenAI-compatible and Ollama test configuration under the ignored `providers/` directory. Both production provider adapters completed a live probe and translation without logging secrets; this does not by itself prove the IINA UI/playback path.
- Azure Translator is intentionally unavailable in this release because its setup and credentials were not manually validated.
- The current workspace is linked by IINA's official CLI as `SubLingo.iinaplugin-dev`. The duplicate 05:51 installed copy was moved, not deleted, to `/private/tmp/io.sublingo.iina.iinaplugin.pre-convergence-20260810-1239`.

## Evidence from IINA 1.4.4

1. The official `iina-plugin link` command created the development link successfully.
2. IINA discovered the plugin after its required `subtitle` and `preferences` permissions were declared and the development plugin was enabled. The Plugins menu exposed both `SubLingo` and `SubLingo (Global)` developer contexts, and the player plugin panel displayed a SubLingo tab.
3. The first production bundle was rejected at runtime because Parcel had emitted CommonJS `require(...)` and `module.exports` references. The build now embeds dependencies and package verification rejects this regression.
4. An early embedded build entered a crash/reopen loop. The 2026-08-10 01:52:14 report recorded `EXC_BREAKPOINT / SIGTRAP` in `JavascriptAPIGlobalController.postMessage`; global→player replies now cross a zero-delay timer boundary.
5. A later reload exposed a second native trap at 02:50:46 in `JavascriptAPISidebarView.postMessage`: a 350 ms background timer posted after IINA had destroyed the sidebar. Main now updates an in-memory state snapshot, the live WebView polls for it, and the player timer is cleared on window close. `tests/contract/sidebar-lifecycle.test.ts` prevents the background-post regression.
6. The normal player now initializes its sidebar immediately instead of waiting for an unnecessary global player-ID round trip. Global callbacks still use IINA's real player identifier for replies and per-window provider leases.
7. The final installed build was reloaded without closing the player, then the player window was closed and reopened once. The SubLingo WebView remained attached while polling, and no additional IINA crash report or reopen loop appeared.
8. In the actual IINA sidebar, OpenAI-compatible and Ollama were the only service choices. Switching changed endpoint defaults and hints, preserved a required Model ID field for both services, hid the API key for Ollama, and restored it for OpenAI-compatible. CSS cards, labels, and controls rendered aligned at the narrow sidebar width.
9. A real 1,438-cue external SRT was selected as primary track `#4` and translated through the saved local Ollama `translategemma:12b` profile. The session cache advanced continuously beyond 73 cues while playback continued.
10. Runtime inspection during continuous updates reported primary `id=4`, generated `secondID=16`, and exactly one owned `sublingo-…-12.srt` track. A later IINA subtitle menu showed the rotated generated track `#18`; mpv logged successful string property writes (`sid="4" -> 1`, `secondary-sid="19" -> 1`) and removal of only the previous generated track.
11. The convergence build loaded from the workspace link and displayed the new API-root-or-full-URL hint. A previously saved full `/v1/chat/completions` profile was shown as canonical `/v1`, confirming metadata normalization in the real sidebar.
12. Before the subtitle-resynchronization fix, a manual run reproduced a loaded external subtitle remaining at `Select a readable external SRT or ASS subtitle`. After the code began listening to `mpv.track-list.changed`, removed the over-broad generated-track guard, retried delayed IINA track exposure, and added a safe UTF-8 text-read fallback, the user reloaded an external subtitle in IINA and confirmed that Session displayed its cue count.

## Quickstart matrix

| IINA  | Scenario                                                        | Status         | Evidence / remaining requirement                                                                                                                                              |
| ----- | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.4 | Discovery, declared permissions, installed package              | PASS           | Plugin, global/main developer contexts, installed package, sidebar tab, and permission manifest were discovered.                                                              |
| 1.4.4 | Sidebar renders and remains keyboard-accessible at narrow width | PASS           | Actual WebView exposed labelled controls through accessibility APIs; visual inspection confirmed aligned narrow-width cards/fields.                                           |
| 1.4.4 | External SRT selection and generated second track               | PASS           | Earlier build generated the secondary track from a real 1,438-cue SRT; after the convergence resync fix, the user confirmed Session displays the external subtitle cue count. |
| 1.4.4 | UTF-16 SRT and ASS selection                                    | NOT RUN        | Parser/decoder/track integration tests pass; remaining real IINA format rows are deferred.                                                                                    |
| 1.4.4 | OpenAI-compatible adapter                                       | PASS (ADAPTER) | Production adapter passed authorized live probe+translation; successful connection and subtitle playback inside IINA remain pending manual re-test.                           |
| 1.4.4 | Ollama                                                          | RECHECK        | Production adapter passed live probe+translation and an earlier build passed full IINA playback; current convergence build awaits manual re-test.                             |
| 1.4.4 | Azure Translator                                                | NOT APPLICABLE | Temporarily unsupported by product decision; it is absent from the UI and rejected by profile creation.                                                                       |
| 1.4.4 | Vault write, restart, tamper lockout, confirmed reset           | NOT RUN        | Vault/security/native-confirmation tests pass; real IINA confirmation, Keychain and `@data` lifecycle remain for user testing.                                                |
| 1.4.4 | Reload and close/reopen lifecycle                               | PASS           | Final build survived plugin reload and player close/reopen with the polling WebView attached and no new crash report.                                                         |
| 1.4.4 | Retry-After, seek, and two windows                              | NOT RUN        | Automated acceptance/performance suites pass; full live IINA matrix remains.                                                                                                  |
| 1.4.0 | All quickstart scenarios                                        | NOT RUN        | IINA 1.4.0 is not installed on this machine.                                                                                                                                  |

T078 remains open in `tasks.md` until the archive is exercised on IINA 1.4.0 and the remaining SRT/ASS, profile/vault, Retry-After, seek, and multi-window rows are completed.

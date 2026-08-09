# IINA manual validation matrix — 2026-08-10

## Environment and safety state

- Installed IINA version: 1.4.4 at `/Applications/IINA.app`.
- IINA 1.4.0 was not installed, so that compatibility row could not be executed locally.
- The user supplied temporary OpenAI-compatible and Ollama test configuration under the ignored `providers/` directory. Both production provider adapters completed a live probe and translation without logging secrets.
- Azure Translator is intentionally unavailable in this release because its setup and credentials were not manually validated.
- The verified package is installed at `~/Library/Application Support/com.colliderli.iina/plugins/io.sublingo.iina.iinaplugin`. A recoverable copy of the prior installation is stored at `/private/tmp/io.sublingo.iina.iinaplugin.backup-20260810-0250`.

## Evidence from IINA 1.4.4

1. The official `iina-plugin link` command created the development link successfully.
2. IINA discovered the plugin after its required `subtitle` and `preferences` permissions were declared and the development plugin was enabled. The Plugins menu exposed both `SubLingo` and `SubLingo (Global)` developer contexts, and the player plugin panel displayed a SubLingo tab.
3. The first production bundle was rejected at runtime because Parcel had emitted CommonJS `require(...)` and `module.exports` references. The build now embeds dependencies and package verification rejects this regression.
4. An early embedded build entered a crash/reopen loop. The 2026-08-10 01:52:14 report recorded `EXC_BREAKPOINT / SIGTRAP` in `JavascriptAPIGlobalController.postMessage`; global→player replies now cross a zero-delay timer boundary.
5. A later reload exposed a second native trap at 02:50:46 in `JavascriptAPISidebarView.postMessage`: a 350 ms background timer posted after IINA had destroyed the sidebar. Main now updates an in-memory state snapshot, the live WebView polls for it, and the player timer is cleared on window close. `tests/contract/sidebar-lifecycle.test.ts` prevents the background-post regression.
6. The normal player now initializes its sidebar immediately instead of waiting for an unnecessary global player-ID round trip. Global callbacks still use IINA's real player identifier for replies and per-window provider leases.
7. The final installed build was reloaded without closing the player, then the player window was closed and reopened once. The SubLingo WebView remained attached while polling, and no additional IINA crash report or reopen loop appeared.
8. In the actual IINA sidebar, OpenAI-compatible and Ollama were the only service choices. Switching changed endpoint defaults and hints, preserved a required Model ID field for both services, hid the API key for Ollama, and restored it for OpenAI-compatible. CSS cards, labels, and controls rendered aligned at the narrow sidebar width.

## Quickstart matrix

| IINA  | Scenario                                                        | Status         | Evidence / remaining requirement                                                                                                     |
| ----- | --------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.4.4 | Discovery, declared permissions, installed package              | PASS           | Plugin, global/main developer contexts, installed package, sidebar tab, and permission manifest were discovered.                     |
| 1.4.4 | Sidebar renders and remains keyboard-accessible at narrow width | PASS           | Actual WebView exposed labelled controls through accessibility APIs; visual inspection confirmed aligned narrow-width cards/fields.  |
| 1.4.4 | External UTF-8/UTF-16 SRT and ASS selection                     | NOT RUN        | Parser/decoder/track integration tests pass; real IINA media test remains.                                                           |
| 1.4.4 | OpenAI-compatible and Ollama                                    | PARTIAL PASS   | IINA service switching/model fields passed; both production adapters passed live probe+translation. Profile save/vault path remains. |
| 1.4.4 | Azure Translator                                                | NOT APPLICABLE | Temporarily unsupported by product decision; it is absent from the UI and rejected by profile creation.                              |
| 1.4.4 | Vault write, restart, tamper lockout, confirmed reset           | NOT RUN        | Vault/security tests pass; real Keychain and `@data` lifecycle remains.                                                              |
| 1.4.4 | Reload and close/reopen lifecycle                               | PASS           | Final build survived plugin reload and player close/reopen with the polling WebView attached and no new crash report.                |
| 1.4.4 | Retry-After, seek, and two windows                              | NOT RUN        | Automated acceptance/performance suites pass; full live IINA matrix remains.                                                         |
| 1.4.0 | All quickstart scenarios                                        | NOT RUN        | IINA 1.4.0 is not installed on this machine.                                                                                         |

T078 remains open in `tasks.md` until the archive is exercised on IINA 1.4.0 and the remaining SRT/ASS, profile/vault, Retry-After, seek, and multi-window rows are completed.

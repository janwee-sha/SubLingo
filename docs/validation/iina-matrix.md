# IINA Manual Validation Matrix

## Completed reference evidence

The latest completed IINA 1.4.4 acceptance used a formal installation rather than a development link.

| Scenario                             | Result | Evidence                                                                                                              |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Formal install and uninstall action  | PASS   | Installed entry was a normal directory and exposed an enabled Uninstall action.                                       |
| Sidebar rendering and accessibility  | PASS   | Labelled controls and narrow-width layout were usable.                                                                |
| External SRT with OpenAI-compatible  | PASS   | Test and six-cue playback reached cache 6/6 and generated a synchronized second track.                                |
| External SRT with Ollama             | PASS   | Test and six-cue playback reached cache 6/6 and generated a synchronized second track.                                |
| Profile edit and delete cancellation | PASS   | Update retained one Profile row and the native deletion cancellation preserved state.                                 |
| Close/reopen lifecycle               | PASS   | Reopening in the same player created a new session and generated track.                                               |
| Idle helper recovery                 | PASS   | After more than 300 seconds idle, the next authenticated Test started one replacement helper without restarting IINA. |

Completed evidence is a reference for behavior already observed. The current archive hash is recorded in [package.md](./package.md); the rows below remain open and must be executed against the current formal package.

## Outstanding validation

| Task | Environment | Scenario                                                                               | Status  |
| ---- | ----------- | -------------------------------------------------------------------------------------- | ------- |
| T001 | IINA 1.4.4  | Current package with UTF-16 SRT and ASS using both supported providers                 | NOT RUN |
| T002 | IINA 1.4.4  | Two-window play, seek, fail, disable and close isolation                               | NOT RUN |
| T003 | IINA 1.4.4  | Live Retry-After and seek/backoff cancellation                                         | NOT RUN |
| T004 | IINA 1.4.4  | Confirmed destructive Profile deletion, credential removal and unaffected-window check | NOT RUN |
| T005 | IINA 1.4.0  | Complete current formal-package quickstart matrix                                      | NOT RUN |

Automated coverage does not complete these host rows. Update this file only with observed evidence from the named environment.

# Automated Validation — 2026-08-11

Environment: macOS arm64, Node.js 24/npm 11, Swift 6.

| Check                | Result | Current evidence                                                                                                      |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| TypeScript tests     | PASS   | 30 files and 129 tests passed; 2 authorized live-provider tests skipped by default.                                   |
| Type checking        | PASS   | Plugin and WebView projects completed without diagnostics.                                                            |
| ESLint               | PASS   | `src`, `ui`, `tests` and Vitest configuration completed without diagnostics.                                          |
| Formatting           | PASS   | Prettier reported all matched files formatted.                                                                        |
| Native contracts     | PASS   | Transport, credential file, health, cancellation and direct/system route contracts passed.                            |
| Universal helper     | PASS   | 775,184-byte executable with arm64 and x86_64 slices and a valid signature.                                           |
| Plugin bundle        | PASS   | Main 113,581 bytes; Global 133,935 bytes; Sidebar HTML 5,213 bytes.                                                   |
| Package verification | PASS   | Required files, executable mode, architectures, secret scan and runtime-path exclusions passed.                       |
| Release archive      | PASS   | `SubLingo-0.1.0.iinaplgz`, 300,588 bytes, SHA-256 `2da87446cbc2411337bc566b973c876afa265744718c864bde786fad466dd908`. |

Commands executed:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run test:native
npm run build:native
npm run build
npm run verify:package
npm run pack
```

The first sandboxed test/native/build attempts could not use loopback or compiler/build caches. The same commands passed with the required local permissions; these were environment restrictions, not product failures.

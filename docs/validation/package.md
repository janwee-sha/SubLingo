# Release package — 2026-08-10

- Artifact: `build/package/SubLingo-0.1.0.iinaplgz`
- Size: 261,698 bytes
- SHA-256: `89b11ce5ebda0eca85f5f81fbe9cc5a4cfb55169c7aca4a8016b712d6b61396f`
- Created with: `/Applications/IINA.app/Contents/MacOS/iina-plugin pack SubLingo`

## Inspected contents

The archive contains 12 entries and only release material:

```text
dist/
dist/ui/
dist/ui/sidebar.13bb4cde.js
dist/ui/sidebar.ffb58ba9.css
dist/ui/sidebar.534cbaed.js
dist/ui/sidebar.html
dist/native/
dist/native/sublingo-transport
dist/global.js
dist/main.js
README.md
Info.json
```

There are no source trees, tests, specifications, dependency trees, build caches, native intermediate objects, runtime `@data`/`@tmp` state, vault files, environment files, or key material.

The embedded manifest presents five permissions: loopback `network-request`, plugin-scoped `file-system`, destructive-reset `show-alert`, selected-track `subtitle`, and non-secret `preferences`. Its descriptions disclose that the helper contacts the user-selected translation service, the plugin reads the selected external subtitle, credentials are kept in the encrypted vault, only the plugin-owned secondary track is managed, and only non-secret settings are stored as preferences. `allowedDomains` is restricted to `127.0.0.1` because remote requests are made by the bundled native helper.

The helper is a 568,144-byte universal Mach-O containing x86_64 and arm64 slices, mode `-rwxr-xr-x`, with a valid ad-hoc signature. `scripts/verify-package.sh` passed against the exact staging tree used for this archive.

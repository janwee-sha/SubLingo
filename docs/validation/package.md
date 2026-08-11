# Release package — 2026-08-11

- Artifact: `build/package/SubLingo-0.1.2.iinaplgz`
- Size: 301,021 bytes
- SHA-256: `c32af406c243d28ff1fdd2e4b65df5b624e25af1bc3a2dbbe67bf455ead7d409`
- Created with: `/Applications/IINA.app/Contents/MacOS/iina-plugin pack SubLingo`

## Inspected contents

The archive contains 12 entries and only release material:

```text
dist/
dist/ui/
dist/ui/sidebar.162e7c73.js
dist/ui/sidebar.a9aa70e1.js
dist/ui/sidebar.html
dist/ui/sidebar.96d056b2.css
dist/native/
dist/native/sublingo-transport
dist/global.js
dist/main.js
README.md
Info.json
```

There are no source trees, tests, specifications, dependency trees, build caches, native intermediate objects, runtime `@data`/`@tmp` state, `credentials.json`, legacy vault files, environment files or key material.

The manifest declares loopback `network-request`, plugin-scoped `file-system`, and Profile-deletion confirmation through `show-alert`. Its descriptions disclose that the helper contacts only the user-selected translation service, the plugin reads the selected external subtitle, and optional provider keys use a plugin-private local file. `allowedDomains` is restricted to `127.0.0.1` because remote requests are made by the bundled native helper.

The helper is a 775,184-byte universal Mach-O containing x86_64 and arm64 slices, mode `-rwxr-xr-x`, with a valid ad-hoc signature. It links `/usr/lib/libcurl.4.dylib` for explicit no-proxy direct transport. No Keychain API symbol or Keychain bridge is packaged; Security.framework remains linked for `SecRandomCopyBytes` only. `scripts/verify-package.sh` passed against the exact staging tree used for this archive.

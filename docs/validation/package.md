# Release package — 2026-08-11

- Artifact: `build/package/SubLingo-0.1.0.iinaplgz`
- Size: 301,242 bytes
- SHA-256: `e7ec7d6e2f9a8a323ee57af75b7d908e584f2858512e1acaf06201c0bbd26ccc`
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

## Historical installed-package verification (0.1.4)

The user installed the previous 0.1.4 acceptance archive through IINA's normal package flow. IINA reported SubLingo 0.1.4, the installed package path was a normal directory rather than a development symlink, and the Uninstall button was enabled. Installed SHA-256 values matched that staged build:

- `dist/main.js`: `707d8cdf05ad3fbd04a5b5023f89c386be77389f9a9d6124c7c67b7885b19e37`
- `dist/global.js`: `169359df768f347a7b92d8ef74403b2f301304062af585fb6ad493b674db5c1c`
- `dist/native/sublingo-transport`: `11cdb440292d3b928fe903245a74cdd11127a47501ee1aa3fd6faebc4a6d3186`

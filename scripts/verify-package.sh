#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGE_DIR=${1:-$PROJECT_DIR}
HELPER="$PACKAGE_DIR/dist/native/sublingo-transport"

for required in "$PACKAGE_DIR/Info.json" "$PACKAGE_DIR/README.md" "$PACKAGE_DIR/LICENSE" "$PACKAGE_DIR/THIRD_PARTY_NOTICES.txt" "$PACKAGE_DIR/dist/main.js" "$PACKAGE_DIR/dist/global.js" "$PACKAGE_DIR/dist/ui/sidebar.html" "$HELPER"; do
  if [ ! -f "$required" ]; then
    echo "Missing packaged file: $required" >&2
    exit 1
  fi
done

for compliance_file in LICENSE THIRD_PARTY_NOTICES.txt; do
  if ! cmp -s "$PROJECT_DIR/$compliance_file" "$PACKAGE_DIR/$compliance_file"; then
    echo "Packaged compliance file differs from repository source: $compliance_file" >&2
    exit 1
  fi
done

if [ ! -x "$HELPER" ]; then
  echo "Native helper is not executable" >&2
  exit 1
fi
lipo "$HELPER" -verify_arch arm64 x86_64
codesign --verify --strict "$HELPER"

if LC_ALL=C grep -E -n 'require\(|module\.exports' "$PACKAGE_DIR/dist/main.js" "$PACKAGE_DIR/dist/global.js"; then
  echo "IINA entry bundle contains an unsupported CommonJS runtime reference" >&2
  exit 1
fi
if LC_ALL=C grep -E -n '(href|src)="/' "$PACKAGE_DIR/dist/ui/sidebar.html"; then
  echo "Sidebar contains a root-absolute asset URL that IINA cannot resolve" >&2
  exit 1
fi
if LC_ALL=C grep -E -n '<script[^>]+type="module"' "$PACKAGE_DIR/dist/ui/sidebar.html"; then
  echo "Sidebar contains an unsupported local module script" >&2
  exit 1
fi

if find "$PACKAGE_DIR/dist" -type f \( -name 'credentials.json' -o -name '.env*' -o -name '*.pem' -o -name '*.key' \) | grep -q .; then
  echo "Forbidden secret/runtime file found in dist" >&2
  exit 1
fi
if find "$PACKAGE_DIR" -maxdepth 1 -type d \( -name '@data' -o -name '@tmp' \) | grep -q .; then
  echo "Forbidden plugin runtime directory found at package root" >&2
  exit 1
fi
if LC_ALL=C grep -ER -n 'sk-[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' "$PACKAGE_DIR/dist" "$PACKAGE_DIR/Info.json"; then
  echo "Secret-like material found in package" >&2
  exit 1
fi

case "$(stat -f '%Sp' "$HELPER")" in
  *x*) ;;
  *) echo "Native helper lost executable permission" >&2; exit 1 ;;
esac

echo "Package verification passed"

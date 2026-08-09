#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGE_DIR="$ROOT_DIR/native/transport"
OUTPUT_DIR="$ROOT_DIR/dist/native"
ARM_BUILD="$PACKAGE_DIR/.build/arm64-apple-macosx/release/sublingo-transport"
INTEL_BUILD="$PACKAGE_DIR/.build/x86_64-apple-macosx/release/sublingo-transport"

mkdir -p "$OUTPUT_DIR"
export MACOSX_DEPLOYMENT_TARGET=12.0
swift build --package-path "$PACKAGE_DIR" -c release --arch arm64
swift build --package-path "$PACKAGE_DIR" -c release --arch x86_64
lipo -create "$ARM_BUILD" "$INTEL_BUILD" -output "$OUTPUT_DIR/sublingo-transport"
chmod 755 "$OUTPUT_DIR/sublingo-transport"
codesign --force --sign - "$OUTPUT_DIR/sublingo-transport"
lipo "$OUTPUT_DIR/sublingo-transport" -verify_arch arm64 x86_64
codesign --verify --strict "$OUTPUT_DIR/sublingo-transport"

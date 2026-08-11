#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGE_DIR="$ROOT_DIR/native/transport"
SOURCE_DIR="$ROOT_DIR/native/transport/Sources/SubLingoTransport"
TEST_DIR="$ROOT_DIR/native/transport/Tests"
BUILD_DIR="$ROOT_DIR/native/transport/.build/contract-tests"

mkdir -p "$BUILD_DIR"
swiftc -parse-as-library \
  -I "$PACKAGE_DIR/Sources/CCurl" \
  -lcurl \
  "$SOURCE_DIR/Protocol.swift" \
  "$SOURCE_DIR/SecureCredentialStore.swift" \
  "$SOURCE_DIR/HTTPClient.swift" \
  "$SOURCE_DIR/DirectCurlTransport.swift" \
  "$SOURCE_DIR/Server.swift" \
  "$TEST_DIR/SubLingoTransportTests/ServerTests.swift" \
  "$TEST_DIR/SubLingoTransportTests/HTTPClientTests.swift" \
  "$TEST_DIR/SubLingoTransportContractTests/TestMain.swift" \
  -o "$BUILD_DIR/sublingo-transport-contract-tests"
"$BUILD_DIR/sublingo-transport-contract-tests"

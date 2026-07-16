#!/bin/sh
set -eu

REPOSITORY="PANGKAIFENG/ai-collaboration-insights"
INSTALL_DIR="${ACI_INSTALL_DIR:-$HOME/.local/bin}"
SOURCE_DIR="${ACI_INSTALL_SOURCE_DIR:-}"
VERSION="${ACI_VERSION:-v0.2.1}"

case "$(uname -m)" in
  arm64|aarch64) ARCH="aarch64" ;;
  x86_64|amd64) ARCH="x86_64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
ASSET="aci-${ARCH}-apple-darwin"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aci-install.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

if [ -n "$SOURCE_DIR" ]; then
  cp "$SOURCE_DIR/$ASSET" "$TMP_DIR/$ASSET"
  cp "$SOURCE_DIR/checksums.txt" "$TMP_DIR/checksums.txt"
else
  BASE_URL="https://github.com/$REPOSITORY/releases/download/$VERSION"
  curl -fsSL "$BASE_URL/$ASSET" -o "$TMP_DIR/$ASSET"
  curl -fsSL "$BASE_URL/checksums.txt" -o "$TMP_DIR/checksums.txt"
fi

EXPECTED="$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$TMP_DIR/checksums.txt")"
test -n "$EXPECTED" || { echo "Checksum not found for $ASSET" >&2; exit 1; }
ACTUAL="$(shasum -a 256 "$TMP_DIR/$ASSET" | awk '{ print $1 }')"
test "$EXPECTED" = "$ACTUAL" || { echo "Checksum verification failed" >&2; exit 1; }

mkdir -p "$INSTALL_DIR"
chmod 755 "$TMP_DIR/$ASSET"
mv "$TMP_DIR/$ASSET" "$INSTALL_DIR/.aci.new"
mv "$INSTALL_DIR/.aci.new" "$INSTALL_DIR/aci"

if [ "${ACI_SKIP_SCHEDULE:-0}" != "1" ]; then
  "$INSTALL_DIR/aci" schedule install
fi
echo "Installed aci $($INSTALL_DIR/aci version) to $INSTALL_DIR/aci"

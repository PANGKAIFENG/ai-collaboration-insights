#!/bin/sh
set -eu

INSTALL_DIR="${ACI_INSTALL_DIR:-$HOME/.local/bin}"
BINARY="$INSTALL_DIR/aci"
PURGE=0
if [ "${1:-}" = "--purge-data" ]; then
  PURGE=1
elif [ "$#" -gt 0 ]; then
  echo "Usage: uninstall.sh [--purge-data]" >&2
  exit 2
fi

if [ -x "$BINARY" ]; then
  "$BINARY" schedule remove || true
  if [ "$PURGE" -eq 1 ]; then
    "$BINARY" data purge
  fi
fi
rm -f "$BINARY"
if [ "$PURGE" -eq 1 ]; then
  echo "Uninstalled aci and purged application data"
else
  echo "Uninstalled aci; reports were preserved"
fi

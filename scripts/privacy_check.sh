#!/bin/sh
set -eu

TMP_LIST="$(mktemp "${TMPDIR:-/tmp}/aci-privacy.XXXXXX")"
trap 'rm -f "$TMP_LIST"' EXIT HUP INT TERM

if [ "$#" -eq 0 ]; then
  git ls-files > "$TMP_LIST"
else
  for root in "$@"; do
    if [ -d "$root" ]; then
      find "$root" -type f -print >> "$TMP_LIST"
    elif [ -f "$root" ]; then
      printf '%s\n' "$root" >> "$TMP_LIST"
    fi
  done
fi

failures=0
report() {
  printf 'privacy violation: %s [%s]\n' "$2" "$1"
  failures=$((failures + 1))
}

while IFS= read -r file; do
  [ -f "$file" ] || continue
  case "$file" in
    *.sqlite|*.sqlite3|*.db) report "database-artifact" "$file" ;;
  esac
  case "$file" in
    */reports/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/report.json|\
    */reports/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/index.html)
      report "generated-personal-report" "$file"
      ;;
  esac

  if rg -o '/Users/[A-Za-z0-9._-]+' "$file" |
    rg -q -v '^/Users/(synthetic|example|test)$'; then
    report "private-absolute-path" "$file"
  fi
  if rg -q '(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' "$file"; then
    report "secret-pattern" "$file"
  fi
  case "$file" in
    tests/fixtures/codex/*.jsonl) ;;
    *.jsonl)
      if rg -q '"type"[[:space:]]*:[[:space:]]*"session_meta"' "$file"; then
        report "codex-session-metadata" "$file"
      fi
      ;;
  esac
done < "$TMP_LIST"

if [ "$failures" -ne 0 ]; then
  printf 'privacy check failed: %s violation(s)\n' "$failures"
  exit 1
fi
echo "privacy check passed"

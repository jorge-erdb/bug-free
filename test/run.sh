#!/usr/bin/env bash
# Runs every headless check. No dependencies — plain node against the source modules.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

failed=0
for suite in looptest verify reachability playtest savetest; do
  echo "═══ $suite"
  if node "$suite.mjs"; then :; else failed=1; fi
  echo
done

if [[ $failed -eq 0 ]]; then echo "ALL SUITES PASSED"; else echo "SOME SUITES FAILED" >&2; fi
exit $failed

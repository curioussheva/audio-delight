#!/data/data/com.termux/files/usr/bin/bash
# =====================================================
# scripts/check.sh
# Quick clangd sanity check across all (or given) .cpp files.
# Filters out tweak-noise, shows only real compiler errors.
#
# Usage:
#   scripts/check.sh                # check everything under cpp/ (excl. oboe/)
#   scripts/check.sh core/AudioEngine.cpp core/AudioCallback.cpp
# =====================================================

set -e

# Resolve cpp/ dir relative to this script's location (scripts/ -> ../android/.../cpp)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CPP_DIR="$SCRIPT_DIR/../android/app/src/main/cpp"

cd "$CPP_DIR"

if [ "$#" -gt 0 ]; then
    FILES="$@"
else
    FILES=$(find . -name "*.cpp" -not -path "./oboe/*")
fi

FOUND_ERROR=0

for f in $FILES; do
    out=$(clangd --check="$f" 2>&1 | grep -E "^E\[" | grep -v "IncludeCleaner" | grep -v "    tweak:" || true)
    if [ -n "$out" ]; then
        echo "=== $f ==="
        echo "$out"
        echo ""
        FOUND_ERROR=1
    fi
done

if [ "$FOUND_ERROR" -eq 0 ]; then
    echo "✅ No real errors found."
else
    echo "❌ Errors found above — fix before committing."
fi

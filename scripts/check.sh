#!/data/data/com.termux/files/usr/bin/bash
# =====================================================
# scripts/check.sh
# Quick clangd sanity check across .cpp files.
#
# Usage:
#   bash scripts/check.sh                                # semua file
#   bash scripts/check.sh core/AudioEngine.cpp           # 1 file
#   bash scripts/check.sh core/AudioEngine.cpp core/AudioCallback.cpp
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CPP_DIR="$SCRIPT_DIR/../android/app/src/main/cpp"
COMPILE_CMDS="$CPP_DIR/compile_commands.json"

# ---- Cek prasyarat ----
if ! command -v clangd &> /dev/null; then
    echo "❌ clangd tidak terinstall."
    echo "   Install: pkg install clangd"
    echo "   Atau:    pkg install clang-tools"
    exit 1
fi

if [ ! -f "$COMPILE_CMDS" ]; then
    echo "❌ compile_commands.json tidak ada di:"
    echo "   $COMPILE_CMDS"
    echo ""
    echo "   Generate dulu:"
    echo "   python3 scripts/generate_compile_commands.py"
    exit 1
fi

# Cek freshness — warning kalau compile_commands lebih lama dari CMakeLists
CMAKE_FILES=$(find "$CPP_DIR" -name "CMakeLists.txt" -newer "$COMPILE_CMDS" 2>/dev/null)
if [ -n "$CMAKE_FILES" ]; then
    echo "⚠️  Warning: CMakeLists.txt lebih baru dari compile_commands.json"
    echo "   Regenerate: python3 scripts/generate_compile_commands.py"
    echo ""
fi

cd "$CPP_DIR"

# ---- Kumpulkan file ----
if [ "$#" -gt 0 ]; then
    FILES="$@"
else
    FILES=$(find . -name "*.cpp" -not -path "./oboe/*" -not -name "*.bak*" | sort)
fi

FOUND_ERROR=0
TOTAL=0
PASS=0
FAIL=0

echo "════════════════════════════════════════════════════"
echo "  Running clangd sanity check..."
echo "════════════════════════════════════════════════════"
echo ""

for f in $FILES; do
    TOTAL=$((TOTAL+1))
    printf "  [%2d] %-50s " "$TOTAL" "$f"

    # Timeout 30s per file (anti-hang)
    out=$(timeout 30 clangd --check="$f" 2>&1 | \
          grep -E "no member|error:|undeclared|does not name a type|expected ';'" || true)

    if [ -n "$out" ]; then
        echo "❌"
        echo ""
        echo "  === $f ==="
        echo "$out" | sed 's/^/  /'
        echo ""
        FOUND_ERROR=1
        FAIL=$((FAIL+1))
    else
        echo "✅"
        PASS=$((PASS+1))
    fi
done

echo ""
echo "════════════════════════════════════════════════════"
echo "  Files checked: $TOTAL"
echo "  Passed:        $PASS"
echo "  Failed:        $FAIL"
echo "════════════════════════════════════════════════════"

if [ "$FOUND_ERROR" -eq 0 ]; then
    echo "✅ No real errors found."
    exit 0
else
    echo "❌ Errors found above — fix before committing."
    exit 1
fi 
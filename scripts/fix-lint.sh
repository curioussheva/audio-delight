#!/bin/bash
# fix-lint-final.sh — Fix sisa 5 warnings terakhir
# Jalankan dari root project: bash fix-lint-final.sh

set -e
ROOT="$(pwd)/src"

echo "🔧 Fixing last 5 warnings..."

# settings.tsx baris 49 — catch (error) → catch
# settings.tsx baris 71 — handleExclusiveToggle tidak dipakai → prefix _
FILE="$ROOT/app/(drawer)/settings.tsx"
if [ -f "$FILE" ]; then
  sed -i '49s/catch (error) {/catch {/' "$FILE"
  sed -i 's/const handleExclusiveToggle = /const _handleExclusiveToggle = /' "$FILE"
  echo "✅ settings.tsx"
fi

# player/index.tsx — hapus import useTheme (variablenya sudah dihapus sebelumnya)
FILE="$ROOT/app/player/index.tsx"
if [ -f "$FILE" ]; then
  sed -i '/^import { useTheme } from "@\/context\/ThemeContext";$/d' "$FILE"
  echo "✅ player/index.tsx"
fi

# library.tsx baris 122 — catch (e) → catch
FILE="$ROOT/app/(tabs)/library.tsx"
if [ -f "$FILE" ]; then
  sed -i '122s/catch (e) {/catch {/' "$FILE"
  echo "✅ library.tsx"
fi

# _layout.tsx — hapus Href dari import expo-router
FILE="$ROOT/app/_layout.tsx"
if [ -f "$FILE" ]; then
  sed -i 's/useRouter, Href }/useRouter }/' "$FILE"
  sed -i 's/useRouter, Href,/useRouter,/' "$FILE"
  echo "✅ _layout.tsx"
fi

echo ""
echo "✅ Done! Final check..."
yarn lint && npx tsc --noEmit
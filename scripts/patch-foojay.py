#!/usr/bin/env python3
"""Patch RN gradle-plugin: hapus foojay-resolver-convention (CI-only).

Format plugin bervariasi antar versi RN gradle-plugin:
  - satu baris:  plugins { id("...foojay-resolver-convention").version("0.5.0") }
  - dua baris:   id("org.gradle.toolchains.foojay-resolver-convention") version "0.5.0"

Kedua bentuk harus ditangani, kalau tidak CI gagal dengan pattern-mismatch
padahal patchnya sendiri yang tidak lengkap.
"""
import re
import sys
from pathlib import Path

FILE = Path("node_modules/@react-native/gradle-plugin/settings.gradle.kts")

if not FILE.exists():
    print(f"❌ File tidak ditemukan: {FILE}")
    sys.exit(1)

src = FILE.read_text()

if "foojay-resolver-convention" not in src:
    print("✅ Already patched (foojay tidak ada)")
    sys.exit(0)

PATCHED = "# foojay removed for CI"

# Bentuk satu baris: plugins { id("...foojay...").version("x.y.z") }
new_src = re.sub(
    r'plugins\s*\{\s*id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)\.version\("[^"]*"\)\s*\}',
    PATCHED,
    src,
)

# Bentuk dua baris: id("...foojay...")\n  version "x.y.z"
if new_src == src:
    new_src = re.sub(
        r'[ \t]*id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)(\s+version\s+"[^"]*")?[ \t]*\n',
        f"{PATCHED}\n",
        src,
    )

# Bentuk minimal: id("...foojay...") tanpa version
if new_src == src:
    new_src = re.sub(
        r'[ \t]*id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)[ \t]*',
        PATCHED,
        src,
    )

if new_src == src:
    print("⚠️  Pattern tidak match — cek manual")
    sys.exit(1)

FILE.write_text(new_src)
print("✅ Patched foojay-resolver-convention")

#!/usr/bin/env python3
"""Patch RN gradle-plugin: nonaktifkan foojay-resolver-convention (CI-only).

File target adalah **Kotlin** (`settings.gradle.kts`), jadi komentar harus
`//`, bukan `#`. Menulis `# ...` membuat file gagal dikompilasi dengan
"Expecting an element" - kegagalan yang membingungkan karena terlihat
seperti masalah Gradle, padahal patch-nya sendiri yang merusak file.

Format plugin bervariasi antar versi RN gradle-plugin:
  - satu baris:  plugins { id("...foojay-resolver-convention").version("0.5.0") }
  - dua baris:   id("org.gradle.toolchains.foojay-resolver-convention") version "0.5.0"

Semua bentuk harus ditangani, dan hasilnya divalidasi sebelum ditulis.
"""
import re
import sys
from pathlib import Path

FILE = Path("node_modules/@react-native/gradle-plugin/settings.gradle.kts")

# Komentar Kotlin, BUKAN Python. Ini penyebab kegagalan CI sebelumnya.
PATCHED = "// foojay-resolver-convention removed for CI"

if not FILE.exists():
    print(f"File tidak ditemukan: {FILE}")
    sys.exit(1)

src = FILE.read_text()

# Deteksi "sudah dipatch": plugin aktif tidak ada lagi. Hanya cek substring
# mentah akan salah, karena komentar hasil patch kita sendiri memuat nama
# plugin itu.
aktif = [
    l
    for l in src.splitlines()
    if "foojay-resolver-convention" in l and not l.strip().startswith("//")
]
if not aktif:
    print("Already patched (tidak ada deklarasi plugin foojay yang aktif)")
    sys.exit(0)

# Bentuk satu baris: plugins { id("...foojay...").version("x.y.z") }
new_src = re.sub(
    r'plugins\s*\{\s*id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)\.version\("[^"]*"\)\s*\}',
    PATCHED,
    src,
)

# Bentuk dua baris: id("...foojay...") + version "x.y.z" di baris berikut
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
    print("â ï¸  Pattern tidak match â cek manual")
    sys.exit(1)

# --- Validasi sebelum menulis ---------------------------------------------
# Jangan pernah menulis file .kts yang tidak bisa dikompilasi.
if "foojay-resolver-convention" in new_src:
    # Masih ada sisa referensi di luar baris komentar -> patch tidak lengkap
    sisa = [
        (i + 1, l)
        for i, l in enumerate(new_src.splitlines())
        if "foojay-resolver-convention" in l and not l.strip().startswith("//")
    ]
    if sisa:
        print("â Masih ada referensi foojay yang tidak ter-patch:")
        for n, l in sisa:
            print(f"     {n}: {l.strip()}")
        sys.exit(1)

# Tidak boleh ada komentar bergaya Python masuk ke file Kotlin
if re.search(r'^\s*#', new_src, re.M):
    print("â Hasil patch mengandung komentar '#' â itu sintaks Python, bukan Kotlin.")
    print("   File .kts akan gagal dikompilasi. Membatalkan.")
    sys.exit(1)

FILE.write_text(new_src)
print("â Patched foojay-resolver-convention")
